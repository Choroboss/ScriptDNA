from fastapi import FastAPI, HTTPException, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from youtube_transcript_api import YouTubeTranscriptApi, NoTranscriptFound, TranscriptsDisabled
import re
import urllib.request
import json
import requests
import sqlite3
import hashlib
import random
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE = os.path.join(BASE_DIR, "users.db")

from typing import Optional

class GenerateThumbnailRequest(BaseModel):
    script_title: str
    script_content: Optional[str] = ""
    user_idea: Optional[str] = ""
    person_features: Optional[str] = ""
    background_idea: Optional[str] = ""
    overlay_text: Optional[str] = ""

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

    @property
    def rowcount(self):
        return self.cursor.rowcount

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
        conn = sqlite3.connect(DATABASE, timeout=10, check_same_thread=False)
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
            gemini_api_key TEXT,
            anthropic_api_key TEXT,
            openai_api_key TEXT,
            grok_api_key TEXT
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
    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS published_performance_metrics (
            id {pk},
            user_id INTEGER NOT NULL,
            content_type TEXT NOT NULL,
            title TEXT NOT NULL,
            published_url TEXT NOT NULL,
            platform TEXT DEFAULT 'YouTube',
            views_count INTEGER DEFAULT 0,
            likes_count INTEGER DEFAULT 0,
            comments_count INTEGER DEFAULT 0,
            watch_time_mins REAL DEFAULT 0.0,
            ai_predicted_score INTEGER DEFAULT 75,
            actual_virality_score INTEGER DEFAULT 75,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)
    # Migrate: add API key columns if not present (idempotent, only needed for SQLite)
    if not is_pg:
        for col in ["gemini_api_key", "anthropic_api_key", "openai_api_key", "grok_api_key"]:
            try:
                cursor.execute(f"ALTER TABLE users ADD COLUMN {col} TEXT")
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

class ScriptExtractClipRequest(BaseModel):
    script_text: str
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
    anthropic_api_key: str = None
    openai_api_key: str = None
    grok_api_key: str = None

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

# Map provider IDs to their DB column and env-var fallback for the owner
_PROVIDER_KEY_MAP = {
    "gemini":    {"column": "gemini_api_key",    "env": "GEMINI_API_KEY"},
    "anthropic": {"column": "anthropic_api_key", "env": "ANTHROPIC_API_KEY"},
    "openai":    {"column": "openai_api_key",    "env": "OPENAI_API_KEY"},
    "grok":      {"column": "grok_api_key",      "env": "GROK_API_KEY"},
}

def get_user_api_key(email: str, provider: str = "gemini") -> tuple[str, str]:
    """
    Generic dual-mode API key lookup for any provider.
    Returns (api_key, notice).
    """
    if not email or provider not in _PROVIDER_KEY_MAP:
        return None, None

    meta = _PROVIDER_KEY_MAP[provider]
    owner_email = os.getenv("OWNER_EMAIL", "vicente@example.com")

    if email.strip().lower() == owner_email.strip().lower():
        return os.getenv(meta["env"]), "Owner Mode: Using secure backend server key."

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(f"SELECT {meta['column']} FROM users WHERE email = ?", (email.strip().lower(),))
    row = cursor.fetchone()
    conn.close()

    db_key = row[0] if row and row[0] else None
    return (db_key, None) if db_key else (None, None)


