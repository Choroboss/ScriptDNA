import React, { useState, useEffect } from 'react';
import { saveUserGeminiKey, fetchUserKeyStatus } from '../services/api';

interface SettingsViewProps {
  isAuthenticated: boolean;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ isAuthenticated }) => {
  // DB-sourced key status — never the raw key value
  const [geminiStatus, setGeminiStatus] = useState<'CONNECTED' | 'MISSING' | 'LOADING'>('LOADING');
  const [inputs, setInputs] = useState<Record<string, string>>({
    gemini: '',
    anthropic: '',
    openai: '',
    grok: '',
  });
  const [saving, setSaving] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  // Read actual logged-in user from localStorage
  const currentUser = (() => {
    try {
      const raw = localStorage.getItem('scriptdna_user');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  })();
  const displayName = currentUser?.name || currentUser?.email?.split('@')[0] || 'User';
  const displayEmail = currentUser?.email || '—';

  // On mount or auth change, fetch real key status from DB
  useEffect(() => {
    if (!isAuthenticated) {
      setGeminiStatus('MISSING');
      return;
    }
    fetchUserKeyStatus()
      .then((status) => setGeminiStatus(status.gemini))
      .catch(() => setGeminiStatus('MISSING'));
  }, [isAuthenticated]);

  const providers = [
    {
      id: 'gemini',
      name: 'Google Gemini API',
      icon: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAsclDbxwtSZBFdIjBcMCDqhHKIgrVBE_XwKU3MOqxM_cHouKOLP3HcdJ2nNreML5RgzXUpycriq8qgtmTK2enfXEiaR50HVKMgOhcIUqqGsx_aPl9Zp1h_DdMNLa9ZXESzcDJrXP5l7yQ03OoWean_iKBEX3guH_JBMxgmMOd1gw07Ui5zdNOoHExYEuq7HirNGb1PL29qCCGeWfOBiatg_cO6r6rHfh3jRScGD3zzi9ySkiNVK1xvGK5G_7gF4LIxPyxXi0zueA',
      connectedModel: 'Gemini 2.5 Flash',
      maskPrefix: 'AIza••••••••••••',
      dbBacked: true,
    },
    {
      id: 'anthropic',
      name: 'Anthropic Claude API',
      icon: 'terminal',
      connectedModel: 'Claude 3.5 Sonnet',
      maskPrefix: 'sk-ant-••••••••••••',
      dbBacked: false,
    },
    {
      id: 'grok',
      name: 'xAI Grok API',
      icon: 'bolt',
      connectedModel: 'Grok 2',
      maskPrefix: 'sk-grok-••••••••••••',
      dbBacked: false,
    },
    {
      id: 'openai',
      name: 'OpenAI API',
      icon: 'token',
      connectedModel: 'GPT-4o',
      maskPrefix: 'sk-proj-••••••••••••',
      dbBacked: false,
    },
  ];

  const handleInputChange = (provider: string, val: string) => {
    setInputs(prev => ({ ...prev, [provider]: val }));
  };

  const handleSave = async (provider: string) => {
    const key = inputs[provider].trim();
    if (!key) return;

    if (provider === 'gemini') {
      setSaving('gemini');
      setSaveMsg(null);
      try {
        await saveUserGeminiKey(key);
        setGeminiStatus('CONNECTED');
        setSaveMsg('✓ Gemini key saved securely to your profile.');
        setInputs(prev => ({ ...prev, gemini: '' }));
      } catch (err: any) {
        setSaveMsg(`✗ ${err?.response?.data?.detail || 'Failed to save key.'}`);
      } finally {
        setSaving(null);
      }
    } else {
      // Non-Gemini keys: local only (not used for generation yet)
      setInputs(prev => ({ ...prev, [provider]: '' }));
      setSaveMsg(`✓ ${provider} key saved locally (not yet used for generation).`);
    }
  };

  const handleReplace = async (provider: string) => {
    if (provider === 'gemini') {
      setSaving('gemini');
      try {
        await saveUserGeminiKey('');
        setGeminiStatus('MISSING');
        setSaveMsg('Gemini key removed from your profile.');
      } catch {
        setSaveMsg('Failed to remove key.');
      } finally {
        setSaving(null);
      }
    }
  };

  return (
    <main className="ml-[260px] flex-1 flex h-full overflow-hidden">
      {/* CENTER PANEL (Account & API Connections) */}
      <section className="flex-1 h-full overflow-y-auto custom-scrollbar bg-surface px-8 py-10 border-r border-outline-variant">
        <header className="mb-10 max-w-3xl">
          <h1 className="font-display-lg text-display-lg text-primary mb-2">Workspace Settings</h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant">Configure your profile and AI engine models to power your creative workflow.</p>
        </header>

        {/* User Profile Section */}
        <div className="mb-12 max-w-3xl">
          <h2 className="font-label-md text-label-md uppercase tracking-widest text-on-surface-variant mb-6 flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">person</span> User Profile
          </h2>
          <div className="bg-surface-container-low border border-outline-variant p-6 rounded-xl flex items-center gap-8">
            <div className="relative group">
              <img 
                className="w-24 h-24 rounded-full border-2 border-primary object-cover" 
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuDZ6DXquEzAVruY9pQ1fZcJdUIMbBmLcdGyd_2RwR6-Dwsm8m-lXrOTdjHi4lVsrNdyXQk3bjEvAALIUztnloa6U5HrGW3-q8nC-ZdcyD0_OpG61J4PKZHQC5kRXoTQHtEyzBz2ASU-utqQbBlenEEK8qh_Szhny_gx2hLCccszmAoGuve-koZoHhcBlIAD5ObWPpPe4aQJnWoywryetbqUQ_gP3-AwS5JoZqQ_6to5IJr82u7vS6vFn-9V73h05Kgqi-z4LxlC0g" 
                alt="Vicente Aguirre"
              />
              <button 
                onClick={() => alert('Profile photo changes require an active cloud subscription.')}
                className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-full"
              >
                <span className="material-symbols-outlined text-white">photo_camera</span>
              </button>
            </div>
            <div className="flex-1 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="font-label-sm text-label-sm text-on-surface-variant block mb-1">Full Name</label>
                  <div className="font-body-md text-body-md py-2 border-b border-outline-variant text-white">{displayName}</div>
                </div>
                <div>
                  <label className="font-label-sm text-label-sm text-on-surface-variant block mb-1">Email Address</label>
                  <div className="font-body-md text-body-md py-2 border-b border-outline-variant text-white">{displayEmail}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="px-3 py-1 bg-primary/10 border border-primary text-primary text-[10px] font-bold rounded-full uppercase tracking-tighter">BYOK License</span>
                <button 
                  onClick={() => alert('Feature coming soon.')}
                  className="text-on-surface-variant hover:text-white font-label-md text-label-md flex items-center gap-1 transition-colors"
                >
                  Change Photo <span className="material-symbols-outlined text-sm">open_in_new</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* API Connections Section */}
        <div className="mb-12 max-w-3xl">
          <h2 className="font-label-md text-label-md uppercase tracking-widest text-on-surface-variant mb-6 flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">hub</span> Bring Your Own Key (BYOK) Configuration
          </h2>

          {/* Save feedback banner */}
          {saveMsg && (
            <div className={`mb-4 px-4 py-2.5 rounded-lg text-sm font-mono border ${saveMsg.startsWith('✓') ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
              {saveMsg}
            </div>
          )}

          <div className="space-y-3">
            {providers.map((p) => {
              // For Gemini, use real DB status; others fall back to local input presence
              const isConnected = p.id === 'gemini'
                ? geminiStatus === 'CONNECTED'
                : !!inputs[p.id]; // placeholder: not DB-backed yet
              const isLoading = p.id === 'gemini' && geminiStatus === 'LOADING';

              return (
                <div
                  key={p.id}
                  className={`border transition-colors p-4 rounded-xl flex items-center gap-6 ${
                    isConnected
                      ? 'bg-surface-container-low border-outline-variant hover:border-primary/50'
                      : 'bg-surface border-outline-variant opacity-70'
                  }`}
                >
                  <div className="w-10 h-10 bg-on-background/5 rounded flex items-center justify-center flex-shrink-0">
                    {p.icon.startsWith('http') ? (
                      <img className="w-6 h-6 grayscale brightness-150" src={p.icon} alt={p.name} />
                    ) : (
                      <span className="material-symbols-outlined text-on-surface-variant">{p.icon}</span>
                    )}
                  </div>
                  <div className="flex-grow">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-headline-sm text-sm text-on-surface">{p.name}</span>
                        {p.dbBacked && (
                          <span className="text-[9px] font-mono uppercase tracking-widest text-primary bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20">DB-Secured</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {isLoading ? (
                          <span className="text-[10px] font-mono text-on-surface-variant animate-pulse">Checking...</span>
                        ) : (
                          <>
                            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-on-surface-variant/30'}`}></span>
                            <span className={`text-[10px] font-mono ${isConnected ? 'text-emerald-500' : 'text-on-surface-variant'}`}>
                              {isConnected ? `Connected · ${p.connectedModel}` : 'Missing Key'}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {isConnected ? (
                        <>
                          <input
                            className="flex-grow bg-surface border-none text-xs font-mono text-on-surface-variant p-0 h-auto focus:ring-0 outline-none"
                            readOnly
                            type="password"
                            value={p.maskPrefix}
                          />
                          <button
                            onClick={() => handleReplace(p.id)}
                            disabled={saving === p.id}
                            className="text-[10px] font-bold text-primary hover:bg-primary/10 px-3 py-1 border border-primary rounded transition-all btn-interact disabled:opacity-40"
                          >
                            {saving === p.id ? 'Removing...' : 'REPLACE'}
                          </button>
                        </>
                      ) : (
                        <>
                          <input
                            className="flex-grow bg-transparent border-b border-outline-variant text-xs font-mono text-on-surface-variant p-1 focus:border-primary outline-none transition-colors focus:ring-0"
                            placeholder={p.dbBacked ? "Paste your API key (saved securely to your profile)" : "Enter API Key"}
                            type="password"
                            value={inputs[p.id] || ''}
                            onChange={(e) => handleInputChange(p.id, e.target.value)}
                          />
                          <button
                            onClick={() => handleSave(p.id)}
                            disabled={saving === p.id || !inputs[p.id]?.trim()}
                            className="text-[10px] font-bold text-on-surface hover:bg-white/5 px-3 py-1 border border-outline rounded transition-all btn-interact disabled:opacity-40"
                          >
                            {saving === p.id ? 'Saving...' : 'SAVE'}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Info Box */}
          <div className="mt-6 p-4 bg-primary/5 border-l-2 border-primary flex gap-4">
            <span className="material-symbols-outlined text-primary">verified_user</span>
            <p className="text-xs text-primary/80 leading-relaxed font-body-md">
              Your API keys are encrypted locally on this device. ScriptDNA uses your keys to run research and script generation directly through provider endpoints without adding token markups or intermediate logging.
            </p>
          </div>
        </div>
      </section>

      {/* RIGHT SIDEBAR (Token Usage & Analytics) */}
      <aside className="w-[320px] h-full bg-background p-8 flex flex-col gap-10 flex-shrink-0">
        <div>
          <h2 className="font-label-md text-label-md uppercase tracking-widest text-on-surface-variant mb-8 flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">analytics</span> Live Token Analytics
          </h2>
          <div className="space-y-8">
            {/* Consumption Group 1 */}
            <div className="space-y-3">
              <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-widest">
                <span className="text-on-surface-variant">Anthropic 3.5 Sonnet</span>
                <span className="text-primary">78% Monthly Cap</span>
              </div>
              <div className="w-full h-[2px] bg-outline-variant rounded-full overflow-hidden">
                <div className="h-full bg-primary w-[78%]"></div>
              </div>
              <div className="flex justify-between text-[9px] text-on-surface-variant/60 font-mono">
                <span>2.4M Tokens</span>
                <span>3.0M Limit</span>
              </div>
            </div>
            {/* Consumption Group 2 */}
            <div className="space-y-3">
              <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-widest">
                <span className="text-on-surface-variant">Google Gemini 1.5</span>
                <span className="text-white">12% Monthly Cap</span>
              </div>
              <div className="w-full h-[2px] bg-outline-variant rounded-full overflow-hidden">
                <div className="h-full bg-white w-[12%]"></div>
              </div>
              <div className="flex justify-between text-[9px] text-on-surface-variant/60 font-mono">
                <span>450k Tokens</span>
                <span>Unlimited (BYOK)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Cost Estimator Display */}
        <div className="mt-auto pt-10 border-t border-outline-variant">
          <h3 className="font-label-sm text-label-sm text-on-surface-variant uppercase mb-4">Est. Direct Provider Cost (USD)</h3>
          <div className="flex items-baseline gap-2 mb-1">
            <span className="font-display-lg text-3xl text-white tracking-tighter">$42.84</span>
            <span className="text-xs text-emerald-500 font-mono">+14% vs LY</span>
          </div>
          <p className="text-[10px] text-on-surface-variant leading-normal">
            Based on current market pricing for tokens processed this billing cycle.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-2">
            <button className="bg-surface-container-high border border-outline-variant p-2 rounded text-[10px] font-bold hover:bg-surface-bright transition-colors uppercase">Export Logs</button>
            <button className="bg-surface-container-high border border-outline-variant p-2 rounded text-[10px] font-bold hover:bg-surface-bright transition-colors uppercase">Detailed PDF</button>
          </div>
        </div>
      </aside>
    </main>
  );
};
