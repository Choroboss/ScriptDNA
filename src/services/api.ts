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
 * Saves one or more API keys into the user's DB row.
 * POST /api/v1/auth/settings/keys
 * SECURITY: keys travel one-way from browser → DB, never back.
 */
export async function saveUserKeys(keys: {
  gemini_api_key?: string;
  anthropic_api_key?: string;
  openai_api_key?: string;
  grok_api_key?: string;
}): Promise<{ success: boolean; message: string }> {
  const response = await apiClient.post('/auth/settings/keys', keys);
  return response.data;
}

/** Convenience alias: save only the Gemini key. */
export async function saveUserGeminiKey(gemini_api_key: string): Promise<{ success: boolean; message: string }> {
  return saveUserKeys({ gemini_api_key });
}

export type ProviderStatus = 'CONNECTED' | 'MISSING';

/**
 * Returns masked presence status of all stored keys — never the raw values.
 * GET /api/v1/auth/settings/keys
 */
export async function fetchUserKeyStatus(): Promise<{
  gemini: ProviderStatus;
  anthropic: ProviderStatus;
  openai: ProviderStatus;
  grok: ProviderStatus;
}> {
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

/**
 * Deletes a training source from the database.
 * DELETE /api/v1/training/sources/:id
 */
export async function deleteTrainingSource(id: string): Promise<{ success: boolean; message: string }> {
  const response = await apiClient.delete(`/training/sources/${id}`);
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
 * Extracts a new high-retention viral clip candidate from the current script content.
 * POST /api/v1/scripts/extract-clips
 */
export async function extractClips(params: {
  script_text: string;
  ai_voice_profile?: {
    linguistic_pacing: string;
    words_per_minute: number;
    catchphrases: string[];
  };
}): Promise<{
  success: boolean;
  clip: {
    text: string;
    timecode: string;
    label: string;
    retention: 'High' | 'Med';
    clip_metadata?: {
      short_title: string;
      duration_shorts: string;
      suggested_hook: string;
    };
    trend_analytics?: {
      virality_score: number;
      platform_trends: Array<{ platform: string; status: string; volume_score: number }>;
      rated_hashtags: Array<{ hashtag: string; score: number; reach_estimate: string }>;
    };
  };
}> {
  const response = await apiClient.post('/scripts/extract-clips', params);
  return response.data;
}

/**
 * Ingests real published video performance metrics (long-form or clip)
 * POST /api/v1/analytics/link-performance
 */
export async function linkPerformanceMetrics(params: {
  published_url: string;
  content_type: 'clip' | 'long_form';
  title: string;
  ai_predicted_score?: number;
  views_count?: number;
  likes_count?: number;
  comments_count?: number;
  watch_time_mins?: number;
}): Promise<any> {
  const response = await apiClient.post('/analytics/link-performance', params);
  return response.data;
}

/**
 * Retrieves performance metrics history for closed-loop ML analytics
 * GET /api/v1/analytics/performance-log
 */
export async function fetchPerformanceLog(): Promise<{
  success: boolean;
  metrics: Array<{
    id: number;
    content_type: string;
    title: string;
    published_url: string;
    platform: string;
    views_count: number;
    likes_count: number;
    comments_count: number;
    watch_time_mins: number;
    ai_predicted_score: number;
    actual_virality_score: number;
    created_at: string;
  }>;
}> {
  const response = await apiClient.get('/analytics/performance-log');
  return response.data;
}

/**
 * Generates custom AI thumbnail prompt options based on user custom fields
 * POST /api/v1/scripts/generate-thumbnail
 */
export async function generateThumbnailOptions(params: {
  script_title: string;
  script_content?: string;
  user_idea?: string;
  person_features?: string;
  background_idea?: string;
  overlay_text?: string;
}): Promise<{
  success: boolean;
  data: {
    options: Array<{
      concept_name: string;
      midjourney_prompt: string;
      overlay_text_suggestion: string;
      ctr_boost_reason: string;
      image_url?: string;
    }>;
  };
}> {
  const response = await apiClient.post('/scripts/generate-thumbnail', params);
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
 * Ingests a YouTube URL by sending it directly to the backend.
 * The backend uses youtube-transcript-api (Python) to extract subtitles server-side,
 * which works reliably from localhost without CORS or IP-block issues.
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
