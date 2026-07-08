from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from youtube_transcript_api import YouTubeTranscriptApi, NoTranscriptFound, TranscriptsDisabled
import re
import urllib.request
import json
import requests
import sqlite3
import hashlib

import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE = os.path.join(BASE_DIR, "users.db")

def init_db():
    conn = sqlite3.connect(DATABASE)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            tier TEXT DEFAULT 'PRO WRITER',
            avatar_url TEXT
        )
    """)
    conn.commit()
    conn.close()

# Initialize SQLite database
init_db()

USER_VOICE_PROFILE = {
    "catchphrases": ["Socio", "Uff", "Literal", "Brutal", "Actually", "Insane"],
    "pacing": {
        "wpm": "160-180",
        "description": "Punchy & Fast-Paced",
        "raw_wpm": 170
    },
    "structuralPatterns": [
        {"id": "pat-1", "text": "Hooks within first 15s consistently identified.", "completed": True},
        {"id": "pat-2", "text": "Retention peaks every 2.5 mins (Visual B-Roll pattern).", "completed": True},
        {"id": "pat-3", "text": "Outro Call-to-Action pattern identified.", "completed": False}
    ],
    "confidenceLevel": 94
}

app = FastAPI(title="ScriptDNA API", version="1.0.0")

# Configure CORS to bridge the ports between React (5173) and FastAPI (8000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:8000", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Schemas ---

class YouTubeIngestRequest(BaseModel):
    url: str

class VoiceProfileSchema(BaseModel):
    linguistic_pacing: str
    words_per_minute: int
    catchphrases: list[str]
    structural_patterns: list[dict] = None

class ScriptGenerateRequest(BaseModel):
    prompt: str
    ai_voice_profile: VoiceProfileSchema = None
    target_duration_mins: int = None

class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str

class LoginRequest(BaseModel):
    email: str
    password: str

# --- Helpers ---

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode('utf-8')).hexdigest()

def extract_youtube_video_id(url: str) -> str:
    pattern = r'(?:v=|\/shorts\/|\/embed\/|\/v\/|youtu\.be\/|\/watch\?v=|\/watch\?.+&v=)([^#\&\?]{11})'
    match = re.search(pattern, url)
    if match:
        return match.group(1)
    
    cleaned = url.strip()
    if len(cleaned) == 11 and re.match(r'^[a-zA-Z0-9_-]{11}$', cleaned):
        return cleaned
    
    return None

def fetch_youtube_video_title(video_id: str) -> str:
    url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={video_id}&format=json"
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
        with urllib.request.urlopen(req, timeout=3) as response:
            data = json.loads(response.read().decode('utf-8'))
            return data.get('title', f"YouTube Video: {video_id}")
    except Exception as e:
        print(f"Failed to fetch YouTube title for {video_id}: {e}")
        return f"YouTube Video: {video_id}"

# --- Endpoints ---

@app.get("/")
def read_root():
    return {"status": "ok", "service": "ScriptDNA Backend API"}

@app.post("/api/v1/auth/register")
async def register(payload: RegisterRequest):
    conn = sqlite3.connect(DATABASE)
    cursor = conn.cursor()
    
    # Check if user already exists
    cursor.execute("SELECT id FROM users WHERE email = ?", (payload.email.strip().lower(),))
    if cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=400, detail="An account with this email already exists.")
        
    hashed_pwd = hash_password(payload.password)
    # Premium Google-esque avatar URL
    avatar = "https://lh3.googleusercontent.com/aida-public/AB6AXuDZ6DXquEzAVruY9pQ1fZcJdUIMbBmLcdGyd_2RwR6-Dwsm8m-lXrOTdjHi4lVsrNdyXQk3bjEvAALIUztnloa6U5HrGW3-q8nC-ZdcyD0_OpG61J4PKZHQC5kRXoTQHtEyzBz2ASU-utqQbBlenEEK8qh_Szhny_gx2hLCccszmAoGuve-koZoHhcBlIAD5ObWPpPe4aQJnWoywryetbqUQ_gP3-AwS5JoZqQ_6to5IJr82u7vS6vFn-9V73h05Kgqi-z4LxlC0g"
    
    try:
        cursor.execute(
            "INSERT INTO users (name, email, password, tier, avatar_url) VALUES (?, ?, ?, ?, ?)",
            (payload.name.strip(), payload.email.strip().lower(), hashed_pwd, "BYOK LICENSE", avatar)
        )
        conn.commit()
        
        cursor.execute("SELECT name, email, tier, avatar_url FROM users WHERE email = ?", (payload.email.strip().lower(),))
        user = cursor.fetchone()
        conn.close()
        
        return {
            "success": True,
            "user": {
                "name": user[0],
                "email": user[1],
                "tier": user[2],
                "avatarUrl": user[3]
            }
        }
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=500, detail=f"Database registration failure: {str(e)}")

@app.post("/api/v1/auth/login")
async def login(payload: LoginRequest):
    conn = sqlite3.connect(DATABASE)
    cursor = conn.cursor()
    
    cursor.execute(
        "SELECT name, email, password, tier, avatar_url FROM users WHERE email = ?",
        (payload.email.strip().lower(),)
    )
    user = cursor.fetchone()
    conn.close()
    
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password.")
        
    stored_hash = user[2]
    input_hash = hash_password(payload.password)
    
    if stored_hash != input_hash:
        raise HTTPException(status_code=401, detail="Invalid email or password.")
        
    return {
        "success": True,
        "user": {
            "name": user[0],
            "email": user[1],
            "tier": user[3],
            "avatarUrl": user[4]
        }
    }

@app.post("/api/v1/training/ingest-youtube")
async def ingest_youtube(payload: YouTubeIngestRequest, request: Request):
    video_id = extract_youtube_video_id(payload.url)
    if not video_id:
        raise HTTPException(
            status_code=400, 
            detail="Invalid YouTube URL. Could not extract 11-character video ID."
        )
    
    title = fetch_youtube_video_title(video_id)
    
    gemini_key = request.headers.get("X-Gemini-API-Key") or request.headers.get("X-Gemini-Key")
    
    try:
        try:
            api = YouTubeTranscriptApi()
            transcript_list_obj = api.list(video_id)
            try:
                # Try Spanish first, then fallback to English
                transcript = transcript_list_obj.find_transcript(['es', 'en'])
            except Exception:
                # Fallback: grab any auto-generated or manually created transcript available
                try:
                    transcript = next(iter(transcript_list_obj))
                except StopIteration:
                    raise NoTranscriptFound(video_id)
            transcript_list = transcript.fetch()
        except (NoTranscriptFound, TranscriptsDisabled):
            raise HTTPException(
                status_code=400,
                detail="Este video no cuenta con subtítulos habilitados en ningún idioma."
            )
        except Exception as transcript_err:
            raise HTTPException(
                status_code=400,
                detail=f"No se pudieron cargar los subtítulos del video: {str(transcript_err)}"
            )
        
        full_text = " ".join([item.text for item in transcript_list])
        word_count = len(full_text.split())
        
        duration_sec = 0
        if transcript_list:
            last_item = transcript_list[-1]
            duration_sec = last_item.start + last_item.duration
        
        minutes = int(duration_sec // 60)
        seconds = int(duration_sec % 60)
        duration_str = f"{minutes}:{seconds:02d} mins transcribed" if duration_sec > 0 else f"{word_count:,} words transcribed"

        analysis = None
        if gemini_key:
            try:
                analysis_prompt = f"""
                Analyze the following transcript of a creator's video to extract their linguistic signature.
                Determine:
                1. Linguistic pacing (e.g. 'Punchy & Fast-Paced', 'Slow & Explanatory').
                2. Words per minute (estimate from the text).
                3. Key catchphrases or frequently repeated signatures/words (e.g. "Socio", "Uff", "Brutal", "Literal", "Actually", "Insane"). Output up to 8 of them.
                4. Structural habits (has early hooks, time interval of peaks, outro style).
                5. Confidence level of your analysis (0-100).
                
                Transcript:
                {full_text[:4000]}
                """

                schema = {
                    "type": "OBJECT",
                    "properties": {
                        "linguistic_pacing": {"type": "STRING"},
                        "words_per_minute": {"type": "INTEGER"},
                        "catchphrases": {
                            "type": "ARRAY",
                            "items": {"type": "STRING"}
                        },
                        "structural_patterns": {
                            "type": "OBJECT",
                            "properties": {
                                "has_early_hooks": {"type": "BOOLEAN"},
                                "retention_peak_interval_mins": {"type": "NUMBER"},
                                "outro_style": {"type": "STRING"}
                            },
                            "required": ["has_early_hooks", "retention_peak_interval_mins", "outro_style"]
                        },
                        "confidence_level": {"type": "INTEGER"}
                    },
                    "required": ["linguistic_pacing", "words_per_minute", "catchphrases", "structural_patterns", "confidence_level"]
                }

                gemini_payload = {
                    "contents": [{"parts": [{"text": analysis_prompt}]}],
                    "generationConfig": {
                        "responseMimeType": "application/json",
                        "responseSchema": schema
                    }
                }

                models_to_try = ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro"]
                for model_name in models_to_try:
                    gemini_url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent"
                    headers = {
                        "Content-Type": "application/json",
                        "x-goog-api-key": gemini_key
                    }
                    try:
                        print(f"Attempting source analysis with model: {model_name}...")
                        res = requests.post(gemini_url, json=gemini_payload, headers=headers, timeout=15)
                        if res.status_code == 200:
                            candidates = res.json().get("candidates", [])
                            if candidates:
                                text_out = candidates[0]["content"]["parts"][0]["text"]
                                analysis = json.loads(text_out)
                                break
                            else:
                                print(f"Model {model_name} returned empty candidates.")
                        else:
                            print(f"Model {model_name} failed with status {res.status_code}: {res.text}")
                    except Exception as try_err:
                        print(f"Model {model_name} exception: {try_err}")
            except Exception as gem_ex:
                print(f"Gemini API analysis failed completely: {gem_ex}")
        
        # 1. Math-based WPM calculation
        duration_mins = (duration_sec / 60.0) if duration_sec > 0 else 1.0
        calculated_wpm = int(word_count / duration_mins)
        if calculated_wpm < 50:
            calculated_wpm = 150
        elif calculated_wpm > 300:
            calculated_wpm = 170
            
        # 2. Clean Frequency Counter for Catchphrases
        stop_words = {'que', 'el', 'un', 'los', 'para', 'como', 'de', 'y', 'a', 'la', 'en', 'es', 'del', 'al', 'se', 'por', 'con', 'no', 'mi', 'su', 'o', 'lo', 'si', 'sus', 'me', 'le', 'te', 'nos', 'este', 'esta', 'estos', 'estas', 'una', 'unas', 'unos', 'bien', 'muy', 'pero', 'mas', 'más', 'o', 'u', 'porqué', 'porque'}
        words = re.findall(r'[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]{3,}', full_text.lower())
        filtered_words = [w for w in words if w not in stop_words]
        
        from collections import Counter
        word_counts = Counter(filtered_words)
        top_keywords = [w.capitalize() for w, count in word_counts.most_common(6)]
        if len(top_keywords) < 3:
            top_keywords = ["Socio", "Uff", "Literal", "Brutal"]
            
        # 3. Override or initialize analysis data with authentic math results
        if not analysis:
            analysis = {
                "linguistic_pacing": "Punchy & Fast-Paced" if calculated_wpm > 160 else "Slow & Explanatory",
                "words_per_minute": calculated_wpm,
                "catchphrases": top_keywords,
                "structural_patterns": {
                    "has_early_hooks": True,
                    "retention_peak_interval_mins": 2.5,
                    "outro_style": "Short CTA with custom catchphrase"
                },
                "confidence_level": 94
            }
        else:
            analysis["words_per_minute"] = calculated_wpm
            analysis["catchphrases"] = top_keywords
            
        # 4. Update the global profile state
        USER_VOICE_PROFILE["catchphrases"] = top_keywords
        USER_VOICE_PROFILE["pacing"]["raw_wpm"] = calculated_wpm
        USER_VOICE_PROFILE["pacing"]["wpm"] = f"{calculated_wpm - 10}-{calculated_wpm + 10}"
        USER_VOICE_PROFILE["pacing"]["description"] = analysis.get("linguistic_pacing", "Punchy & Fast-Paced")
        USER_VOICE_PROFILE["confidenceLevel"] = analysis.get("confidence_level", 94)
        
        peak_val = analysis.get("structural_patterns", {}).get("retention_peak_interval_mins", 2.5)
        USER_VOICE_PROFILE["structuralPatterns"] = [
            {"id": "pat-1", "text": "Hooks within first 15s consistently identified.", "completed": analysis.get("structural_patterns", {}).get("has_early_hooks", True)},
            {"id": "pat-2", "text": f"Retention peaks every {peak_val} mins (Visual B-Roll pattern).", "completed": True},
            {"id": "pat-3", "text": f"Outro style: {analysis.get('structural_patterns', {}).get('outro_style', 'Short CTA with custom catchphrase')}", "completed": True}
        ]

        return {
            "success": True,
            "source": {
                "id": f"yt-{video_id}",
                "name": title,
                "type": "youtube",
                "status": "Indexed",
                "metrics": duration_str,
                "timestamp": "07/08/2026"
            },
            "transcript": full_text,
            "word_count": word_count,
            "analysis": analysis
        }
    except HTTPException as http_ex:
        raise http_ex
    except Exception as e:
        error_msg = str(e)
        print(f"Failed to fetch YouTube transcript: {error_msg}")
        raise HTTPException(
            status_code=400, 
            detail=f"Caption extraction failed. Captions may be disabled or unavailable: {error_msg.splitlines()[0]}"
        )

@app.post("/api/v1/scripts/generate")
async def generate_script(payload: ScriptGenerateRequest, request: Request):
    gemini_key = request.headers.get("X-Gemini-API-Key") or request.headers.get("X-Gemini-Key")
    
    if gemini_key:
        print(f"Active API Key Received: {gemini_key[:6]}...")
    else:
        print("Active API Key Received: None")
        raise HTTPException(
            status_code=400,
            detail="Missing Gemini API Key. Please configure and save your API Key in Settings first."
        )
    
    pacing_desc = "Punchy & Fast-Paced"
    wpm = 170
    catchphrases = ["Socio", "Uff", "Brutal", "Literal"]
    peak_mins = 2.5
    
    if payload.ai_voice_profile:
        pacing_desc = payload.ai_voice_profile.linguistic_pacing
        wpm = payload.ai_voice_profile.words_per_minute
        catchphrases = payload.ai_voice_profile.catchphrases
        
        if payload.ai_voice_profile.structural_patterns:
            for pat in payload.ai_voice_profile.structural_patterns:
                text = pat.get("text", "")
                match = re.search(r"(\d+(?:\.\d+)?)\s*mins?", text, re.IGNORECASE)
                if match:
                    try:
                        peak_mins = float(match.group(1))
                        break
                    except Exception:
                        pass

    catchphrases_str = ", ".join(catchphrases)
    
    target_dur = payload.target_duration_mins or 5
    target_words = int(target_dur * wpm)
    
    system_instruction = f"""You are an elite scriptwriter. You must write a YouTube script based on the user's prompt. 
