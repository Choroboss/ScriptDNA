import React from 'react';
import type { TrainingSource } from '../services/api';

interface DashboardViewProps {
  onSwitchView: (view: string) => void;
  sources: TrainingSource[];
  apiKeys: {
    gemini: string;
    anthropic: string;
    openai: string;
    grok: string;
  };
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onSwitchView,
  sources,
  apiKeys,
}) => {
  const connectedKeysCount = Object.values(apiKeys).filter(Boolean).length;
  const totalSourcesCount = sources.length;
  const processingSourcesCount = sources.filter(s => s.status === 'Processing').length;

  return (
    <section className="flex-1 overflow-y-auto custom-scrollbar bg-surface px-8 py-10">
      <header className="mb-10 max-w-4xl mx-auto w-full">
        <h1 className="font-display-lg text-display-lg text-primary mb-2 tracking-tighter">Creator Studio</h1>
        <p className="font-body-lg text-body-lg text-on-surface-variant">At-a-glance system metrics, AI cloning status, and script projects.</p>
      </header>

      <div className="max-w-4xl mx-auto w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Card 1: Linguistic Clone Status */}
        <div className="card-border bg-surface-container-low p-6 rounded-xl flex flex-col justify-between gap-6 hover:border-primary/50 transition-colors">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-widest">AI VOICE CLONE</span>
              <span className="px-2 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-mono font-bold">READY</span>
            </div>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-4xl font-headline-md text-white font-bold">94%</span>
              <span className="text-xs text-primary font-mono">Confidence Level</span>
            </div>
            <div className="w-full bg-surface-container-highest h-1 rounded-full overflow-hidden mb-4">
              <div className="bg-primary h-full" style={{ width: '94%' }}></div>
            </div>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              Your voice clone is trained and highly aligned with your linguistic patterns.
            </p>
          </div>
          <button 
            onClick={() => onSwitchView('style-ai-training')}
            className="w-full bg-surface-container-high border border-outline-variant hover:bg-surface-bright py-2 rounded text-xs font-bold transition-all uppercase tracking-wider"
          >
            Train AI Clone
          </button>
        </div>

        {/* Card 2: Workspace Data Ingestion */}
        <div className="card-border bg-surface-container-low p-6 rounded-xl flex flex-col justify-between gap-6 hover:border-primary/50 transition-colors">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-widest">DATA INGESTION</span>
              <span className="px-2 py-0.5 rounded bg-secondary-container text-on-surface-variant text-[10px] font-mono font-bold">STABLE</span>
            </div>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-4xl font-headline-md text-white font-bold">{totalSourcesCount}</span>
              <span className="text-xs text-on-surface-variant font-mono">Training Sources</span>
            </div>
            {processingSourcesCount > 0 ? (
              <div className="flex items-center gap-2 mb-4 text-xs text-primary animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping"></span>
                <span>Currently transcribing {processingSourcesCount} sources...</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 mb-4 text-xs text-emerald-500">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                <span>All documents fully indexed</span>
              </div>
            )}
            <p className="text-xs text-on-surface-variant leading-relaxed">
              Feed your AI clone more transcripts, audio feeds, and documents to increase transcription and structure accuracy.
            </p>
          </div>
          <button 
            onClick={() => onSwitchView('style-ai-training')}
            className="w-full bg-surface-container-high border border-outline-variant hover:bg-surface-bright py-2 rounded text-xs font-bold transition-all uppercase tracking-wider"
          >
            Manage Sources
          </button>
        </div>

        {/* Card 3: BYOK Connections */}
        <div className="card-border bg-surface-container-low p-6 rounded-xl flex flex-col justify-between gap-6 hover:border-primary/50 transition-colors">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-widest">BYOK LICENSING</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${connectedKeysCount > 0 ? 'bg-emerald-950/30 text-emerald-400' : 'bg-zinc-800 text-zinc-400'}`}>
                {connectedKeysCount > 0 ? 'ACTIVE' : 'KEYS MISSING'}
              </span>
            </div>
            <div className="flex items-baseline gap-2 mb-4">
              <span className="text-4xl font-headline-md text-white font-bold">{connectedKeysCount}/4</span>
              <span className="text-xs text-on-surface-variant font-mono">Models Connected</span>
            </div>
            
            <div className="space-y-1.5 mb-4">
              <div className="flex items-center justify-between text-[10px] font-mono">
                <span className="text-on-surface-variant">Gemini API:</span>
                <span className={apiKeys.gemini ? 'text-emerald-500' : 'text-zinc-500'}>{apiKeys.gemini ? 'CONNECTED' : 'MISSING'}</span>
              </div>
              <div className="flex items-center justify-between text-[10px] font-mono">
                <span className="text-on-surface-variant">Anthropic API:</span>
                <span className={apiKeys.anthropic ? 'text-emerald-500' : 'text-zinc-500'}>{apiKeys.anthropic ? 'CONNECTED' : 'MISSING'}</span>
              </div>
              <div className="flex items-center justify-between text-[10px] font-mono">
                <span className="text-on-surface-variant">OpenAI API:</span>
                <span className={apiKeys.openai ? 'text-emerald-500' : 'text-zinc-500'}>{apiKeys.openai ? 'CONNECTED' : 'MISSING'}</span>
              </div>
            </div>
          </div>
          <button 
            onClick={() => onSwitchView('settings')}
            className="w-full bg-surface-container-high border border-outline-variant hover:bg-surface-bright py-2 rounded text-xs font-bold transition-all uppercase tracking-wider"
          >
            Configure Keys
          </button>
        </div>
      </div>

      {/* Recent Activity Section */}
      <div className="max-w-4xl mx-auto w-full mt-12">
        <h2 className="font-headline-sm text-headline-sm text-on-surface mb-4">Ingested Sources Log</h2>
        <div className="card-border rounded-lg overflow-hidden bg-surface-container-lowest">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-high border-b border-outline-variant">
                <th className="px-6 py-4 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Source Name</th>
                <th className="px-6 py-4 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Type</th>
                <th className="px-6 py-4 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider text-right">Metrics</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {sources.slice(0, 5).map((source) => (
                <tr key={source.id} className="hover:bg-surface-container-low transition-colors">
                  <td className="px-6 py-4 text-on-surface flex items-center gap-3">
                    <span className="material-symbols-outlined text-on-surface-variant text-sm">
                      {source.type === 'file' ? 'description' : 'play_circle'}
                    </span>
                    <span className="truncate max-w-xs">{source.name}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-[10px] font-bold rounded border uppercase ${
                      source.status === 'Indexed' 
                        ? 'bg-green-900/20 text-green-400 border-green-500/30' 
                        : 'bg-indigo-900/20 text-indigo-400 border-indigo-500/30 animate-pulse-indigo'
                    }`}>
                      {source.status === 'Indexed' ? 'Indexed' : `Processing ${source.progress || 0}%`}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-on-surface-variant text-xs capitalize">{source.type}</td>
                  <td className="px-6 py-4 text-right text-on-surface-variant text-label-md">{source.metrics}</td>
                </tr>
              ))}
              {sources.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-on-surface-variant font-mono text-xs">
                    No sources ingested yet. Go to Style AI Training to clone your writing DNA.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};
