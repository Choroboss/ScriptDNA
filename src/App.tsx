import { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { AuthModal } from './components/AuthModal';
import { DashboardView } from './components/DashboardView';
import { MyScriptsView } from './components/MyScriptsView';
import { StyleAiTrainingView } from './components/StyleAiTrainingView';
import { SettingsView } from './components/SettingsView';
import { RetentionRulesView } from './components/RetentionRulesView';
import { RealMetricsAnalyticsView } from './components/RealMetricsAnalyticsView';
import { fetchVoiceProfile, fetchTrainingSources } from './services/api';
import type { TrainingSource } from './services/api';

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

  // API Keys state removed — keys now live in the server DB per user account

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

  const refreshTrainingSources = async () => {
    if (auth.user) {
      try {
        const list = await fetchTrainingSources();
        setSources(list);
      } catch (err) {
        console.error('Failed to fetch training sources', err);
      }
    } else {
      setSources([]);
    }
  };

  useEffect(() => {
    refreshVoiceProfile();
    refreshTrainingSources();
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
    localStorage.removeItem('scriptdna_api_keys'); // flush any stale key cache
    setAuth({
      user: null,
      modalOpen: false,
    });
    setActiveView('dashboard');
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
            apiKeys={{ gemini: '', anthropic: '', openai: '', grok: '' }}
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
            onRefreshTrainingSources={refreshTrainingSources}
          />
        )}

        {activeView === 'real-metrics' && <RealMetricsAnalyticsView />}

        {activeView === 'settings' && (
          <SettingsView
            isAuthenticated={!!auth.user}
          />
        )}

        {activeView === 'retention-rules' && (
          <RetentionRulesView
            isAuthenticated={!!auth.user}
            onOpenAuthModal={() => setAuth((prev) => ({ ...prev, modalOpen: true }))}
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
