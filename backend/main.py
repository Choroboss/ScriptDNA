from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from youtube_transcript_api import YouTubeTranscriptApi
import re
import urllib.request
import json
import requests

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

# --- Helpers ---

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

@app.post("/api/v1/training/ingest-youtube")
async def ingest_youtube(payload: YouTubeIngestRequest, request: Request):
    video_id = extract_youtube_video_id(payload.url)
    if not video_id:
        raise HTTPException(
            status_code=400, 
            detail="Invalid YouTube URL. Could not extract 11-character video ID."
        )
    
    title = fetch_youtube_video_title(video_id)
    
    # Read Gemini key from headers
    gemini_key = request.headers.get("X-Gemini-API-Key") or request.headers.get("X-Gemini-Key")
    
    try:
        # Retrieve transcript with Spanish ('es') preference, falling back to English ('en')
        transcript_list = YouTubeTranscriptApi.get_transcript(video_id, languages=['es', 'en'])
        full_text = " ".join([item['text'] for item in transcript_list])
        word_count = len(full_text.split())
        
        duration_sec = 0
        if transcript_list:
            last_item = transcript_list[-1]
            duration_sec = last_item.get('start', 0) + last_item.get('duration', 0)
        
        minutes = int(duration_sec // 60)
        seconds = int(duration_sec % 60)
        duration_str = f"{minutes}:{seconds:02d} mins transcribed" if duration_sec > 0 else f"{word_count:,} words transcribed"

        # Execute Gemini analysis if key is available
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
                {full_text[:4000]}  # limit text length for safety
                """

                gemini_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key={gemini_key}"
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
                
                res = requests.post(gemini_url, json=gemini_payload, timeout=10)
                if res.status_code == 200:
                    candidates = res.json().get("candidates", [])
                    if candidates:
                        text_out = candidates[0]["content"]["parts"][0]["text"]
                        analysis = json.loads(text_out)
            except Exception as gem_ex:
                print(f"Gemini API analysis failed: {gem_ex}")
        
        # Default fallback mock analysis if Gemini key was missing or request failed
        if not analysis:
            analysis = {
                "linguistic_pacing": "Punchy & Fast-Paced",
                "words_per_minute": 172,
                "catchphrases": ["Socio", "Uff", "Literal", "Brutal", "Actually", "Insane"],
                "structural_patterns": {
                    "has_early_hooks": True,
                    "retention_peak_interval_mins": 2.5,
                    "outro_style": "Short CTA with custom catchphrase"
                },
                "confidence_level": 94
            }

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
    except Exception as e:
        error_msg = str(e)
        print(f"Failed to fetch YouTube transcript: {error_msg}")
        raise HTTPException(
            status_code=400, 
            detail=f"Caption extraction failed. Captions may be disabled or unavailable: {error_msg.splitlines()[0]}"
        )

@app.post("/api/v1/scripts/generate")
async def generate_script(payload: ScriptGenerateRequest, request: Request):
    # Read Gemini key from headers
    gemini_key = request.headers.get("X-Gemini-API-Key") or request.headers.get("X-Gemini-Key")
    
    # Load voice profile parameters
    pacing_desc = "Punchy & Fast-Paced"
    catchphrases = ["Socio", "Uff", "Brutal", "Literal"]
    if payload.ai_voice_profile:
        pacing_desc = payload.ai_voice_profile.linguistic_pacing
        catchphrases = payload.ai_voice_profile.catchphrases
        
    catchphrases_str = ", ".join([f'"{c}"' for c in catchphrases])
    
    generated_json = None
    
    if gemini_key:
        try:
            system_instruction = "You are a Linguistic Engineer and elite YouTube Scriptwriter. Your task is to write a highly engaging YouTube script based on the user's prompt, incorporating their unique style signatures (catchphrases, structural patterns, and pacing) naturally. You must also segment the script into blocks, identifying sections that have high viral retention potential to be extracted as standalone Shorts."
            
            prompt_text = f"""
            Write a YouTube script about: {payload.prompt}. 
            
            Linguistic style parameters:
            - Pacing Style: {pacing_desc}
            - Catchphrases to use naturally: {catchphrases_str}
            
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

            gemini_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key={gemini_key}"
            gemini_payload = {
                "contents": [{"parts": [{"text": prompt_text}]}],
                "systemInstruction": {"parts": [{"text": system_instruction}]},
                "generationConfig": {
                    "responseMimeType": "application/json",
                    "responseSchema": schema
                }
            }
            
            res = requests.post(gemini_url, json=gemini_payload, timeout=20)
            if res.status_code == 200:
                candidates = res.json().get("candidates", [])
                if candidates:
                    text_out = candidates[0]["content"]["parts"][0]["text"]
                    generated_json = json.loads(text_out)
        except Exception as gem_ex:
            print(f"Gemini script generation failed: {gem_ex}")
            
    # Mock fallback if Gemini key was missing or request failed
    if not generated_json:
        generated_json = {
            "title": f"The Rise and Fall of Dreamcast ({payload.prompt[:25]})",
            "estimated_duration_mins": 12.45,
            "blocks": [
                {
                    "text": "[0:00] INT. NEON-LIT STUDIO - NIGHT\n\nThe year is 1999. Sega is about to make the biggest gamble in gaming history. They called it the Dreamcast. Socio, this machine was ahead of its time, but a storm named PlayStation 2 was brewing on the horizon.",
                    "is_viral_candidate": False
                },
                {
                    "text": "[0:45] Ever wonder why the best console failed? Sega made one fatal error. They created the perfect machine for the future, but forgot they had to sell it in the present. They built the bridge to online gaming, but PlayStation 2 promised to play DVDs. And in 2000? A DVD player was worth its weight in gold. Literal madness. The Dreamcast brought a modem to a movie fight.",
                    "is_viral_candidate": True,
                    "clip_metadata": {
                        "short_title": "The Fatal Error Sega Made",
                        "duration_shorts": "0:45s",
                        "suggested_hook": "This one mistake killed Sega forever..."
                    }
                },
                {
                    "text": "Let's back up to the Japanese launch. The initial stock shortages weren't a marketing ploy; they were a catastrophic manufacturing bottleneck with the PowerVR2 chip. Uff, Sega was bleeding cash.",
                    "is_viral_candidate": False
                },
                {
                    "text": "[2:15] The date every gamer remembers: September 9, 1999. 9-9-99. The American launch was a masterclass in hype. They sold over 225,000 units in 24 hours, making $98 million. It was the biggest 24 hours in entertainment retail history. Brutal. But the hype couldn't save them from Tokyo's structural debt.",
                    "is_viral_candidate": True,
                    "clip_metadata": {
                        "short_title": "9-9-99: The Launch Day",
                        "duration_shorts": "0:38s",
                        "suggested_hook": "The biggest 24 hours in gaming history..."
                    }
                },
                {
                    "text": "Shenmue, arguably the crown jewel of the system, cost a staggering $47 million to produce. Yu Suzuki's masterpiece was pushing boundaries that wouldn't become standard for another decade. Insane pacing, but a massive anchor.",
                    "is_viral_candidate": False
                }
            ]
        }
        
    return {
        "success": True,
        "script": generated_json
    }

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
    return {
        "catchphrases": ["Socio", "Uff", "Literal", "Brutal", "Actually", "Insane"],
        "pacing": {
            "wpm": "160-180",
            "description": "Punchy & Fast-Paced"
        },
        "structuralPatterns": [
            {"id": "pat-1", "text": "Hooks within first 15s consistently identified.", "completed": True},
            {"id": "pat-2", "text": "Retention peaks every 2.5 mins (Visual B-Roll pattern).", "completed": True},
            {"id": "pat-3", "text": "Outro Call-to-Action pattern identified.", "completed": False}
        ],
        "confidenceLevel": 94
    }