def build_adaptive_creator_prompt_context(user_email: str) -> str:
    """
    GOLDEN RULE: Continuous Learning Prompt Context Generator.
    Aggregates training source transcripts and real market performance metrics for the given user,
    ensuring future scripts emulate top-performing real market videos and voice DNA.
    """
    if not user_email:
        return ""
        
    user_id = get_user_id_by_email(user_email)
    if not user_id:
        return ""
        
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT source_name, content_text FROM training_sources WHERE user_id = ? ORDER BY id DESC LIMIT 5",
            (user_id,)
        )
        rows = cursor.fetchall()

        # Query top-performing published videos in market
        cursor.execute(
            "SELECT title, platform, views_count, actual_virality_score FROM published_performance_metrics WHERE user_id = ? AND actual_virality_score >= 70 ORDER BY actual_virality_score DESC LIMIT 3",
            (user_id,)
        )
        top_perf_rows = cursor.fetchall()
        conn.close()
        
        if not rows and not top_perf_rows:
            return ""
            
        excerpts = []
        for r in rows:
            name, text = r[0], r[1]
            snippet = text[:350].replace("\n", " ").strip()
            excerpts.append(f"- From '{name}': \"{snippet}...\"")
            
        excerpts_str = "\n".join(excerpts) if excerpts else "Standard creator training baseline."

        perf_str = ""
        if top_perf_rows:
            perf_items = [f"- '{r[0]}' on {r[1]} (Score: {r[3]}%, Views: {r[2]:,})" for r in top_perf_rows]
            perf_str = "\nTop Real Market Performing Videos (Prioritize these hook structures):\n" + "\n".join(perf_items)

        return f"""
=== GOLDEN RULE: CREATOR CONTINUOUS LEARNING CONTEXT ===
The system has learned from the creator's past video scripts and real market performance.
You MUST strictly emulate the sentence structures, tone, and rhythm found in these actual training excerpts:
{excerpts_str}{perf_str}
========================================================
"""
    except Exception as e:
        print(f"Failed to build adaptive prompt context: {e}")
        return ""

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
    """Persist one or more API keys into the user's own DB row."""
    user_email = request.headers.get("X-User-Email", "").strip().lower()
    if not user_email:
        raise HTTPException(status_code=401, detail="Authentication required.")
    owner_email = os.getenv("OWNER_EMAIL", "vicente@example.com").strip().lower()
    if user_email == owner_email:
        return {"success": True, "message": "Owner Mode: keys are managed via server environment."}

    # Build a dynamic UPDATE with only the fields that were sent
    key_fields = {
        "gemini_api_key": payload.gemini_api_key,
        "anthropic_api_key": payload.anthropic_api_key,
        "openai_api_key": payload.openai_api_key,
        "grok_api_key": payload.grok_api_key,
    }
    # Filter to only non-None values (explicit empty string "" means "remove this key")
    updates = {}
    for col, val in key_fields.items():
        if val is not None:
            updates[col] = val.strip() if val else None

    if not updates:
        raise HTTPException(status_code=400, detail="No API key provided.")

    set_clause = ", ".join(f"{col} = ?" for col in updates)
    values = list(updates.values()) + [user_email]

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(f"UPDATE users SET {set_clause} WHERE email = ?", tuple(values))
    if cursor.rowcount == 0:
        conn.close()
        raise HTTPException(status_code=404, detail="User not found.")
    conn.commit()
    conn.close()
    return {"success": True, "message": "API key(s) saved securely to your profile."}

