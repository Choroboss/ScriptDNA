import axios from 'axios';

// --- API Skeletons and Interfaces ---

export interface VoiceDNASignatures {
  catchphrases: string[];
  pacing: {
    wpm: string;
    description: string;
    raw_wpm?: number;
  };
  structuralPatterns: {
    id: string;
    text: string;
    completed: boolean;
  }[];
  confidenceLevel: number;
}

export interface TrainingSource {
  id: string;
  name: string;
  type: 'file' | 'youtube';
  status: 'Indexed' | 'Processing';
  progress?: number;
  metrics: string;
  timestamp: string;
}

// Axios Client configured with base URL
export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor to add the active user session header on every request.
// SECURITY: API keys are stored in the server DB, NOT sent from the browser.
apiClient.interceptors.request.use((config) => {
  const userJson = localStorage.getItem('scriptdna_user');
  if (userJson) {
    try {
      const user = JSON.parse(userJson);
      if (user && user.email) {
        config.headers['X-User-Email'] = user.email;
      }
    } catch (e) {
      console.error('Failed to append X-User-Email header', e);
    }
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

/**
 * Fetches the user's computed voice signature profile from the database.
 * GET /api/v1/profile/voice-profile
 */
export async function fetchVoiceProfile(): Promise<VoiceDNASignatures> {
  const response = await apiClient.get('/profile/voice-profile');
  return response.data;
}

/**
 * Saves the user's Gemini API key into their own row in the DB.
 * POST /api/v1/auth/settings/keys
 * SECURITY: the key travels one-way from browser → DB, never back.
 */
export async function saveUserGeminiKey(gemini_api_key: string): Promise<{ success: boolean; message: string }> {
  const response = await apiClient.post('/auth/settings/keys', { gemini_api_key });
  return response.data;
}

/**
 * Returns only the masked presence status of the user's stored keys ("CONNECTED" | "MISSING").
 * GET /api/v1/auth/settings/keys
 */
export async function fetchUserKeyStatus(): Promise<{ gemini: 'CONNECTED' | 'MISSING' }> {
  const response = await apiClient.get('/auth/settings/keys');
  return response.data;
}

/**
 * Fetches the user's saved training sources list from the database.
 * GET /api/v1/training/sources
 */
export async function fetchTrainingSources(): Promise<TrainingSource[]> {
  const response = await apiClient.get('/training/sources');
  return response.data;
}

export interface SavedScript {
  id: number;
  title: string;
  estimated_duration_mins: number;
  updated_at: string;
}

/**
 * Fetches all saved scripts for the logged-in user.
 * GET /api/v1/scripts
 */
export async function fetchSavedScripts(): Promise<SavedScript[]> {
  const response = await apiClient.get('/scripts');
  return response.data;
}

/**
 * Saves or updates a script document.
 * POST /api/v1/scripts/save
 */
export async function saveScript(params: {
  id?: number;
  title: string;
  estimated_duration_mins?: number;
  blocks_json: string;
}): Promise<{ success: boolean; id: number }> {
  const response = await apiClient.post('/scripts/save', params);
  return response.data;
}

/**
 * Sends the current blocks and a refinement instruction to Gemini for iterative AI editing.
 * POST /api/v1/scripts/refine
 */
export async function refineScript(params: {
  script_id?: number;
  blocks_json: string;
  refinement_instruction: string;
  ai_voice_profile?: {
    linguistic_pacing: string;
    words_per_minute: number;
    catchphrases: string[];
  };
}): Promise<{ success: boolean; blocks: unknown[] }> {
  const response = await apiClient.post('/scripts/refine', params);
  return response.data;
}

/**
 * Uploads a text or docx script file to train the AI model.
 * POST /api/v1/training/upload-file
 */
export async function uploadScriptFile(file: File, onUploadProgress?: (progress: number) => void): Promise<{ success: boolean; source: TrainingSource }> {
  // Check if we want to run mock logic
  if (import.meta.env.DEV) {
    return new Promise((resolve) => {
      let progress = 0;
      const interval = setInterval(() => {
        progress += 10;
        if (onUploadProgress) onUploadProgress(progress);
        if (progress >= 100) {
          clearInterval(interval);
          resolve({
            success: true,
            source: {
              id: `src-${Date.now()}`,
              name: file.name,
              type: 'file',
              status: 'Indexed',
              metrics: `${(Math.floor(Math.random() * 2000) + 500).toLocaleString()} words analyzed`,
              timestamp: new Date().toLocaleDateString(),
            },
          });
        }
      }, 200);
    });
  }

  const formData = new FormData();
  formData.append('file', file);
  
  const response = await apiClient.post('/training/upload-file', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (progressEvent) => {
      if (progressEvent.total && onUploadProgress) {
        const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        onUploadProgress(percentCompleted);
      }
    },
  });
  return response.data;
}

export interface VoiceAnalysis {
  linguistic_pacing: string;
  words_per_minute: number;
  catchphrases: string[];
  structural_patterns: {
    has_early_hooks: boolean;
    retention_peak_interval_mins: number;
    outro_style: string;
  };
  confidence_level: number;
}

/**
 * Extracts the YouTube video ID from a URL.
 */
function extractYouTubeVideoId(url: string): string | null {
  const patterns = [
    /(?:v=|youtu\.be\/|embed\/|shorts\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

/**
 * Fetches a YouTube transcript from the browser using the youtube-transcript proxy API.
 * This runs in the USER's browser so Railway's IP block doesn't apply.
 */
async function fetchYouTubeTranscriptFromBrowser(videoId: string): Promise<{ text: string; duration_mins: number }> {
  // Use the public youtube-transcript API service
  const res = await fetch(`https://api.kome.ai/api/tools/youtube-transcripts?video_id=${videoId}&format=true`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ video_id: videoId, format: true }),
  });
  if (!res.ok) {
    // Fallback: try the timedtext endpoint directly
    const langRes = await fetch(
      `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=json3`
    );
    if (langRes.ok) {
      const data = await langRes.json();
      const events = data?.events || [];
      const text = events
        .filter((e: any) => e.segs)
        .flatMap((e: any) => e.segs.map((s: any) => s.utf8))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      const lastEvent = events[events.length - 1];
      const duration_mins = lastEvent ? (lastEvent.tStartMs + (lastEvent.dDurationMs || 0)) / 60000 : 5;
      return { text, duration_mins };
    }
    throw new Error('No se pudieron cargar los subtítulos. Verifica que el video tenga subtítulos habilitados.');
  }
  const data = await res.json();
  const text = (data?.transcript || '').replace(/\s+/g, ' ').trim();
  return { text, duration_mins: 5 };
}

/**
 * Ingests a YouTube URL: fetches the transcript from the browser (no Railway IP block)
 * then sends the text to the backend for AI voice analysis.
 * POST /api/v1/training/ingest-with-transcript
 */
export async function ingestYouTubeUrl(url: string): Promise<{ success: boolean; source: TrainingSource; analysis?: VoiceAnalysis }> {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) throw new Error('URL de YouTube inválida.');

  // Step 1: fetch transcript in the browser (bypasses IP blocks)
  const { text, duration_mins } = await fetchYouTubeTranscriptFromBrowser(videoId);
  if (!text || text.length < 50) throw new Error('El transcript está vacío o es demasiado corto para analizar.');

  // Step 2: send to backend for storage + AI analysis
  const response = await apiClient.post('/training/ingest-with-transcript', {
    video_id: videoId,
    url,
    transcript_text: text,
    duration_mins,
  });
  return response.data;
}

/**
 * Fetches the computed voice profile and linguistic DNA.
 * GET /api/v1/profile/voice-dna
 */
export async function getVoiceDNA(): Promise<VoiceDNASignatures> {
  if (import.meta.env.DEV) {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          catchphrases: ['Socio', 'Uff', 'Literal', 'Brutal', 'Actually', 'Insane'],
          pacing: {
            wpm: '160-180',
            description: 'Punchy & Fast-Paced',
          },
          structuralPatterns: [
            { id: 'pat-1', text: 'Hooks within first 15s consistently identified.', completed: true },
            { id: 'pat-2', text: 'Retention peaks every 2.5 mins (Visual B-Roll pattern).', completed: true },
            { id: 'pat-3', text: 'Outro Call-to-Action pattern identified.', completed: false },
          ],
          confidenceLevel: 94,
        });
      }, 500);
    });
  }

  const response = await apiClient.get('/profile/voice-dna');
  return response.data;
}

