import React, { useState, useRef, useEffect } from 'react';
import { uploadScriptFile, ingestYouTubeUrl, fetchVoiceProfile } from '../services/api';
import type { TrainingSource } from '../services/api';

interface StyleAiTrainingViewProps {
  isAuthenticated: boolean;
  onOpenAuthModal: () => void;
  sources: TrainingSource[];
  onAddSource: (source: TrainingSource) => void;
  onUpdateSource: (id: string, updates: Partial<TrainingSource>) => void;
  onUpdateVoiceProfile: (pacing: string, wpm: number, catchphrases: string[]) => void;
  onRefreshVoiceProfile?: () => void;
  onRefreshTrainingSources?: () => void;
}

export const StyleAiTrainingView: React.FC<StyleAiTrainingViewProps> = ({
  isAuthenticated,
  onOpenAuthModal,
  sources,
  onAddSource,
  onUpdateSource,
  onUpdateVoiceProfile,
  onRefreshVoiceProfile,
  onRefreshTrainingSources,
}) => {
  // Local uploader and fetch inputs states
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [uploadProgress, setUploadProgress] = useState(78);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadingFileName, setUploadingFileName] = useState('');
  const [transcribingCount, setTranscribingCount] = useState(0);

  // Linguistic signatures tag cloud state
  const [tags, setTags] = useState<string[]>(['"Socio"', '"Uff"', '"Literal"', '"Brutal"', '"Actually"', '"Insane"']);
  const [newTag, setNewTag] = useState('');

  // Voice Profile dynamic states
  const [pacingDescription, setPacingDescription] = useState('Punchy & Fast-Paced');
  const [pacingDetail, setPacingDetail] = useState('Your content clusters around 160-180 WPM.');
  const [wpm, setWpm] = useState(170);
  const [confidence, setConfidence] = useState(94);
  const [structuralPatterns, setStructuralPatterns] = useState([
    { id: 'pat-1', text: 'Hooks within first 15s consistently identified.', completed: true },
    { id: 'pat-2', text: 'Retention peaks every 2.5 mins (Visual B-Roll pattern).', completed: true },
    { id: 'pat-3', text: 'Outro Call-to-Action pattern identified.', completed: false },
  ]);

  useEffect(() => {
    const loadProfile = async () => {
      if (isAuthenticated) {
        try {
          const profile = await fetchVoiceProfile();
          setPacingDescription(profile.pacing.description);
          setPacingDetail(`Your content clusters around ${profile.pacing.wpm} WPM.`);
          setWpm(profile.pacing.raw_wpm || 170);
          setTags(profile.catchphrases.map((c: string) => c.startsWith('"') ? c : `"${c}"`));
          setConfidence(profile.confidenceLevel);
          setStructuralPatterns(profile.structuralPatterns);
        } catch (err) {
          console.error('Failed to load voice profile on mount:', err);
        }
      } else {
        setPacingDescription('Punchy & Fast-Paced');
        setPacingDetail('Your content clusters around 160-180 WPM.');
        setWpm(170);
        setTags(['"Socio"', '"Uff"', '"Literal"', '"Brutal"', '"Actually"', '"Insane"']);
        setConfidence(94);
        setStructuralPatterns([
          { id: 'pat-1', text: 'Hooks within first 15s consistently identified.', completed: true },
          { id: 'pat-2', text: 'Retention peaks every 2.5 mins (Visual B-Roll pattern).', completed: true },
          { id: 'pat-3', text: 'Outro Call-to-Action pattern identified.', completed: false },
        ]);
      }
    };
    loadProfile();
  }, [isAuthenticated]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Trigger file browser click
  const handleCardClick = () => {
    if (!isAuthenticated) {
      onOpenAuthModal();
      return;
    }
    fileInputRef.current?.click();
  };

  // File selection upload simulation
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadingFileName(file.name);
    setUploadProgress(0);

    try {
      const response = await uploadScriptFile(file, (progress) => {
        setUploadProgress(progress);
      });

      if (response.success) {
        onAddSource(response.source);
      }
    } catch (err) {
      console.error('File upload failed', err);
    } finally {
      setIsUploading(false);
      setUploadingFileName('');
      // Reset input value
      if (e.target) e.target.value = '';
    }
  };

  // YouTube transcribe simulation
  const handleYouTubeFetch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated) {
      onOpenAuthModal();
      return;
    }
    if (!youtubeUrl.trim()) return;

    const url = youtubeUrl.trim();
    setYoutubeUrl('');

    // Create a temporary processing source
    const tempId = `yt-${Date.now()}`;
    const processingSource: TrainingSource = {
      id: tempId,
      name: `YouTube Ingestion: Connecting...`,
      type: 'youtube',
      status: 'Processing',
      progress: 20,
      metrics: 'Downloading captions from YouTube...',
      timestamp: new Date().toLocaleDateString(),
    };

    onAddSource(processingSource);
    setTranscribingCount(prev => prev + 1);

    // Start a local fake progress ticker to give immediate visual feedback
    let progress = 20;
    const interval = setInterval(() => {
      if (progress < 90) {
        progress += 15;
        onUpdateSource(tempId, {
          progress,
          metrics: `Analyzing linguistic pacing (${progress}%)...`
        });
      }
    }, 400);

    try {
      const response = await ingestYouTubeUrl(url);
      clearInterval(interval);
      if (response.success) {
        onUpdateSource(tempId, {
          name: response.source.name,
          status: 'Indexed',
          progress: undefined,
          metrics: response.source.metrics,
        });

        // Sync the AI Voice Profile sidebar with real analysis data
        if (response.analysis) {
          const ana = response.analysis;
          setPacingDescription(ana.linguistic_pacing);
          setPacingDetail(`Your content clusters around ${ana.words_per_minute} WPM with dynamic volume range.`);
          setWpm(ana.words_per_minute);
          setTags(ana.catchphrases.map((c: string) => c.startsWith('"') ? c : `"${c}"`));
          setConfidence(ana.confidence_level);
          setStructuralPatterns([
            { id: 'pat-1', text: 'Hooks within first 15s consistently identified.', completed: ana.structural_patterns.has_early_hooks },
            { id: 'pat-2', text: `Retention peaks every ${ana.structural_patterns.retention_peak_interval_mins} mins (Visual B-Roll pattern).`, completed: true },
            { id: 'pat-3', text: `Outro Pattern: ${ana.structural_patterns.outro_style}`, completed: true },
          ]);
          // Sync changes to global state
          onUpdateVoiceProfile(ana.linguistic_pacing, ana.words_per_minute, ana.catchphrases);
          onRefreshVoiceProfile?.();
          onRefreshTrainingSources?.();
        }
      }
    } catch (err: any) {
      clearInterval(interval);
      const errorDetail = err?.response?.data?.detail || err?.message || 'Linguistic transcription failed.';
      alert(`Ingestion failed: ${errorDetail}`);
      
      onUpdateSource(tempId, {
        name: `Ingestion Failed: ${url.substring(0, 30)}...`,
        status: 'Indexed',
        progress: undefined,
        metrics: 'Extraction failed (captions disabled)',
      });
    } finally {
      setTranscribingCount(prev => Math.max(0, prev - 1));
    }
  };

  // Add/remove tags from tag cloud
  const handleAddTag = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTag.trim()) return;
    const formatted = newTag.trim().startsWith('"') ? newTag.trim() : `"${newTag.trim()}"`;
    if (!tags.includes(formatted)) {
      setTags([...tags, formatted]);
    }
    setNewTag('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(t => t !== tagToRemove));
  };

  return (
    <div className={`flex flex-grow h-screen overflow-hidden ${!isAuthenticated ? 'blur-md pointer-events-none opacity-50 transition-all duration-700' : ''}`}>
      {/* Center Panel: Editor & Training Canvas */}
      <section className="flex-1 overflow-y-auto custom-scrollbar p-10 flex flex-col gap-10">
        <header className="max-w-4xl mx-auto w-full">
          <h1 className="font-display-lg text-display-lg text-on-surface mb-2 tracking-tighter">Style AI Training</h1>
          <p className="text-body-lg text-on-surface-variant max-w-2xl">Train your personal AI clone by feeding it your past content, scripts, and videos.</p>
        </header>

        <div className="max-w-4xl mx-auto w-full grid grid-cols-1 gap-6">
          {/* CARD 1: Bulk Script Uploader */}
          <div 
            onClick={handleCardClick}
            className="card-border bg-surface-container-low p-8 rounded-lg group hover:border-indigo-accent/50 transition-colors cursor-pointer"
          >
            <div className="flex flex-col items-center justify-center border-2 border-dashed border-outline-variant rounded-lg p-12 transition-all group-hover:bg-surface-container">
              <span className="material-symbols-outlined text-indigo-accent text-5xl mb-4">cloud_upload</span>
              <h3 className="font-headline-sm text-headline-sm text-on-surface mb-1">
                {isUploading ? `Uploading ${uploadingFileName}` : 'Bulk Script Uploader'}
              </h3>
              <p className="text-on-surface-variant text-center mb-6">
                {isUploading ? 'Ingesting data and analyzing structures...' : 'Drop your past video scripts here or click to browse.'}
              </p>

              {/* Progress bar */}
              <div className="w-full max-w-md bg-surface-container-highest h-1 rounded-full overflow-hidden mt-4">
                <div 
                  className="bg-indigo-accent h-full transition-all duration-300" 
                  style={{ width: `${isUploading ? uploadProgress : 78}%` }}
                ></div>
              </div>
              <div className="flex justify-between w-full max-w-md mt-2">
                <span className="text-label-sm text-on-surface-variant">Training Progress</span>
                <span className="text-label-sm text-indigo-accent font-bold">
                  {isUploading ? `${uploadProgress}% Complete` : '78% Complete'}
                </span>
              </div>
            </div>
            {/* Hidden Input File */}
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
              className="hidden" 
              accept=".txt,.pdf,.doc,.docx"
            />
          </div>

          {/* CARD 2: YouTube Ingestion */}
          <div className="card-border bg-surface-container-low p-8 rounded-lg">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 bg-indigo-accent/10 rounded flex items-center justify-center">
                <span className="material-symbols-outlined text-indigo-accent">link</span>
              </div>
              <div>
                <h3 className="font-headline-sm text-headline-sm text-on-surface">YouTube &amp; Audio Link Ingestion</h3>
                <p className="text-body-md text-on-surface-variant">Paste links to your live YouTube videos to analyze your pacing and tone.</p>
              </div>
            </div>
            <form onSubmit={handleYouTubeFetch} className="flex gap-3 focus-indigo">
              <input 
                className="flex-1 bg-surface-container-highest border border-outline-variant rounded px-4 py-3 text-body-md text-on-surface placeholder-on-surface-variant outline-none focus:border-indigo-accent transition-all focus:ring-0" 
                placeholder="https://youtube.com/watch?v=..." 
                type="url"
                required
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
              />
              <button 
                type="submit"
                className="bg-on-surface text-surface px-6 py-3 rounded font-bold hover:bg-white transition-colors flex items-center gap-2 btn-interact"
              >
                <span className="material-symbols-outlined text-sm">transcribe</span>
                Fetch &amp; Transcribe
              </button>
            </form>
            <p className="text-label-sm text-outline mt-3 flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">info</span>
              Our system will auto-transcribe them to analyze your pacing and tone.
            </p>
          </div>

          {/* SECTION: Training Source Inventory */}
          <div className="mt-4">
            <h2 className="font-headline-sm text-headline-sm text-on-surface mb-4">Training Source Inventory</h2>
            <div className="card-border rounded-lg overflow-hidden bg-surface-container-low">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container-high border-b border-outline-variant">
                    <th className="px-6 py-4 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Source Name</th>
                    <th className="px-6 py-4 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Status</th>
                    <th className="px-6 py-4 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider text-right">Metrics</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant">
                  {sources.map((source) => (
                    <tr key={source.id} className="hover:bg-surface-container-high/50 transition-colors">
                      <td className="px-6 py-4 text-on-surface flex items-center gap-3">
                        <span className="material-symbols-outlined text-on-surface-variant text-sm">
                          {source.type === 'file' ? 'description' : 'play_circle'}
                        </span>
                        <span className="truncate max-w-md">{source.name}</span>
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
                      <td className="px-6 py-4 text-right text-on-surface-variant text-label-md">{source.metrics}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* Right Sidebar: AI Analytics */}
      <aside className="w-[340px] h-full bg-surface-container-low border-l border-outline-variant p-6 flex flex-col gap-8 flex-shrink-0">
        <header>
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-indigo-accent text-xl">psychology</span>
            <h2 className="font-headline-sm text-headline-sm text-on-surface">AI Voice Profile</h2>
          </div>
          <p className="text-label-sm text-on-surface-variant">Real-time stylistic analysis</p>
        </header>

        {/* METRIC 1: Linguistic Pacing */}
        <div className="flex flex-col gap-4">
          <label className="text-label-md font-label-md text-on-surface-variant uppercase tracking-widest">Linguistic Pacing</label>
          <div className="relative pt-6 pb-2">
            <div className="h-1 w-full bg-surface-container-highest rounded-full flex justify-between relative">
              <div className="absolute -top-6 left-0 text-[10px] text-on-surface-variant uppercase font-mono">Melodic</div>
              <div className="absolute -top-6 right-0 text-[10px] text-on-surface-variant uppercase font-mono">Aggressive</div>
              {/* Marker */}
              <div 
                className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-indigo-accent rounded-full shadow-[0_0_12px_rgba(99,102,241,0.6)] border-2 border-surface"
                style={{ left: `${Math.min(100, Math.max(0, ((wpm - 80) / 120) * 100))}%` }}
              ></div>
            </div>
          </div>
          <div className="p-3 bg-surface-container-highest rounded border border-outline-variant">
            <span className="text-indigo-accent font-bold">{pacingDescription}</span>
            <p className="text-[11px] text-on-surface-variant mt-1 leading-relaxed">{pacingDetail}</p>
          </div>
        </div>

        {/* METRIC 2: Detected Catchphrases & Slang */}
        <div className="flex flex-col gap-4">
          <label className="text-label-md font-label-md text-on-surface-variant uppercase tracking-widest">Linguistic Signatures</label>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span 
                key={tag} 
                className="px-3 py-1 bg-surface border border-indigo-accent/40 text-indigo-accent rounded font-label-sm text-label-sm hover:border-red-500 hover:text-red-400 transition-colors cursor-pointer group flex items-center gap-1"
                onClick={() => handleRemoveTag(tag)}
                title="Click to remove"
              >
                {tag}
                <span className="text-[10px] text-indigo-accent/60 group-hover:text-red-400 font-bold">&times;</span>
              </span>
            ))}
          </div>
          {/* Add custom tag */}
          <form onSubmit={handleAddTag} className="flex gap-2">
            <input 
              type="text" 
              className="flex-1 bg-surface-container-highest border border-outline-variant rounded px-2.5 py-1 text-xs outline-none focus:border-indigo-accent focus:ring-0 text-white" 
              placeholder='Add signature, e.g. "Actually"'
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
            />
            <button 
              type="submit" 
              className="border border-indigo-accent text-indigo-accent hover:bg-indigo-accent/15 px-3 py-1 rounded text-xs font-bold transition-all"
            >
              Add
            </button>
          </form>
        </div>

        {/* METRIC 3: Structural Habits */}
        <div className="flex flex-col gap-4">
          <label className="text-label-md font-label-md text-on-surface-variant uppercase tracking-widest">Structural Patterns</label>
          <div className="flex flex-col gap-3">
            {structuralPatterns.map((pat) => (
              <div key={pat.id} className="flex items-start gap-3 group">
                <div className={`mt-1 w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border ${
                  pat.completed 
                    ? 'border-indigo-accent bg-indigo-accent/20' 
                    : 'border-outline-variant'
                }`}>
                  {pat.completed && (
                    <span className="material-symbols-outlined text-[12px] text-indigo-accent font-bold" style={{ fontVariationSettings: "'FILL' 1" }}>check</span>
                  )}
                </div>
                <p className={`text-body-md leading-tight ${pat.completed ? 'text-on-surface' : 'text-on-surface-variant'}`}>{pat.text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Confidence Score Banner */}
        <div className="mt-auto p-4 rounded-lg bg-indigo-accent/10 border border-indigo-accent/30">
          <div className="flex items-center justify-between mb-2">
            <span className="text-label-sm text-indigo-accent font-bold">AI CONFIDENCE LEVEL</span>
            <span className="text-headline-sm font-bold text-on-surface">
              {transcribingCount > 0 ? 'CALCULATING...' : `${confidence}%`}
            </span>
          </div>
          <div className="w-full bg-surface-container-highest h-1 rounded-full overflow-hidden">
            <div 
              className={`bg-indigo-accent h-full ${transcribingCount > 0 ? 'animate-pulse' : ''}`} 
              style={{ width: transcribingCount > 0 ? '100%' : `${confidence}%` }}
            ></div>
          </div>
          <p className="text-[10px] text-on-surface-variant mt-3 uppercase tracking-tighter">
            {transcribingCount > 0 ? 'Recalculating features with ingested video...' : 'Profile matches creator signature with high fidelity.'}
          </p>
        </div>
      </aside>
    </div>
  );
};