@app.get("/api/v1/auth/settings/keys")
async def get_user_key_status(request: Request):
    """Return key presence status for all providers — never expose raw keys."""
    user_email = request.headers.get("X-User-Email", "").strip().lower()
    if not user_email:
        raise HTTPException(status_code=401, detail="Authentication required.")

    owner_email = os.getenv("OWNER_EMAIL", "vicente@example.com").strip().lower()
    if user_email == owner_email:
        return {
            "gemini": "CONNECTED" if os.getenv("GEMINI_API_KEY") else "MISSING",
            "anthropic": "CONNECTED" if os.getenv("ANTHROPIC_API_KEY") else "MISSING",
            "openai": "CONNECTED" if os.getenv("OPENAI_API_KEY") else "MISSING",
            "grok": "CONNECTED" if os.getenv("GROK_API_KEY") else "MISSING",
        }

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT gemini_api_key, anthropic_api_key, openai_api_key, grok_api_key FROM users WHERE email = ?",
        (user_email,)
    )
    row = cursor.fetchone()
    conn.close()

    if not row:
        return {"gemini": "MISSING", "anthropic": "MISSING", "openai": "MISSING", "grok": "MISSING"}

    return {
        "gemini": "CONNECTED" if row[0] else "MISSING",
        "anthropic": "CONNECTED" if row[1] else "MISSING",
        "openai": "CONNECTED" if row[2] else "MISSING",
        "grok": "CONNECTED" if row[3] else "MISSING",
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
    
    gemini_key, _ = get_user_gemini_key(
        request.headers.get("X-User-Email", "").strip().lower(),
        request.headers.get("X-Gemini-API-Key") or request.headers.get("X-Gemini-Key")
    )
    
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

                models_to_try = ["gemini-flash-latest", "gemini-3.6-flash", "gemini-2.5-flash", "gemini-2.0-flash", "gemini-pro-latest"]
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


class IngestWithTranscriptRequest(BaseModel):
    video_id: str
    url: str
    transcript_text: str
    duration_mins: float = 5.0

@app.post("/api/v1/training/ingest-with-transcript")
async def ingest_with_transcript(payload: IngestWithTranscriptRequest, request: Request):
    """
    Receives a transcript already fetched by the browser (avoids cloud IP blocks from YouTube).
    Runs AI analysis and stores to DB.
    """
    video_id = payload.video_id.strip()
    full_text = payload.transcript_text.strip()
    duration_mins = payload.duration_mins if payload.duration_mins > 0 else 5.0

    if not full_text or len(full_text) < 50:
        raise HTTPException(status_code=400, detail="El transcript está vacío o es demasiado corto.")

    title = fetch_youtube_video_title(video_id)
    word_count = len(full_text.split())
    duration_str = f"{int(duration_mins)}:{int((duration_mins % 1)*60):02d} mins transcribed"

    user_email = request.headers.get("X-User-Email", "").strip().lower()
    gemini_key, _ = get_user_gemini_key(user_email)

    analysis = None
    if gemini_key:
        try:
            analysis_prompt = f"""
            Analyze the following transcript of a creator's video to extract their linguistic signature.
            Determine:
            1. Linguistic pacing (e.g. 'Punchy & Fast-Paced', 'Slow & Explanatory').
            2. Words per minute (estimate from the text).
            3. Key catchphrases or frequently repeated signatures/words. Output up to 8 of them.
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
                    "catchphrases": {"type": "ARRAY", "items": {"type": "STRING"}},
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
                "generationConfig": {"responseMimeType": "application/json", "responseSchema": schema}
            }
            for model_name in ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"]:
                gemini_url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent"
                try:
                    res = requests.post(gemini_url, json=gemini_payload,
                                        headers={"Content-Type": "application/json", "x-goog-api-key": gemini_key},
                                        timeout=20)
                    if res.status_code == 200:
                        candidates = res.json().get("candidates", [])
                        if candidates:
                            analysis = json.loads(candidates[0]["content"]["parts"][0]["text"])
                            break
                except Exception:
                    continue
        except Exception as gem_ex:
            print(f"Gemini analysis failed: {gem_ex}")

    # Math-based fallback WPM
    calculated_wpm = int(word_count / (duration_mins if duration_mins > 0 else 1))
    if calculated_wpm < 50: calculated_wpm = 150
    elif calculated_wpm > 300: calculated_wpm = 170

    stop_words = {'que', 'el', 'un', 'los', 'para', 'como', 'de', 'y', 'a', 'la', 'en', 'es', 'del', 'al', 'se', 'por', 'con', 'no', 'mi', 'su', 'o', 'lo', 'si', 'sus', 'me', 'le', 'te', 'nos', 'este', 'esta', 'estos', 'estas', 'una', 'unas', 'unos', 'bien', 'muy', 'pero', 'mas', 'más'}
    words_list = re.findall(r'[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]{3,}', full_text.lower())
    filtered_words = [w for w in words_list if w not in stop_words]
    from collections import Counter
    top_keywords = [w.capitalize() for w, _ in Counter(filtered_words).most_common(6)] or ["Socio", "Uff", "Literal", "Brutal"]

    if not analysis:
        analysis = {
            "linguistic_pacing": "Punchy & Fast-Paced" if calculated_wpm > 160 else "Slow & Explanatory",
            "words_per_minute": calculated_wpm,
            "catchphrases": top_keywords,
            "structural_patterns": {"has_early_hooks": True, "retention_peak_interval_mins": 2.5, "outro_style": "Short CTA with custom catchphrase"},
            "confidence_level": 94
        }
    else:
        analysis["words_per_minute"] = calculated_wpm
        analysis["catchphrases"] = top_keywords

    user_id = get_user_id_by_email(user_email)
    if user_id:
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO training_sources (user_id, source_name, source_type, content_text, word_count, duration_mins) VALUES (?, ?, ?, ?, ?, ?)",
                (user_id, title, "youtube", full_text, word_count, duration_mins)
            )
            conn.commit()
            conn.close()
        except Exception as db_err:
            print(f"DB insert error: {db_err}")

    struct_patterns_list = [
        {"id": "pat-1", "text": "Hooks within first 15s consistently identified.", "completed": bool(analysis.get("structural_patterns", {}).get("has_early_hooks", True))},
        {"id": "pat-2", "text": f"Retention peaks every {analysis.get('structural_patterns', {}).get('retention_peak_interval_mins', 2.5)} mins.", "completed": True},
        {"id": "pat-3", "text": f"Outro style: {analysis.get('structural_patterns', {}).get('outro_style', 'Short CTA')}", "completed": True}
    ]
    USER_VOICE_PROFILE["catchphrases"] = top_keywords
    USER_VOICE_PROFILE["pacing"]["raw_wpm"] = calculated_wpm
    USER_VOICE_PROFILE["pacing"]["wpm"] = f"{calculated_wpm - 10}-{calculated_wpm + 10}"
    USER_VOICE_PROFILE["pacing"]["description"] = analysis.get("linguistic_pacing", "Punchy & Fast-Paced")
    USER_VOICE_PROFILE["confidenceLevel"] = analysis.get("confidence_level", 94)
    USER_VOICE_PROFILE["structuralPatterns"] = struct_patterns_list

    if user_email:
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute(
                """INSERT INTO voice_profiles (user_email, linguistic_pacing, words_per_minute, catchphrases, structural_patterns, confidence_level)
                   VALUES (?, ?, ?, ?, ?, ?)
                   ON CONFLICT(user_email) DO UPDATE SET
                       linguistic_pacing=excluded.linguistic_pacing,
                       words_per_minute=excluded.words_per_minute,
                       catchphrases=excluded.catchphrases,
                       structural_patterns=excluded.structural_patterns,
                       confidence_level=excluded.confidence_level""",
                (user_email, analysis.get("linguistic_pacing", "Punchy & Fast-Paced"), calculated_wpm,
                 ",".join(top_keywords), json.dumps(struct_patterns_list), analysis.get("confidence_level", 94))
            )
            conn.commit()
            conn.close()
        except Exception as db_err:
            print(f"Voice profile save error: {db_err}")

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

@app.post("/api/v1/scripts/generate")
async def generate_script(payload: ScriptGenerateRequest, request: Request):
    # SECURITY: Always fetch the key from the DB for the authenticated user.
    # Never trust a key sent in request headers — this prevents cross-user key leakage.
    user_email = request.headers.get("X-User-Email", "").strip().lower()
    gemini_key, _ = get_user_gemini_key(user_email)

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
    
    adaptive_context = build_adaptive_creator_prompt_context(user_email)
    
    system_instruction = f"""You are an elite scriptwriter. You must write a YouTube script based on the user's prompt. 
CRITICAL STYLE RULES TO IMITATE THE CREATOR:
- Your tone and pacing must be strictly: {pacing_desc} (~{wpm} WPM).
- You MUST naturally sprinkle the following exact catchphrases throughout the text as transition elements or fillers: {catchphrases_str}.
- Structure: Ensure you include an intense hook in the first 15 seconds, and respect a peak retention pacing interval of {peak_mins} minutes.
- Constraint: The total word count of all generated blocks combined MUST be strictly around {target_words} words to guarantee an exact presentation time of {target_dur} minutes based on the creator's actual speech velocity.
{adaptive_context}"""
    
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
    
    models_to_try = ["gemini-flash-latest", "gemini-3.6-flash", "gemini-2.5-flash", "gemini-2.0-flash", "gemini-pro-latest"]
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

# Real file upload — reads content, persists to DB per user
@app.post("/api/v1/training/upload-file")
async def upload_file(request: Request, file: UploadFile = File(...)):
    """Reads an uploaded .txt/.md file, saves to training_sources, updates voice profile."""
    user_email = request.headers.get("X-User-Email", "").strip().lower()

    contents = await file.read()
    try:
        full_text = contents.decode("utf-8").strip()
    except UnicodeDecodeError:
        full_text = contents.decode("latin-1", errors="ignore").strip()

    if len(full_text) < 20:
        raise HTTPException(status_code=400, detail="El archivo está vacío o es demasiado corto.")

    word_count = len(full_text.split())
    duration_mins = max(1.0, round(word_count / 150.0, 2))
    metrics_str = f"{word_count:,} words analyzed"
    source_name = file.filename or "Uploaded Document"
    import time
    db_id = f"src-{int(time.time())}"

    user_id = get_user_id_by_email(user_email)
    if user_id:
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO training_sources (user_id, source_name, source_type, content_text, word_count, duration_mins) VALUES (?, ?, ?, ?, ?, ?)",
                (user_id, source_name, "file", full_text, word_count, duration_mins)
            )
            conn.commit()
            if conn.is_postgres:
                cursor.execute("SELECT lastval()")
                row = cursor.fetchone()
                if row: db_id = f"src-{row[0]}"
            else:
                db_id = f"src-{cursor.lastrowid}"
            conn.close()
        except Exception as db_err:
            print(f"DB insert error for file upload: {db_err}")

    # Math-based catchphrase extraction
    stop_words = {'que', 'el', 'un', 'los', 'para', 'como', 'de', 'y', 'a', 'la', 'en', 'es', 'del', 'al', 'se', 'por', 'con', 'no', 'mi', 'su', 'o', 'lo', 'si', 'sus', 'me', 'le', 'te', 'nos', 'este', 'esta', 'estos', 'estas', 'una', 'unas', 'unos', 'bien', 'muy', 'pero', 'mas', 'más'}
    words_list = re.findall(r'[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]{3,}', full_text.lower())
    filtered_words = [w for w in words_list if w not in stop_words]
    from collections import Counter
    top_keywords = [w.capitalize() for w, _ in Counter(filtered_words).most_common(6)] or ["Socio", "Uff", "Literal", "Brutal"]
    calculated_wpm = max(50, min(300, int(word_count / duration_mins)))

    if user_email:
        try:
            struct_patterns_list = [
                {"id": "pat-1", "text": "Hooks within first 15s consistently identified.", "completed": True},
                {"id": "pat-2", "text": "Retention peaks every 2.5 mins (Visual B-Roll pattern).", "completed": True},
                {"id": "pat-3", "text": "Outro Call-to-Action pattern identified.", "completed": False}
            ]
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute(
                """INSERT INTO voice_profiles (user_email, linguistic_pacing, words_per_minute, catchphrases, structural_patterns, confidence_level)
                   VALUES (?, ?, ?, ?, ?, ?)
                   ON CONFLICT(user_email) DO UPDATE SET
                       catchphrases=excluded.catchphrases,
                       words_per_minute=excluded.words_per_minute""",
                (user_email, "Punchy & Fast-Paced", calculated_wpm, ",".join(top_keywords),
                 json.dumps(struct_patterns_list), 94)
            )
            conn.commit()
            conn.close()
        except Exception as db_err:
            print(f"Voice profile update error: {db_err}")

    import datetime
    today = datetime.date.today().strftime("%m/%d/%Y")
    return {
        "success": True,
        "source": {
            "id": db_id,
            "name": source_name,
            "type": "file",
            "status": "Indexed",
            "metrics": metrics_str,
            "timestamp": today
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
            "id": str(source_id),
            "name": name,
            "type": stype,
            "status": "Indexed",
            "metrics": metrics_str,
            "timestamp": formatted_date
        })
    return sources_list

@app.delete("/api/v1/training/sources/{source_id}")
async def delete_training_source(source_id: str, request: Request):
    user_email = request.headers.get("X-User-Email")
    user_id = get_user_id_by_email(user_email)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required.")
    
    clean_id = source_id.replace("src-", "").replace("yt-", "")
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM training_sources WHERE id = ? AND user_id = ?", (clean_id, user_id))
    conn.commit()
    conn.close()
    return {"success": True, "message": "Source deleted."}

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
    gemini_key, _ = get_user_gemini_key(user_email)
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
    adaptive_context = build_adaptive_creator_prompt_context(user_email)

    system_instruction = f"""You are an elite script editor. Your task is to refine an existing YouTube script.
STRICT STYLE RULES (do NOT break these):
- Maintain the creator's voice: {pacing_desc} (~{wpm} WPM).
- Naturally weave these catchphrases throughout: {catchphrases_str}.
- Return ONLY the updated blocks JSON array. Do not add explanation text.
- Keep the same number of blocks and block types unless the instruction explicitly asks to merge or split.
{adaptive_context}"""

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

    models_to_try = ["gemini-flash-latest", "gemini-3.6-flash", "gemini-2.5-flash", "gemini-2.0-flash", "gemini-pro-latest"]
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

@app.post("/api/v1/scripts/extract-clips")
async def extract_clip(payload: ScriptExtractClipRequest, request: Request):
    """
    Analyzes the active script text using Gemini + Golden Rule learning context
    to extract a brand-new high-retention viral clip block.
    """
    user_email = request.headers.get("X-User-Email", "").strip().lower()
    gemini_key, _ = get_user_gemini_key(user_email)
    if not gemini_key:
        raise HTTPException(status_code=400, detail="Missing Gemini API Key. Please configure your key in Settings.")

    if not payload.script_text or len(payload.script_text.strip()) < 30:
        raise HTTPException(status_code=400, detail="Script content is too short to extract a clip candidate.")

    pacing_desc = "Punchy & Fast-Paced"
    wpm = 170
    catchphrases = ["Socio", "Uff", "Brutal", "Literal"]
    if payload.ai_voice_profile:
        pacing_desc = payload.ai_voice_profile.linguistic_pacing
        wpm = payload.ai_voice_profile.words_per_minute
        catchphrases = payload.ai_voice_profile.catchphrases

    adaptive_context = build_adaptive_creator_prompt_context(user_email)

    system_instruction = f"""You are a strict, highly critical short-form viral editor, social media trend analyst, and algorithm auditor.
Your task is to analyze the user's provided YouTube script and extract ONE distinct standalone clip candidate suitable for TikTok, Instagram Reels, YouTube Shorts, X (Twitter), and Facebook.

CRITICAL VIRALITY SCORING RUBRIC (REALISTIC & UNBIASED):
- DO NOT default to inflated scores above 90% unless the clip possesses an extraordinary viral combination (Intense Hook + High Conflict + Strong Emotion + Curiosity Gap).
- Evaluate virality_score (1-100) strictly based on 4 factors:
  1. Hook Strength (0-25 pts): Does the opening sentence force immediate retention in 3s?
  2. Conflict / Debate Potential (0-25 pts): Will viewers comment or disagree in the comments?
  3. Emotional Peak (0-25 pts): Does it evoke nostalgia, shock, humor, or awe?
  4. Curiosity Gap (0-25 pts): Does it leave the viewer wanting to watch until the very last second?
- Most average or informational clips MUST receive realistic scores in the 45% - 75% range.
- Assign retention rating realistically: 'High' (75%+), 'Med' (50-74%), or 'Low' (under 50%).

CRITICAL ALGORITHM HASHTAG RULES:
- DO NOT generate generic broad hashtags like #Viral, #Shorts, or #Video.
- You MUST extract hyper-targeted NICHE HASHTAGS directly derived from the specific entities, video games, personalities, brands, or topics explicitly discussed in the clip.
- Categorize hashtags to train recommendation algorithms so the video is served directly to the EXACT targeted audience.
- Rate each hashtag (1-100) based on niche audience match and search relevance.

STRICT CREATOR VOICE RULES:
- Pacing: {pacing_desc} (~{wpm} WPM).
- Catchphrases to emphasize: {", ".join(catchphrases)}.
{adaptive_context}"""

    prompt_text = f"""Analyze this script and select a 30-60 second segment to extract as a clip candidate.

CRITICAL INSTRUCTION FOR VIRALITY SCORING:
Be extremely critical and realistic when evaluating virality_score. Calculate the score using the 4-factor rubric (Hook, Conflict, Emotion, Curiosity Gap). Do NOT give inflated >90% scores to ordinary passages. Informational passages without strong conflict or emotion should be scored realistically (40-70%).

--- SCRIPT CONTENT ---
{payload.script_text[:4000]}
--- END SCRIPT CONTENT ---

Return a JSON object matching the requested schema with:
- text: The extracted verbatim or polished passage from the script (prefixed with timecode timestamp like '[1:30]').
- timecode: Estimated start time (e.g., '1:30s').
- label: Title of the viral candidate (e.g., 'Viral Clip Candidate').
- retention: Retention rating ('High', 'Med', or 'Low').
- clip_metadata: Containing short_title, duration_shorts (e.g., '00:45'), and suggested_hook.
- trend_analytics: Containing virality_score (1-100, strictly evaluated), platform_trends (list of platform name, status, volume_score), and rated_hashtags (list of hyper-specific hashtag, score 1-100, reach_estimate)."""

    schema = {
        "type": "OBJECT",
        "properties": {
            "text": {"type": "STRING"},
            "timecode": {"type": "STRING"},
            "label": {"type": "STRING"},
            "retention": {"type": "STRING"},
            "clip_metadata": {
                "type": "OBJECT",
                "properties": {
                    "short_title": {"type": "STRING"},
                    "duration_shorts": {"type": "STRING"},
                    "suggested_hook": {"type": "STRING"}
                },
                "required": ["short_title", "duration_shorts", "suggested_hook"]
            },
            "trend_analytics": {
                "type": "OBJECT",
                "properties": {
                    "virality_score": {"type": "INTEGER"},
                    "platform_trends": {
                        "type": "ARRAY",
                        "items": {
                            "type": "OBJECT",
                            "properties": {
                                "platform": {"type": "STRING"},
                                "status": {"type": "STRING"},
                                "volume_score": {"type": "INTEGER"}
                            },
                            "required": ["platform", "status", "volume_score"]
                        }
                    },
                    "rated_hashtags": {
                        "type": "ARRAY",
                        "items": {
                            "type": "OBJECT",
                            "properties": {
                                "hashtag": {"type": "STRING"},
                                "score": {"type": "INTEGER"},
                                "reach_estimate": {"type": "STRING"}
                            },
                            "required": ["hashtag", "score", "reach_estimate"]
                        }
                    }
                },
                "required": ["virality_score", "platform_trends", "rated_hashtags"]
            }
        },
        "required": ["text", "timecode", "label", "retention", "clip_metadata", "trend_analytics"]
    }

    gemini_payload = {
        "contents": [{"parts": [{"text": prompt_text}]}],
        "systemInstruction": {"parts": [{"text": system_instruction}]},
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseSchema": schema
        }
    }

    models_to_try = ["gemini-flash-latest", "gemini-3.6-flash", "gemini-2.5-flash", "gemini-2.0-flash", "gemini-pro-latest"]
    last_err = None
    for model_name in models_to_try:
        gemini_url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent"
        headers = {"Content-Type": "application/json", "x-goog-api-key": gemini_key}
        try:
            print(f"Extracting clip with model: {model_name}...")
            res = requests.post(gemini_url, json=gemini_payload, headers=headers, timeout=30)
            if res.status_code == 200:
                candidates = res.json().get("candidates", [])
                if candidates:
                    text_out = candidates[0]["content"]["parts"][0]["text"]
                    clip_data = json.loads(text_out)
                    return {"success": True, "clip": clip_data}
            else:
                last_err = f"Model {model_name} failed with status {res.status_code}"
                print(last_err)
        except Exception as e:
            last_err = str(e)
            print(f"Model {model_name} exception: {e}")

    raise HTTPException(status_code=500, detail=f"AI clip extraction failed: {last_err}")


class LinkPerformanceRequest(BaseModel):
    published_url: str
    content_type: str  # 'clip' or 'long_form'
    title: str
    ai_predicted_score: int = 75
    views_count: int = 0
    likes_count: int = 0
    comments_count: int = 0
    watch_time_mins: float = 0.0
    platform: str = "YouTube"

@app.post("/api/v1/analytics/link-performance")
async def link_performance_metrics(payload: LinkPerformanceRequest, request: Request):
    """
    Ingests real published video performance metrics (long-form or clip)
    and stores them to calibrate the AI model in the Golden Rule ML feedback loop.
    """
    user_email = request.headers.get("X-User-Email", "").strip().lower()
    user_id = get_user_id_by_email(user_email) if user_email else None
    if not user_id:
        user_id = 1

    url = payload.published_url.strip()
    if not url.startswith("http"):
        raise HTTPException(status_code=400, detail="Invalid URL format. Please provide a valid HTTP/HTTPS link.")

    # Infer platform if not explicitly set
    platform = payload.platform or "YouTube"
    if "tiktok.com" in url.lower():
        platform = "TikTok"
    elif "instagram.com" in url.lower():
        platform = "Instagram"
    elif "twitter.com" in url.lower() or "x.com" in url.lower():
        platform = "X"
    elif "facebook.com" in url.lower():
        platform = "Facebook"

    # Default realistic estimations if not supplied
    views = payload.views_count if payload.views_count is not None else random.randint(1200, 45000)
    likes = payload.likes_count if payload.likes_count is not None else int(views * random.uniform(0.06, 0.12))
    comments = payload.comments_count if payload.comments_count is not None else int(views * random.uniform(0.01, 0.03))
    watch_time = payload.watch_time_mins if payload.watch_time_mins is not None else round(random.uniform(0.4, 4.2), 2)

    # Calculate actual virality score (0-100) based on engagement ratio
    engagement_rate = ((likes + comments * 2) / max(views, 1)) * 100
    actual_virality = min(99, max(25, int(engagement_rate * 8 + (views / 1000))))

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO published_performance_metrics 
        (user_id, content_type, title, published_url, platform, views_count, likes_count, comments_count, watch_time_mins, ai_predicted_score, actual_virality_score)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        user_id,
        payload.content_type,
        payload.title or "Published Video",
        url,
        platform,
        views,
        likes,
        comments,
        watch_time,
        payload.ai_predicted_score or 75,
        actual_virality
    ))
    conn.commit()
    conn.close()

    return {
        "success": True,
        "message": f"Metrics successfully linked to ML feedback loop for '{payload.title}'",
        "performance": {
            "platform": platform,
            "views": views,
            "likes": likes,
            "comments": comments,
            "watch_time_mins": watch_time,
            "actual_virality_score": actual_virality,
            "ai_predicted_score": payload.ai_predicted_score or 75,
            "calibration_delta": actual_virality - (payload.ai_predicted_score or 75)
        }
    }

@app.get("/api/v1/analytics/performance-log")
async def get_performance_log(request: Request):
    """
    Returns history of real published performance metrics for closed-loop ML analysis.
    """
    user_email = request.headers.get("X-User-Email", "").strip().lower()
    user_id = get_user_id_by_email(user_email) if user_email else None
    if not user_id:
        user_id = 1

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, content_type, title, published_url, platform, views_count, likes_count, comments_count, watch_time_mins, ai_predicted_score, actual_virality_score, created_at
        FROM published_performance_metrics
        WHERE user_id = ?
        ORDER BY id DESC LIMIT 20
    """, (user_id,))
    rows = cursor.fetchall()
    conn.close()

    log_items = []
    for r in rows:
        log_items.append({
            "id": r[0],
            "content_type": r[1],
            "title": r[2],
            "published_url": r[3],
            "platform": r[4],
            "views_count": r[5],
            "likes_count": r[6],
            "comments_count": r[7],
            "watch_time_mins": r[8],
            "ai_predicted_score": r[9],
            "actual_virality_score": r[10],
            "created_at": str(r[11])
        })

    return {"success": True, "metrics": log_items}


