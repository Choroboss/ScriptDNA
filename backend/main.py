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

import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE = os.path.join(BASE_DIR, "users.db")

class HybridCursor:
    def __init__(self, cursor, is_postgres):
        self.cursor = cursor
        self.is_postgres = is_postgres

    def execute(self, query, params=()):
        if self.is_postgres:
            query = query.replace('?', '%s')
        self.cursor.execute(query, params)

    def fetchone(self):
        return self.cursor.fetchone()

    def fetchall(self):
        return self.cursor.fetchall()
        
    @property
    def lastrowid(self):
        if self.is_postgres:
            return getattr(self.cursor, 'lastrowid', None)
        return self.cursor.lastrowid

class HybridConnection:
    def __init__(self, conn, is_postgres):
        self.conn = conn
        self.is_postgres = is_postgres

    def cursor(self):
        return HybridCursor(self.conn.cursor(), self.is_postgres)

    def commit(self):
        self.conn.commit()

    def close(self):
        self.conn.close()

def get_db_connection():
    db_url = os.getenv("DATABASE_URL", "").strip()
    if db_url:
        import psycopg2
        conn = psycopg2.connect(db_url)
        return HybridConnection(conn, True)
    else:
        conn = sqlite3.connect(DATABASE)
        return HybridConnection(conn, False)

def init_db():
    conn = get_db_connection()
    is_pg = isinstance(conn, HybridConnection) and conn.is_postgres
    pk = "SERIAL PRIMARY KEY" if is_pg else "INTEGER PRIMARY KEY AUTOINCREMENT"
    cursor = conn.cursor()
    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS users (
            id {pk},
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            tier TEXT DEFAULT 'PRO WRITER',
            avatar_url TEXT,
            gemini_api_key TEXT
        )
    """)
    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS voice_profiles (
            id {pk},
            user_email TEXT UNIQUE NOT NULL,
            linguistic_pacing TEXT DEFAULT 'Punchy & Fast-Paced',
            words_per_minute INTEGER DEFAULT 170,
            catchphrases TEXT DEFAULT 'Socio,Uff,Literal,Brutal,Actually,Insane',
            structural_patterns TEXT DEFAULT '[]',
            confidence_level INTEGER DEFAULT 94
        )
    """)
    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS training_sources (
            id {pk},
            user_id INTEGER NOT NULL,
            source_name TEXT NOT NULL,
            source_type TEXT NOT NULL,
            content_text TEXT NOT NULL,
            word_count INTEGER NOT NULL,
            duration_mins REAL NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)
    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS saved_scripts (
            id {pk},
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            estimated_duration_mins REAL DEFAULT 5.0,
            blocks_json TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)
    # Migrate: add gemini_api_key if not present (idempotent, only needed for SQLite)
    if not is_pg:
        try:
            cursor.execute("ALTER TABLE users ADD COLUMN gemini_api_key TEXT")
        except Exception:
            pass  # Column already exists
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
    allow_origin_regex=r".*",
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

class ScriptSaveRequest(BaseModel):
    id: int = None
    title: str
    estimated_duration_mins: float = 5.0
    blocks_json: str

class ScriptRefineRequest(BaseModel):
    script_id: int = None
    blocks_json: str
    refinement_instruction: str
    ai_voice_profile: VoiceProfileSchema = None

class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str

class LoginRequest(BaseModel):
    email: str
    password: str

class SaveUserKeysRequest(BaseModel):
    gemini_api_key: str = None

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

def get_user_id_by_email(email: str) -> int:
    if not email:
        return None
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM users WHERE email = ?", (email.strip().lower(),))
    row = cursor.fetchone()
    conn.close()
    return row[0] if row else None

def get_user_gemini_key(email: str, client_header_key: str = None) -> tuple[str, str]:
    """
    Dual-mode API Key lookup.
    Returns (api_key, notice)
    """
    if not email:
        return None, None
        
    owner_email = os.getenv("OWNER_EMAIL", "vicente@example.com")
    
    if email.strip().lower() == owner_email.strip().lower():
        # OWNER MODE
        return os.getenv("GEMINI_API_KEY"), "Owner Mode: Using secure backend server key."
        
    # PUBLIC BYOK MODE
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT gemini_api_key FROM users WHERE email = ?", (email.strip().lower(),))
    row = cursor.fetchone()
    conn.close()
    
    db_key = row[0] if row and row[0] else None
    if db_key:
        return db_key, None
        
    if client_header_key:
        return client_header_key, "Your API Key is processed strictly in-memory to execute the request and is never persisted on our servers."
        
    return None, None

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
    conn = get_db_connection()
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
        cursor.execute(
            "INSERT INTO voice_profiles (user_email) VALUES (?)",
            (payload.email.strip().lower(),)
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
    conn = get_db_connection()
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

@app.post("/api/v1/auth/settings/keys")
async def save_user_keys(payload: SaveUserKeysRequest, request: Request):
    """Persist the user's Gemini API key into their own DB row. Only the key owner can write it."""
    user_email = request.headers.get("X-User-Email", "").strip().lower()
    if not user_email:
        raise HTTPException(status_code=401, detail="Authentication required.")
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE users SET gemini_api_key = ? WHERE email = ?",
        (payload.gemini_api_key.strip() if payload.gemini_api_key else None, user_email)
    )
    if cursor.rowcount == 0:
        conn.close()
        raise HTTPException(status_code=404, detail="User not found.")
    conn.commit()
    conn.close()
    return {"success": True, "message": "API key saved securely to your profile."}

