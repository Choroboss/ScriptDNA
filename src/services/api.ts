import axios from 'axios';

// --- API Skeletons and Interfaces ---

export interface VoiceDNASignatures {
  catchphrases: string[];
  pacing: {
    wpm: string;
    description: string;
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

// Interceptor to add BYOK keys if available
apiClient.interceptors.request.use((config) => {
  const keysJson = localStorage.getItem('scriptdna_api_keys');
  if (keysJson) {
    try {
      const keys = JSON.parse(atob(keysJson));
      if (keys.gemini) {
        config.headers['X-Gemini-API-Key'] = keys.gemini;
        config.headers['X-Gemini-Key'] = keys.gemini;
      }
      if (keys.anthropic) config.headers['X-Anthropic-Key'] = keys.anthropic;
      if (keys.openai) config.headers['X-OpenAI-Key'] = keys.openai;
      if (keys.grok) config.headers['X-Grok-Key'] = keys.grok;
    } catch (e) {
      console.error('Failed to decrypt local API keys', e);
    }
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

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
 * Ingests a YouTube URL to extract transcript, pacing, and tone.
 * POST /api/v1/training/ingest-youtube
 */
export async function ingestYouTubeUrl(url: string): Promise<{ success: boolean; source: TrainingSource; analysis?: VoiceAnalysis }> {
  const response = await apiClient.post('/training/ingest-youtube', { url });
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
  voiceProfile?: VoiceProfileInput
): Promise<{ success: boolean; script: GeneratedScript }> {
  const response = await apiClient.post('/scripts/generate', {
    prompt,
    ai_voice_profile: voiceProfile,
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