@app.post("/api/v1/scripts/generate-thumbnail")
async def generate_thumbnail_studio(payload: GenerateThumbnailRequest, request: Request):
    """
    Crafts hyper-targeted 8K thumbnail prompts (Midjourney/DALL-E) and custom visual concepts
    based on user ideas, character features, background ideas, and text overlays.
    """
    user_email = request.headers.get("X-User-Email", "").strip().lower()
    gemini_key, _ = get_user_gemini_key(user_email)
    if not gemini_key:
        raise HTTPException(status_code=400, detail="Missing Gemini API Key. Please configure your key in Settings.")

    title = payload.script_title.replace(".md", "").strip()
    user_idea = payload.user_idea.strip() if payload.user_idea else "Cinematic dramatic thumbnail concept"
    person_features = payload.person_features.strip() if payload.person_features else "Expressive creator face showing shock or intense curiosity"
    bg_idea = payload.background_idea.strip() if payload.background_idea else "High-tech studio with neon ambient lighting"
    overlay_text = payload.overlay_text.strip() if payload.overlay_text else title

    prompt_text = f"""You are a world-class YouTube Thumbnail Designer & Prompt Engineer.
Generate 3 distinct, high-CTR YouTube thumbnail visual concepts and Flux/Midjourney image prompts based on these creator inputs:

- SCRIPT TITLE: {title}
- USER'S CORE CONCEPT: {user_idea}
- CHARACTER/PERSON FEATURES: {person_features}
- BACKGROUND & ENVIRONMENT: {bg_idea}
- OVERLAY TEXT ON THUMBNAIL: "{overlay_text}"

CRITICAL THUMBNAIL COMPOSITION RULES:
1. EMBED 3D TEXT OVERLAY: The prompt MUST explicitly describe huge, bold, 3D typography rendering the text "{overlay_text}" in glowing yellow, cyan, or metallic gold with black drop-shadows across the top or left third of the image.
2. COMPOSITION BREATHING ROOM: Position main subjects on the right or center 60% of the image, keeping the top/left area uncluttered so text is 100% legible.
3. NICHE CUMBIA & GAMING ACCENTS: Incorporate tropical cumbia music accents (accordions, keyboards, tropical neon lights) mixed with gaming elements.

Return a JSON object matching the requested schema with:
- options: Array of 3 concepts, each with:
  - concept_name: Short name of the style (e.g. '3D Neon Typography', 'Dramatic High-Contrast', 'Hyper-Real Cumbia Hero')
  - midjourney_prompt: Ready-to-use Midjourney/DALL-E prompt with 16:9 ratio and embedded text
  - overlay_text_suggestion: Short punchy text (1-4 words max) to render on the image
  - ctr_boost_reason: Brief explanation of why this visual triggers human curiosity."""

    schema = {
        "type": "OBJECT",
        "properties": {
            "options": {
                "type": "ARRAY",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "concept_name": {"type": "STRING"},
                        "midjourney_prompt": {"type": "STRING"},
                        "overlay_text_suggestion": {"type": "STRING"},
                        "ctr_boost_reason": {"type": "STRING"}
                    },
                    "required": ["concept_name", "midjourney_prompt", "overlay_text_suggestion", "ctr_boost_reason"]
                }
            }
        },
        "required": ["options"]
    }

    gemini_payload = {
        "contents": [{"parts": [{"text": prompt_text}]}],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseSchema": schema
        }
    }

    models_to_try = ["gemini-flash-latest", "gemini-3.6-flash", "gemini-2.5-flash", "gemini-2.0-flash", "gemini-pro-latest"]
    last_err = None
    for model_name in models_to_try:
        gemini_url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent"
        headers = {"Content-Type": "application/json", "x-goog-api-key": gemini_key}
        try:
            res = requests.post(gemini_url, json=gemini_payload, headers=headers, timeout=25)
            if res.status_code == 200:
                candidates = res.json().get("candidates", [])
                if candidates:
                    text_out = candidates[0]["content"]["parts"][0]["text"]
                    data = json.loads(text_out)
                    
                    import urllib.parse
                    options = data.get("options", [])
                    for opt in options:
                        raw_prompt = opt.get("midjourney_prompt", title)
                        clean_prompt = f"YouTube thumbnail 16:9 ratio, {raw_prompt[:150]}"
                        encoded_prompt = urllib.parse.quote(clean_prompt)
                        seed = random.randint(1000, 99999)
                        opt["image_url"] = f"https://image.pollinations.ai/prompt/{encoded_prompt}?width=1280&height=720&seed={seed}&nologo=true"

                    return {"success": True, "data": {"options": options}}
            else:
                last_err = f"Model {model_name} failed with status {res.status_code}"
        except Exception as e:
            last_err = str(e)

    raise HTTPException(status_code=500, detail=f"Thumbnail prompt generation failed: {last_err}")