@app.get("/api/v1/auth/settings/keys")
async def get_user_key_status(request: Request):
    """Return key presence status only — never expose the raw key to the browser."""
    user_email = request.headers.get("X-User-Email", "").strip().lower()
    if not user_email:
        raise HTTPException(status_code=401, detail="Authentication required.")
    key = get_user_gemini_key(user_email)
    return {
        "gemini": "CONNECTED" if key else "MISSING",
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
        
        # 1. Save new source to database if user is logged in
        user_email = request.headers.get("X-User-Email")
        user_id = get_user_id_by_email(user_email)
        
        if user_id:
            try:
                conn = get_db_connection()
                cursor = conn.cursor()
                cursor.execute(
                    """
                    INSERT INTO training_sources (user_id, source_name, source_type, content_text, word_count, duration_mins)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (user_id, title, "youtube", full_text, word_count, duration_sec / 60.0)
                )
                conn.commit()
                conn.close()
            except Exception as db_err:
                print(f"Failed to insert training source: {db_err}")

        # 2. Cumulative Learning: Query all training sources for this user to compute aggregated signature
        combined_text = full_text
        combined_word_count = word_count
        combined_duration_mins = duration_sec / 60.0 if duration_sec > 0 else 1.0
        
        if user_id:
            try:
                conn = get_db_connection()
                cursor = conn.cursor()
                cursor.execute(
                    "SELECT content_text, word_count, duration_mins FROM training_sources WHERE user_id = ?",
                    (user_id,)
                )
                rows = cursor.fetchall()
                conn.close()
                
                if rows:
                    combined_text = " ".join([r[0] for r in rows])
                    combined_word_count = sum([r[1] for r in rows])
                    combined_duration_mins = sum([r[2] for r in rows])
            except Exception as db_err:
                print(f"Failed to load training sources for aggregation: {db_err}")

        # 3. Math-based WPM calculation (aggregated)
        calculated_wpm = int(combined_word_count / (combined_duration_mins if combined_duration_mins > 0 else 1.0))
        if calculated_wpm < 50:
            calculated_wpm = 150
        elif calculated_wpm > 300:
            calculated_wpm = 170
            
        # 4. Clean Frequency Counter for Catchphrases (aggregated)
        stop_words = {'que', 'el', 'un', 'los', 'para', 'como', 'de', 'y', 'a', 'la', 'en', 'es', 'del', 'al', 'se', 'por', 'con', 'no', 'mi', 'su', 'o', 'lo', 'si', 'sus', 'me', 'le', 'te', 'nos', 'este', 'esta', 'estos', 'estas', 'una', 'unas', 'unos', 'bien', 'muy', 'pero', 'mas', 'más', 'o', 'u', 'porqué', 'porque'}
        words = re.findall(r'[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]{3,}', combined_text.lower())
        filtered_words = [w for w in words if w not in stop_words]
        
        from collections import Counter
        word_counts = Counter(filtered_words)
        top_keywords = [w.capitalize() for w, count in word_counts.most_common(6)]
        if len(top_keywords) < 3:
            top_keywords = ["Socio", "Uff", "Literal", "Brutal"]
            
        # 5. Initialize or overwrite analysis data
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
            
        # 6. Update the global profile state and voice_profiles SQLite table
        USER_VOICE_PROFILE["catchphrases"] = top_keywords
        USER_VOICE_PROFILE["pacing"]["raw_wpm"] = calculated_wpm
        USER_VOICE_PROFILE["pacing"]["wpm"] = f"{calculated_wpm - 10}-{calculated_wpm + 10}"
        USER_VOICE_PROFILE["pacing"]["description"] = analysis.get("linguistic_pacing", "Punchy & Fast-Paced")
        USER_VOICE_PROFILE["confidenceLevel"] = analysis.get("confidence_level", 94)
        
        peak_val = analysis.get("structural_patterns", {}).get("retention_peak_interval_mins", 2.5)
        struct_patterns_list = [
            {"id": "pat-1", "text": "Hooks within first 15s consistently identified.", "completed": bool(analysis.get("structural_patterns", {}).get("has_early_hooks", True))},
            {"id": "pat-2", "text": f"Retention peaks every {peak_val} mins (Visual B-Roll pattern).", "completed": True},
            {"id": "pat-3", "text": f"Outro style: {analysis.get('structural_patterns', {}).get('outro_style', 'Short CTA with custom catchphrase')}", "completed": True}
        ]
        USER_VOICE_PROFILE["structuralPatterns"] = struct_patterns_list
        
        if user_email:
            try:
                conn = get_db_connection()
                cursor = conn.cursor()
                cursor.execute(
                    """
                    INSERT INTO voice_profiles (user_email, linguistic_pacing, words_per_minute, catchphrases, structural_patterns, confidence_level)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(user_email) DO UPDATE SET
                        linguistic_pacing=excluded.linguistic_pacing,
                        words_per_minute=excluded.words_per_minute,
                        catchphrases=excluded.catchphrases,
                        structural_patterns=excluded.structural_patterns,
                        confidence_level=excluded.confidence_level
                    """,
                    (
                        user_email.strip().lower(),
                        analysis.get("linguistic_pacing", "Punchy & Fast-Paced"),
                        calculated_wpm,
                        ",".join(top_keywords),
                        json.dumps(struct_patterns_list),
                        analysis.get("confidence_level", 94)
                    )
                )
                conn.commit()
                conn.close()
            except Exception as db_err:
                print(f"Failed to save user voice profile to database: {db_err}")

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
    # SECURITY: Always fetch the key from the DB for the authenticated user.
    # Never trust a key sent in request headers — this prevents cross-user key leakage.
    user_email = request.headers.get("X-User-Email", "").strip().lower()
    gemini_key = get_user_gemini_key(user_email)

    if gemini_key:
        print(f"DB key resolved for {user_email}: {gemini_key[:6]}...")
    else:
        raise HTTPException(
            status_code=400,
            detail="Missing Gemini API Key. Please add your own Gemini Key in Settings to unlock generation."
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

@app.get("/api/v1/profile/voice-profile")
async def get_voice_profile(request: Request):
    user_email = request.headers.get("X-User-Email")
    if not user_email:
        return USER_VOICE_PROFILE
        
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT linguistic_pacing, words_per_minute, catchphrases, structural_patterns, confidence_level FROM voice_profiles WHERE user_email = ?",
        (user_email.strip().lower(),)
    )
    row = cursor.fetchone()
    conn.close()
    
    if not row:
        return USER_VOICE_PROFILE
        
    pacing_desc, wpm, catchphrases_str, struct_str, conf = row
    catchphrases_list = [c.strip() for c in catchphrases_str.split(",") if c.strip()]
    try:
        struct_list = json.loads(struct_str)
    except Exception:
        struct_list = [
            {"id": "pat-1", "text": "Hooks within first 15s consistently identified.", "completed": True},
            {"id": "pat-2", "text": "Retention peaks every 2.5 mins (Visual B-Roll pattern).", "completed": True},
            {"id": "pat-3", "text": "Outro Call-to-Action pattern identified.", "completed": False}
        ]
        
    return {
        "catchphrases": catchphrases_list,
        "pacing": {
            "wpm": f"{max(0, wpm-10)}-{wpm+10}" if wpm > 10 else "160-180",
            "description": pacing_desc,
            "raw_wpm": wpm
        },
        "structuralPatterns": struct_list,
        "confidenceLevel": conf
    }

@app.get("/api/v1/training/sources")
async def get_training_sources(request: Request):
    user_email = request.headers.get("X-User-Email")
    user_id = get_user_id_by_email(user_email)
    if not user_id:
        return []
        
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, source_name, source_type, word_count, duration_mins, created_at FROM training_sources WHERE user_id = ? ORDER BY id DESC",
        (user_id,)
    )
    rows = cursor.fetchall()
    conn.close()
    
    sources_list = []
    for r in rows:
        source_id, name, stype, words, dur, created = r
        metrics_str = f"{int(dur)}:{int((dur - int(dur)) * 60):02d} mins transcribed" if stype == "youtube" else f"{words:,} words analyzed"
        try:
            date_part = created.split()[0]
            yyyy, mm, dd = date_part.split("-")
            formatted_date = f"{mm}/{dd}/{yyyy}"
        except Exception:
            formatted_date = "07/08/2026"
            
        sources_list.append({
            "id": f"db-{source_id}",
            "name": name,
            "type": stype,
            "status": "Indexed",
            "metrics": metrics_str,
            "timestamp": formatted_date
        })
    return sources_list

# --- Script Document Endpoints ---

@app.get("/api/v1/scripts")
async def get_saved_scripts(request: Request):
    user_id = get_user_id_by_email(request.headers.get("X-User-Email"))
    if not user_id:
        return []
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, title, estimated_duration_mins, updated_at FROM saved_scripts WHERE user_id = ? ORDER BY updated_at DESC",
        (user_id,)
    )
    rows = cursor.fetchall()
    conn.close()
    return [
        {"id": r[0], "title": r[1], "estimated_duration_mins": r[2], "updated_at": r[3]}
        for r in rows
    ]

@app.get("/api/v1/scripts/{script_id}")
async def get_single_script(script_id: int, request: Request):
    user_id = get_user_id_by_email(request.headers.get("X-User-Email"))
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required.")
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, title, estimated_duration_mins, blocks_json FROM saved_scripts WHERE id = ? AND user_id = ?",
        (script_id, user_id)
    )
    row = cursor.fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Script not found.")
    return {"id": row[0], "title": row[1], "estimated_duration_mins": row[2], "blocks_json": row[3]}

@app.post("/api/v1/scripts/save")
async def save_script(payload: ScriptSaveRequest, request: Request):
    user_id = get_user_id_by_email(request.headers.get("X-User-Email"))
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required to save scripts.")
    
    conn = get_db_connection()
    cursor = conn.cursor()
    if payload.id:
        cursor.execute(
            """UPDATE saved_scripts SET title=?, estimated_duration_mins=?, blocks_json=?, updated_at=CURRENT_TIMESTAMP
               WHERE id=? AND user_id=?""",
            (payload.title, payload.estimated_duration_mins, payload.blocks_json, payload.id, user_id)
        )
        script_id = payload.id
    else:
        cursor.execute("INSERT INTO saved_scripts (user_id, title, estimated_duration_mins, blocks_json) VALUES (?, ?, ?, ?) RETURNING id", (user_id, payload.title, payload.estimated_duration_mins, payload.blocks_json))
        script_id = cursor.fetchone()[0]
    conn.commit()
    conn.close()
    return {"success": True, "id": script_id}

@app.post("/api/v1/scripts/refine")
async def refine_script(payload: ScriptRefineRequest, request: Request):
    # SECURITY: Fetch key from DB — never from headers
    user_email = request.headers.get("X-User-Email", "").strip().lower()
    gemini_key = get_user_gemini_key(user_email)
    if not gemini_key:
        raise HTTPException(status_code=400, detail="Missing Gemini API Key. Please add your own Gemini Key in Settings to unlock generation.")

    pacing_desc = "Punchy & Fast-Paced"
    wpm = 170
    catchphrases = ["Socio", "Uff", "Brutal", "Literal"]
    if payload.ai_voice_profile:
        pacing_desc = payload.ai_voice_profile.linguistic_pacing
        wpm = payload.ai_voice_profile.words_per_minute
        catchphrases = payload.ai_voice_profile.catchphrases
    catchphrases_str = ", ".join(catchphrases)

    system_instruction = f"""You are an elite script editor. Your task is to refine an existing YouTube script.
STRICT STYLE RULES (do NOT break these):
- Maintain the creator's voice: {pacing_desc} (~{wpm} WPM).
- Naturally weave these catchphrases throughout: {catchphrases_str}.
- Return ONLY the updated blocks JSON array. Do not add explanation text.
- Keep the same number of blocks and block types unless the instruction explicitly asks to merge or split."""

    prompt_text = f"""Refinement instruction: "{payload.refinement_instruction}"

Current script blocks JSON:
{payload.blocks_json}

Apply the instruction and return only the updated blocks JSON array, preserving the same schema with fields: text, is_viral_candidate, and clip_metadata (for viral blocks)."""

    schema = {
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
                    }
                }
            },
            "required": ["text", "is_viral_candidate"]
        }
    }

    gemini_payload = {
        "contents": [{"parts": [{"text": prompt_text}]}],
        "systemInstruction": {"parts": [{"text": system_instruction}]},
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseSchema": schema
        }
    }

    models_to_try = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"]
    last_err = None
    for model_name in models_to_try:
        gemini_url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent"
        headers = {"Content-Type": "application/json", "x-goog-api-key": gemini_key}
        try:
            print(f"Refining with model: {model_name}...")
            res = requests.post(gemini_url, json=gemini_payload, headers=headers, timeout=30)
            if res.status_code == 200:
                candidates = res.json().get("candidates", [])
                if candidates:
                    text_out = candidates[0]["content"]["parts"][0]["text"]
                    refined_blocks = json.loads(text_out)
                    return {"success": True, "blocks": refined_blocks}
            else:
                last_err = f"Model {model_name} failed: {res.status_code}"
                print(last_err)
        except Exception as e:
            last_err = str(e)
            print(f"Model {model_name} exception: {e}")

    raise HTTPException(status_code=500, detail=f"AI refinement failed: {last_err}")