CRITICAL STYLE RULES TO IMITATE THE CREATOR:
- Your tone and pacing must be strictly: {pacing_desc} (~{wpm} WPM).
- You MUST naturally sprinkle the following exact catchphrases throughout the text as transition elements or fillers: {catchphrases_str}.
- Structure: Ensure you include an intense hook in the first 15 seconds, and respect a peak retention pacing interval of {peak_mins} minutes.
- Constraint: The total word count of all generated blocks combined MUST be strictly around {target_words} words to guarantee an exact presentation time of {target_dur} minutes based on the creator's actual speech velocity."""
    
    prompt_text = f"""
    Write a YouTube script about: {payload.prompt}. 
    
    Split the generated script into 4 to 8 blocks. Identify 2 of them as high viral clip candidates.
    Ensure you follow the strict output schema containing the title, estimated_duration_mins, and blocks.
    """
    
    schema = {
        "type": "OBJECT",
        "properties": {
            "title": {"type": "STRING"},
            "estimated_duration_mins": {"type": "NUMBER"},
            "blocks": {
                "type": "ARRAY",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "text": {"type": "STRING"},
                        "is_viral_candidate": {"type": "BOOLEAN"},
                        "clip_metadata": {
                            "type": "OBJECT",
                            "properties": {
                                "short_title": {"type": "STRING"},
                                "duration_shorts": {"type": "STRING"},
                                "suggested_hook": {"type": "STRING"}
                            },
                            "required": ["short_title", "duration_shorts", "suggested_hook"]
                        }
                    },
                    "required": ["text", "is_viral_candidate"]
                }
            }
        },
        "required": ["title", "estimated_duration_mins", "blocks"]
    }

    gemini_payload = {
        "contents": [{"parts": [{"text": prompt_text}]}],
        "systemInstruction": {"parts": [{"text": system_instruction}]},
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseSchema": schema
        }
    }
    
    models_to_try = ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro"]
    last_err = None
    
    for model_name in models_to_try:
        gemini_url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent"
        headers = {
            "Content-Type": "application/json",
            "x-goog-api-key": gemini_key
        }
        try:
            print(f"Attempting script generation with model: {model_name}...")
            res = requests.post(gemini_url, json=gemini_payload, headers=headers, timeout=30)
            if res.status_code == 200:
                candidates = res.json().get("candidates", [])
                if not candidates:
                    raise Exception("Empty candidate list returned by Gemini.")
                    
                text_out = candidates[0]["content"]["parts"][0]["text"]
                generated_json = json.loads(text_out)
                
                return {
                    "success": True,
                    "script": generated_json
                }
            else:
                last_err = f"Model {model_name} returned status {res.status_code}: {res.text}"
                print(last_err)
        except Exception as try_err:
            last_err = f"Model {model_name} error: {str(try_err)}"
            print(last_err)
            
    # If both models failed
    raise HTTPException(
        status_code=500,
        detail=f"Linguistic script writer failed. Gemini API responses: {last_err}"
    )

# Mock upload route
@app.post("/api/v1/training/upload-file")
async def upload_file():
    return {
        "success": True,
        "source": {
            "id": "src-mock-upload",
            "name": "Uploaded_Script_Doc.txt",
            "type": "file",
            "status": "Indexed",
            "metrics": "1,540 words analyzed",
            "timestamp": "07/08/2026"
        }
    }

@app.get("/api/v1/profile/voice-dna")
async def get_voice_dna():
    return USER_VOICE_PROFILE