export interface GeneratedScriptBlock {
  text: string;
  is_viral_candidate: boolean;
  clip_metadata?: {
    short_title: string;
    duration_shorts: string;
    suggested_hook: string;
  };
}

export interface GeneratedScript {
  title: string;
  estimated_duration_mins: number;
  blocks: GeneratedScriptBlock[];
}

export interface VoiceProfileInput {
  linguistic_pacing: string;
  words_per_minute: number;
  catchphrases: string[];
}

/**
 * Generates a YouTube script based on a prompt and stylistic voice cloning variables.
 * POST /api/v1/scripts/generate
 */
export async function generateScript(
  prompt: string,
  voiceProfile?: VoiceProfileInput,
  targetDurationMins?: number
): Promise<{ success: boolean; script: GeneratedScript }> {
  const response = await apiClient.post('/scripts/generate', {
    prompt,
    ai_voice_profile: voiceProfile,
    target_duration_mins: targetDurationMins,
  });
  return response.data;
}

export interface UserDetails {
  name: string;
  email: string;
  tier: string;
  avatarUrl: string;
}

/**
 * Validates credentials on the backend.
 * POST /api/v1/auth/login
 */
export async function loginUser(email: string, password: string): Promise<{ success: boolean; user: UserDetails }> {
  const response = await apiClient.post('/auth/login', { email, password });
  return response.data;
}

/**
 * Registers a new creator profile.
 * POST /api/v1/auth/register
 */
export async function registerUser(name: string, email: string, password: string): Promise<{ success: boolean; user: UserDetails }> {
  const response = await apiClient.post('/auth/register', { name, email, password });
  return response.data;
}
