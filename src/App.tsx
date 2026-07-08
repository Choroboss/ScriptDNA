import { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { AuthModal } from './components/AuthModal';
import { DashboardView } from './components/DashboardView';
import { MyScriptsView } from './components/MyScriptsView';
import { StyleAiTrainingView } from './components/StyleAiTrainingView';
import { SettingsView } from './components/SettingsView';
import { fetchVoiceProfile } from './services/api';
import type { TrainingSource } from './services/api';

// --- Local Storage BYOK Encrypted Wrapper ---
const STORAGE_KEY = 'scriptdna_api_keys';

interface ApiKeys {
  gemini: string;
  anthropic: string;
  openai: string;
  grok: string;
}

const getStoredKeys = (): ApiKeys => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      // Decode Base64 representing mock local encryption
      const decoded = atob(stored);
      return JSON.parse(decoded);
    } catch (e) {
      console.error('Failed to parse stored API keys', e);
    }
  }
  // Default keys matching Stitch mock (Gemini & Anthropic pre-connected)
  return {
    gemini: 'sk-gemini-v1-pro-15829472948294',
    anthropic: 'sk-ant-claude-3-5-sonnet-847293847294',
    openai: '',
    grok: '',
  };
};

const saveStoredKeys = (keys: ApiKeys) => {
  try {
    const stringified = JSON.stringify(keys);
    // Encode Base64 representing mock local encryption
    const encoded = btoa(stringified);
    localStorage.setItem(STORAGE_KEY, encoded);
  } catch (e) {
    console.error('Failed to save API keys to storage', e);
  }
};

function App() {
  const [activeView, setActiveView] = useState<string>('dashboard');
  
  // Authentication state
  const [auth, setAuth] = useState<{
    user: {
      name: string;
      email: string;
      tier: string;
      avatarUrl: string;
    } | null;
    modalOpen: boolean;
  }>(() => {
    const saved = localStorage.getItem('scriptdna_user');
    return {
      user: saved ? JSON.parse(saved) : null,
      modalOpen: false,
    };
  });

  // API Keys state
  const [apiKeys, setApiKeys] = useState<ApiKeys>(getStoredKeys());

  // Voice Profile state
  const [voiceProfile, setVoiceProfile] = useState({
    linguistic_pacing: 'Punchy & Fast-Paced',
    words_per_minute: 170,
    catchphrases: ['Socio', 'Uff', 'Literal', 'Brutal', 'Actually', 'Insane'],
  });

  const refreshVoiceProfile = async () => {
    if (auth.user) {
      try {
        const profile = await fetchVoiceProfile();
        setVoiceProfile({
          linguistic_pacing: profile.pacing.description,
          words_per_minute: profile.pacing.raw_wpm || 170,
          catchphrases: profile.catchphrases,
        });
      } catch (err) {
        console.error('Failed to fetch voice profile', err);
      }
    } else {
      setVoiceProfile({
        linguistic_pacing: 'Punchy & Fast-Paced',
        words_per_minute: 170,
        catchphrases: ['Socio', 'Uff', 'Literal', 'Brutal', 'Actually', 'Insane'],
      });
    }
  };

  useEffect(() => {
    refreshVoiceProfile();
  }, [auth.user]);

  // Training sources state (table data)
  const [sources, setSources] = useState<TrainingSource[]>([]);

  // Intercept navigation to Style AI Training if guest
  const handleSetView = (view: string) => {
    if (view === 'style-ai-training' && !auth.user) {
      // Switch view but open the modal overlay
      setActiveView('style-ai-training');
      setAuth((prev) => ({ ...prev, modalOpen: true }));
    } else {
      setActiveView(view);
    }
  };

  const handleLoginSuccess = (user: typeof auth.user) => {
    if (user) {
      localStorage.setItem('scriptdna_user', JSON.stringify(user));
    }
    setAuth({
      user,
      modalOpen: false,
    });
  };

  const handleLogout = () => {
    localStorage.removeItem('scriptdna_user');
    setAuth({
      user: null,
      modalOpen: false,
    });
    // Redirect to dashboard if logged out
    setActiveView('dashboard');
  };

  // BYOK Actions
  const handleSaveKey = (provider: string, key: string) => {
    const updated = { ...apiKeys, [provider]: key };
    setApiKeys(updated);
    saveStoredKeys(updated);
  };

  const handleReplaceKey = (provider: string) => {
    const updated = { ...apiKeys, [provider]: '' };
    setApiKeys(updated);
    saveStoredKeys(updated);
  };

  // Add source from uploader or fetcher
  const handleAddSource = (newSource: TrainingSource) => {
    setSources((prev) => [newSource, ...prev]);
  };

  // Update transcribing or uploading states
  const handleUpdateSource = (id: string, updates: Partial<TrainingSource>) => {
    setSources((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...updates } : s))
    );
  };

  const handleNewScript = () => {
    handleSetView('my-scripts');
    alert('Initialized new script workspace: "Untitled Script.md". Focus editor and begin typing.');
  };

  return (
    <div className="flex h-screen w-full bg-[#0a0a0a] text-on-surface overflow-hidden">
      {/* Sidebar Navigation */}
      <Sidebar
        activeView={activeView}
        setActiveView={handleSetView}
        auth={auth}
        onOpenAuthModal={() => setAuth((prev) => ({ ...prev, modalOpen: true }))}
        onLogout={handleLogout}
        onNewScript={handleNewScript}
      />

      {/* Main View Panel */}
      <div className="flex-1 ml-[260px] h-full flex overflow-hidden">
        {activeView === 'dashboard' && (
          <DashboardView
            onSwitchView={handleSetView}
            sources={sources}
            apiKeys={apiKeys}
          />
        )}

        {activeView === 'my-scripts' && (
          <MyScriptsView 
            voiceProfile={voiceProfile} 
            isAuthenticated={!!auth.user}
            onOpenAuthModal={() => setAuth((prev) => ({ ...prev, modalOpen: true }))}
          />
        )}

        {activeView === 'style-ai-training' && (
          <StyleAiTrainingView
            isAuthenticated={!!auth.user}
            onOpenAuthModal={() => setAuth((prev) => ({ ...prev, modalOpen: true }))}
            sources={sources}
            onAddSource={handleAddSource}
            onUpdateSource={handleUpdateSource}
            onUpdateVoiceProfile={(pacing, wpm, catchphrases) => 
              setVoiceProfile({ linguistic_pacing: pacing, words_per_minute: wpm, catchphrases })
            }
            onRefreshVoiceProfile={refreshVoiceProfile}
          />
        )}

        {activeView === 'settings' && (
          <SettingsView
            apiKeys={apiKeys}
            onSaveKey={handleSaveKey}
            onReplaceKey={handleReplaceKey}
          />
        )}
      </div>

      {/* Global Authentication Modal Overlay */}
      {auth.modalOpen && (
        <AuthModal
          onClose={() => setAuth((prev) => ({ ...prev, modalOpen: false }))}
          onLoginSuccess={handleLoginSuccess}
        />
      )}

      {/* Atmosphere Ambient Glow */}
      <div className="fixed top-0 right-0 -z-10 w-[600px] h-[600px] bg-primary/5 blur-[150px] pointer-events-none"></div>
      <div className="fixed bottom-0 left-0 -z-10 w-[400px] h-[400px] bg-primary/5 blur-[120px] pointer-events-none"></div>
    </div>
  );
}

export default App;
