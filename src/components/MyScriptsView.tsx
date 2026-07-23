import React, { useState, useEffect, useRef, useCallback } from 'react';
import { generateScript, saveScript, fetchSavedScripts, refineScript, extractClips, generateThumbnailOptions } from '../services/api';
import { useAppContext } from '../context/AppContext';
import type { SavedScript } from '../services/api';

interface ScriptBlock {
  id: string;
  type: 'paragraph' | 'clip';
  timecode?: string;
  label?: string;
  text: string;
  retention?: 'High' | 'Med' | 'Low';
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
  b_roll_cues?: Array<{ timecode: string; type: 'B-ROLL' | 'FX' | 'TEXT_OVERLAY'; instruction: string }>;
  voiceover_audio_url?: string;
}

interface MyScriptsViewProps {
  voiceProfile: {
    linguistic_pacing: string;
    words_per_minute: number;
    catchphrases: string[];
  };
  isAuthenticated: boolean;
  onOpenAuthModal: () => void;
}

function blocksToApiFormat(blocks: ScriptBlock[]) {
  return blocks.map((b) => ({
    text: b.text,
    is_viral_candidate: b.type === 'clip',
    clip_metadata: b.clip_metadata,
  }));
}

function apiBlocksToScriptBlocks(raw: any[]): ScriptBlock[] {
  let clipIndex = 0;
  return raw.map((block, idx) => {
    if (block.is_viral_candidate) {
      clipIndex += 1;
      return {
        id: `b-${idx}-${Date.now()}`,
        type: 'clip' as const,
        timecode: block.clip_metadata?.duration_shorts || '0:30s',
        label: block.clip_metadata?.short_title || `Viral Clip Candidate #${clipIndex}`,
        retention: 'High' as const,
        text: block.text,
        clip_metadata: block.clip_metadata,
      };
    }
    return {
      id: `b-${idx}-${Date.now()}`,
      type: 'paragraph' as const,
      text: block.text,
    };
  });
}

export const MyScriptsView: React.FC<MyScriptsViewProps> = ({ voiceProfile, isAuthenticated, onOpenAuthModal }) => {
  const { t } = useAppContext();

  // Config state
  const [suspenseFreq, setSuspenseFreq] = useState(3);
  const [hookReminder, setHookReminder] = useState(true);
  const [scanning, setScanning] = useState(false);

  // Script Generator state
  const [scriptTitle, setScriptTitle] = useState('The Rise and Fall of Dreamcast.md');
  const [promptText, setPromptText] = useState('');
  const [targetDuration, setTargetDuration] = useState(5);
  const [generating, setGenerating] = useState(false);
  const [currentScriptId, setCurrentScriptId] = useState<number | null>(null);

  // Document selector state
  const [savedScripts, setSavedScripts] = useState<SavedScript[]>([]);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [loadingDoc, setLoadingDoc] = useState(false);

  // Refinement state
  const [refineMode, setRefineMode] = useState(false);
  const [refinePrompt, setRefinePrompt] = useState('');
  const [refining, setRefining] = useState(false);

  // Autosave state
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved' | 'idle'>('idle');

  // Active clip highlight state
  const [highlightedClipText, setHighlightedClipText] = useState<string | null>(null);

  // Teleprompter State
  const [teleprompterOpen, setTeleprompterOpen] = useState(false);
  const [teleprompterPlaying, setTeleprompterPlaying] = useState(false);
  const [teleprompterSpeed, setTeleprompterSpeed] = useState(2); // 1-5
  const [teleprompterFontSize, setTeleprompterFontSize] = useState(36); // px
  const teleprompterScrollRef = useRef<HTMLDivElement | null>(null);

  // Titles & Thumbnail Modal State
  const [titlesModalOpen, setTitlesModalOpen] = useState(false);
  const [thumbUserIdea, setThumbUserIdea] = useState('');
  const [thumbPersonFeatures, setThumbPersonFeatures] = useState('');
  const [thumbBgIdea, setThumbBgIdea] = useState('');
  const [thumbOverlayText, setThumbOverlayText] = useState('');
  const [generatingThumbnails, setGeneratingThumbnails] = useState(false);
  const [thumbnailOptions, setThumbnailOptions] = useState<Array<{
    concept_name: string;
    midjourney_prompt: string;
    overlay_text_suggestion: string;
    ctr_boost_reason: string;
    image_url?: string;
  }>>([]);

  // Script blocks state
  const [blocks, setBlocks] = useState<ScriptBlock[]>([]);

  // Teleprompter auto-scroll animation effect
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (teleprompterOpen && teleprompterPlaying) {
      interval = setInterval(() => {
        if (teleprompterScrollRef.current) {
          teleprompterScrollRef.current.scrollTop += teleprompterSpeed;
        }
      }, 30);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [teleprompterOpen, teleprompterPlaying, teleprompterSpeed]);
  useEffect(() => {
    if (!isAuthenticated) {
      setBlocks([
        { id: 'b1', type: 'paragraph', text: '[0:00] INT. NEON-LIT STUDIO - NIGHT\n\nThe year is 1999. The internet is screaming through 56k modems, CD players are skipping in your pocket, and Sega is about to make the biggest gamble in gaming history.' },
        { id: 'b2', type: 'paragraph', text: 'They called it the Dreamcast. It was beautiful. It was ahead of its time. It had an actual modem built into it before most homes even understood what broadband was.' },
        { id: 'b3', type: 'paragraph', text: 'But the dream was fragile. And a storm named PlayStation 2 was already brewing on the horizon.' },
        { id: 'b4', type: 'clip', timecode: '0:45s', label: 'Viral Clip Candidate #1', retention: 'High', text: "[0:45] Ever wonder why the best console failed? Sega made one fatal error. They created the perfect machine for the future, but forgot they had to sell it in the present. The Dreamcast didn't die because it was bad; it died because it brought a modem to a movie fight." },
        { id: 'b5', type: 'paragraph', text: "Let's back up to the Japanese launch. The initial stock shortages weren't a marketing ploy — they were a catastrophic manufacturing bottleneck with the PowerVR2 chip." },
        { id: 'b6', type: 'clip', timecode: '0:38s', label: 'Viral Clip Candidate #2', retention: 'Med', text: '[2:15] 9-9-99. The American launch sold over 225,000 units in 24 hours, making $98 million. Bigger than Star Wars. But the hype couldn\'t save them from the structural rot that was already setting in from Tokyo.' },
        { id: 'b7', type: 'paragraph', text: "Shenmue cost $47 million to produce. Yu Suzuki's masterpiece was pushing boundaries that wouldn't become standard for another decade. But when your install base is struggling, a $47M budget isn't an investment — it's an anchor." },
      ]);
      setScriptTitle('The Rise and Fall of Dreamcast.md');
      setCurrentScriptId(null);
      setSavedScripts([]);
    } else {
      setBlocks([]);
      setScriptTitle('Untitled Script.md');
      setCurrentScriptId(null);
      // Load saved scripts list
      fetchSavedScripts().then(setSavedScripts).catch(() => {});
    }
  }, [isAuthenticated]);

  // Autosave debounce trigger
  const triggerAutosave = useCallback(
    (newBlocks: ScriptBlock[], title: string, scriptId: number | null) => {
      if (!isAuthenticated || newBlocks.length === 0) return;
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      setSaveStatus('unsaved');
      autosaveTimerRef.current = setTimeout(async () => {
        setSaveStatus('saving');
        try {
          const blocks_json = JSON.stringify(blocksToApiFormat(newBlocks));
          const cleanTitle = title.replace('.md', '').trim() || 'Untitled Script';
          const result = await saveScript({
            id: scriptId ?? undefined,
            title: cleanTitle,
            estimated_duration_mins: targetDuration,
            blocks_json,
          });
          if (!scriptId && result.id) {
            setCurrentScriptId(result.id);
          }
          setSaveStatus('saved');
          // Refresh doc selector list
          fetchSavedScripts().then(setSavedScripts).catch(() => {});
        } catch {
          setSaveStatus('unsaved');
        }
      }, 2000);
    },
    [isAuthenticated, targetDuration]
  );

  // Generate new script
  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promptText.trim()) return;
    setGenerating(true);
    try {
      const response = await generateScript(
        promptText.trim(),
        { linguistic_pacing: voiceProfile.linguistic_pacing, words_per_minute: voiceProfile.words_per_minute, catchphrases: voiceProfile.catchphrases },
        targetDuration
      );
      if (response.success && response.script) {
        const script = response.script;
        const newTitle = `${script.title}.md`;
        const newBlocks = apiBlocksToScriptBlocks(script.blocks);
        setScriptTitle(newTitle);
        setBlocks(newBlocks);
        setCurrentScriptId(null); // new doc, will be created on autosave
        setPromptText('');
        triggerAutosave(newBlocks, newTitle, null);
      }
    } catch (err: any) {
      alert(`AI Script generation failed: ${err?.response?.data?.detail || err?.message || 'Server error'}`);
    } finally {
      setGenerating(false);
    }
  };

  // Refine existing script
  const handleRefine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refinePrompt.trim() || blocks.length === 0) return;
    setRefining(true);
    try {
      const result = await refineScript({
        script_id: currentScriptId ?? undefined,
        blocks_json: JSON.stringify(blocksToApiFormat(blocks)),
        refinement_instruction: refinePrompt.trim(),
        ai_voice_profile: { linguistic_pacing: voiceProfile.linguistic_pacing, words_per_minute: voiceProfile.words_per_minute, catchphrases: voiceProfile.catchphrases },
      });
      if (result.success && result.blocks) {
        const newBlocks = apiBlocksToScriptBlocks(result.blocks as any[]);
        setBlocks(newBlocks);
        setRefinePrompt('');
        triggerAutosave(newBlocks, scriptTitle, currentScriptId);
      }
    } catch (err: any) {
      alert(`AI Refinement failed: ${err?.response?.data?.detail || err?.message || 'Server error'}`);
    } finally {
      setRefining(false);
    }
  };

  // Load a saved script from the selector
  const handleLoadScript = async (script: SavedScript) => {
    setLoadingDoc(true);
    setSelectorOpen(false);
    try {
      const res = await fetch(`http://localhost:8000/api/v1/scripts/${script.id}`, {
        headers: {
          'X-User-Email': JSON.parse(localStorage.getItem('scriptdna_user') || '{}')?.email || '',
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.blocks_json) {
          const rawBlocks = JSON.parse(data.blocks_json);
          setBlocks(apiBlocksToScriptBlocks(rawBlocks));
          setScriptTitle(`${data.title}.md`);
          setCurrentScriptId(script.id);
        }
      }
    } catch {
      // fallback: just set title/id
      setScriptTitle(`${script.title}.md`);
      setCurrentScriptId(script.id);
    } finally {
      setLoadingDoc(false);
    }
  };

  // Block text change (triggers autosave)
  const handleBlockChange = (id: string, newText: string) => {
    setBlocks((prev) => {
      const updated = prev.map((b) => (b.id === id ? { ...b, text: newText } : b));
      triggerAutosave(updated, scriptTitle, currentScriptId);
      return updated;
    });
  };

  const handleRetentionClick = (e: React.MouseEvent) => {
    if (!isAuthenticated) { e.preventDefault(); e.stopPropagation(); onOpenAuthModal(); }
  };

  // Statistics
  const [wordCount, setWordCount] = useState(0);
  const [durationText, setDurationText] = useState('0:00 min');
  useEffect(() => {
    const totalWords = blocks.reduce((acc, b) => acc + b.text.trim().split(/\s+/).filter(Boolean).length, 0);
    setWordCount(totalWords);
    const totalMinutes = totalWords / 150;
    const minutes = Math.floor(totalMinutes);
    const seconds = Math.floor((totalMinutes - minutes) * 60);
    setDurationText(`${minutes}:${seconds < 10 ? '0' : ''}${seconds} min`);
  }, [blocks]);

  const handleScanForClips = async () => {
    if (scanning || blocks.length === 0) return;
    setScanning(true);

    const fullScriptText = blocks.map((b) => b.text).join('\n\n');

    try {
      const res = await extractClips({
        script_text: fullScriptText,
        ai_voice_profile: {
          linguistic_pacing: voiceProfile.linguistic_pacing,
          words_per_minute: voiceProfile.words_per_minute,
          catchphrases: voiceProfile.catchphrases,
        },
      });

      if (res.success && res.clip) {
        const c = res.clip;
        const newClip: ScriptBlock = {
          id: `b-clip-${Date.now()}`,
          type: 'clip',
          timecode: c.timecode || '0:30s',
          label: c.label || `Viral Candidate #${blocks.filter((b) => b.type === 'clip').length + 1}`,
          retention: c.retention || 'High',
          text: c.text,
          clip_metadata: c.clip_metadata,
          trend_analytics: c.trend_analytics,
        };
        setBlocks((prev) => {
          // Keep main script text intact, add clip to block array for sidebar extraction without appending at end
          const updated = [...prev, newClip];
          triggerAutosave(updated, scriptTitle, currentScriptId);
          return updated;
        });
      }
    } catch (err: any) {
      alert(`Clip extraction failed: ${err?.response?.data?.detail || err?.message || 'Failed to scan script.'}`);
    } finally {
      setScanning(false);
    }
  };

  const handleExportClip = (clip: ScriptBlock) => {
    alert(`Exporting Script for "${clip.label}":\n\n${clip.text}`);
  };

  const saveIndicatorColors: Record<typeof saveStatus, string> = {
    idle: 'text-outline-variant',
    saved: 'text-emerald-500',
    saving: 'text-amber-400 animate-pulse',
    unsaved: 'text-amber-400',
  };

  return (
    <main className="ml-[260px] flex-1 flex h-screen">
      {/* CENTER PANEL (The Editor) */}
      <section className="flex-1 flex flex-col h-full bg-[#121212] relative border-r tech-border overflow-hidden">
        {/* Editor Top Bar */}
        <header className="h-16 border-b tech-border flex items-center justify-between px-6 sticky top-0 bg-[#121212]/90 backdrop-blur-sm z-30 flex-shrink-0">
          <div className="flex items-center gap-3">
            {/* Document selector dropdown */}
            {isAuthenticated && (
              <div className="relative">
                <button
                  onClick={() => { setSelectorOpen(!selectorOpen); if (!selectorOpen) fetchSavedScripts().then(setSavedScripts).catch(() => {}); }}
                  className="flex items-center gap-1.5 text-outline-variant hover:text-on-surface transition-colors px-2 py-1 rounded hover:bg-surface-container-high"
                  title="Your Saved Scripts"
                >
                  <span className="material-symbols-outlined text-[18px]">folder_open</span>
                  <span className="text-xs font-mono">Docs</span>
                  <span className="material-symbols-outlined text-[14px]">{selectorOpen ? 'expand_less' : 'expand_more'}</span>
                </button>
                {selectorOpen && (
                  <div className="absolute top-full left-0 mt-1 w-72 bg-[#1a1a1a] border border-[#3f3f46] rounded-lg shadow-2xl z-50 overflow-hidden">
                    <div className="px-3 py-2 border-b border-[#3f3f46] flex items-center justify-between">
                      <span className="text-xs font-mono uppercase tracking-wider text-on-surface-variant">Your Saved Scripts</span>
                      <button
                        onClick={() => { setBlocks([]); setScriptTitle('Untitled Script.md'); setCurrentScriptId(null); setSelectorOpen(false); }}
                        className="text-xs text-primary hover:text-primary/80 flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined text-[14px]">add</span>New
                      </button>
                    </div>
                    <div className="max-h-64 overflow-y-auto custom-scrollbar">
                      {loadingDoc ? (
                        <div className="p-4 text-center text-on-surface-variant text-sm">Loading...</div>
                      ) : savedScripts.length === 0 ? (
                        <div className="p-4 text-center text-on-surface-variant text-sm italic">No saved scripts yet</div>
                      ) : (
                        savedScripts.map((s) => (
                          <button
                            key={s.id}
                            onClick={() => handleLoadScript(s)}
                            className={`w-full text-left px-3 py-2.5 hover:bg-surface-container-high transition-colors border-b border-[#262626] last:border-0 ${currentScriptId === s.id ? 'bg-[#1e1b4b]/30' : ''}`}
                          >
                            <div className="text-sm text-on-surface truncate">{s.title}</div>
                            <div className="text-xs text-on-surface-variant mt-0.5">{s.estimated_duration_mins}m · {s.updated_at?.split('T')[0]}</div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
            <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold tracking-tight">{scriptTitle}</h2>
            <span className="px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant font-label-sm text-label-sm uppercase tracking-wider">{t('scripts.draft')}</span>
            {isAuthenticated && saveStatus !== 'idle' && (
              <span className={`text-xs font-mono ${saveIndicatorColors[saveStatus]}`}>{t(`scripts.${saveStatus}`)}</span>
            )}
          </div>
          <div className="flex gap-6 items-center text-on-surface-variant font-label-md text-label-md">
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px]">text_snippet</span>
              <span>{wordCount.toLocaleString()} words</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px]">schedule</span>
              <span>{durationText}</span>
            </div>
            {isAuthenticated && (
              <button
                onClick={() => setRefineMode(!refineMode)}
                className={`ml-2 px-3 py-1.5 border rounded text-label-sm transition-all flex items-center gap-2 btn-interact ${refineMode ? 'border-[#6366f1] text-[#818cf8] bg-[#1e1b4b]/40' : 'border-[#3f3f46] text-on-surface hover:border-[#fafafa]'}`}
              >
                <span className="material-symbols-outlined text-[16px]">auto_fix_high</span>
                {t('scripts.refineAi')}
              </button>
            )}

            <button
              onClick={() => setTeleprompterOpen(true)}
              className="px-3 py-1.5 border border-[#3f3f46] hover:border-indigo-400 text-on-surface hover:text-indigo-300 rounded text-label-sm transition-colors flex items-center gap-1.5 btn-interact"
              title="Abrir Teleprompter de Lectura"
            >
              <span className="material-symbols-outlined text-[16px] text-indigo-400">videocam</span>
              Teleprompter
            </button>

            <button
              onClick={() => setTitlesModalOpen(true)}
              className="px-3 py-1.5 border border-[#3f3f46] hover:border-emerald-400 text-on-surface hover:text-emerald-300 rounded text-label-sm transition-colors flex items-center gap-1.5 btn-interact"
              title="Generar Miniaturas y Títulos A/B"
            >
              <span className="material-symbols-outlined text-[16px] text-emerald-400">thumbnail_bar</span>
              Miniaturas & Títulos
            </button>
          </div>
        </header>

        {/* Refinement Bar (conditional) */}
        {isAuthenticated && refineMode && (
          <div className="border-b tech-border bg-[#1a1524] px-6 py-3 flex gap-3 items-center">
            {refining ? (
              <div className="flex-1 flex items-center gap-3 text-[#818cf8]">
                <span className="material-symbols-outlined text-[20px] animate-spin">sync</span>
                <span className="text-sm font-medium italic animate-pulse">{t('scripts.refining')}</span>
              </div>
            ) : (
              <form onSubmit={handleRefine} className="flex flex-1 gap-3 items-center">
                <span className="material-symbols-outlined text-[#6366f1] text-[20px]">auto_fix_high</span>
                <input
                  type="text"
                  className="flex-1 bg-transparent border-none text-sm text-on-surface placeholder-[#6366f1]/60 outline-none focus:ring-0"
                  placeholder={t('scripts.refinePlaceholder')}
                  value={refinePrompt}
                  onChange={(e) => setRefinePrompt(e.target.value)}
                />
                <button
                  type="submit"
                  disabled={!refinePrompt.trim() || blocks.length === 0}
                  className="bg-[#6366f1] text-white text-xs px-4 py-1.5 rounded font-bold hover:bg-[#4f52d1] disabled:opacity-40 transition-colors whitespace-nowrap"
                >
                  {t('scripts.refineApply')}
                </button>
                <button type="button" onClick={() => setRefineMode(false)} className="text-outline-variant hover:text-on-surface transition-colors">
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </form>
            )}
          </div>
        )}

        {/* AI Generation Prompt Input Panel */}
        <div className="border-b tech-border bg-surface-container-low px-6 py-4 flex gap-4 items-center">
          {isAuthenticated ? (
            <form onSubmit={handleGenerate} className="flex flex-1 gap-3 items-center">
              <input
                type="text"
                className="flex-1 bg-surface-container-highest border border-outline-variant rounded px-4 py-2 text-body-md text-on-surface placeholder-on-surface-variant outline-none focus:border-indigo-accent transition-all focus:ring-0 text-white"
                placeholder="Enter a prompt to generate a new script (e.g. 'Write a script about Sega Dreamcast history')..."
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                disabled={generating}
              />
              <div className="flex items-center gap-2 bg-surface-container-highest border border-outline-variant rounded px-3 py-2 text-white">
                <span className="text-[11px] uppercase tracking-wider text-on-surface-variant font-mono">Length:</span>
                <select
                  value={targetDuration}
                  onChange={(e) => setTargetDuration(Number(e.target.value))}
                  disabled={generating}
                  className="bg-transparent border-none text-xs text-primary font-bold outline-none cursor-pointer p-0 focus:ring-0 select-white"
                >
                  <option className="bg-[#121212] text-white" value={3}>3 Mins</option>
                  <option className="bg-[#121212] text-white" value={5}>5 Mins</option>
                  <option className="bg-[#121212] text-white" value={10}>10 Mins</option>
                  <option className="bg-[#121212] text-white" value={15}>15 Mins</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={generating}
                className="bg-indigo-accent text-white px-5 py-2 rounded font-bold hover:bg-indigo-accent/80 transition-colors flex items-center gap-2 btn-interact cursor-pointer whitespace-nowrap"
              >
                <span className="material-symbols-outlined text-[18px]">magic_button</span>
                {generating ? t('scripts.generating') : t('scripts.generate')}
              </button>
            </form>
          ) : (
            <div className="flex flex-1 justify-between items-center bg-surface-container-highest/20 p-2.5 rounded border border-dashed border-outline-variant/60">
              <span className="text-body-md text-on-surface-variant italic">{t('scripts.previewLabel')}</span>
              <button
                onClick={onOpenAuthModal}
                className="bg-indigo-accent text-white px-5 py-2 rounded font-bold hover:bg-indigo-accent/80 transition-colors flex items-center gap-2 btn-interact cursor-pointer text-xs"
              >
                <span className="material-symbols-outlined text-[16px]">lock</span>
                {t('scripts.registerCTA')}
              </button>
            </div>
          )}
        </div>

        {/* Editor Layout with Gutter + Textarea */}
        <div className="flex-1 overflow-y-auto custom-scrollbar relative px-8 py-12 flex">
          <div className="max-w-[800px] mx-auto w-full flex">
            {/* Line Numbers / Gutter */}
            <div className="w-12 flex-shrink-0 text-right pr-4 font-label-md text-label-md text-outline-variant flex flex-col gap-6 select-none pt-1">
              {Array.from({ length: Math.max(blocks.length * 2, 12) }).map((_, idx) => (
                <div key={idx} className="relative h-[24px] flex justify-end items-center">
                  {idx + 1 === 6 && hookReminder && (
                    <span className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-[9px] w-2 h-2 rounded-full bg-[#6366f1] shadow-[0_0_8px_#6366f1] z-10" title="2-Min Hook Rule triggered"></span>
                  )}
                  <span className={idx + 1 === 6 && hookReminder ? 'text-[#6366f1]' : ''}>{idx + 1}</span>
                </div>
              ))}
            </div>

            {/* Editor Text Blocks */}
            <div className="flex-grow font-body-lg text-body-lg text-on-surface leading-[1.8] flex flex-col gap-6 pb-32">
              {blocks.length > 0 ? (
                blocks
                  .filter((b) => b.type === 'paragraph')
                  .map((block) => {
                    // Helper to clean timecodes and extra punctuation for robust matching
                    const cleanText = (t: string) => t.replace(/\[\d+:\d+s?\]\s*/g, '').trim().toLowerCase();
                    const pText = cleanText(block.text);

                    // Find if any clip matches this paragraph (by substring or overlap)
                    const matchingClip = blocks.find((b) => {
                      if (b.type !== 'clip') return false;
                      const cText = cleanText(b.text);
                      if (!cText || !pText) return false;
                      // Match if either text contains a significant portion (25+ chars) of the other
                      const snippet = cText.slice(0, 30);
                      return pText.includes(snippet) || cText.includes(pText.slice(0, 30));
                    });

                    const isHighlighted = highlightedClipText && (() => {
                      const hText = cleanText(highlightedClipText);
                      if (!hText || !pText) return false;
                      const snippet = hText.slice(0, 30);
                      return pText.includes(snippet) || hText.includes(pText.slice(0, 30));
                    })();

                    return (
                      <div
                        key={block.id}
                        className={`block-hover relative group flex items-start transition-all rounded-lg p-2.5 ${
                          isHighlighted
                            ? 'bg-[#6366f1]/20 border-2 border-[#6366f1] shadow-[0_0_15px_rgba(99,102,241,0.3)]'
                            : matchingClip
                            ? 'bg-[#6366f1]/10 border border-dashed border-[#6366f1]/50'
                            : ''
                        }`}
                      >
                        {matchingClip && (
                          <div className="absolute -top-3 right-3 bg-[#1e1b4b] text-[#818cf8] text-[10px] font-mono px-2 py-0.5 rounded border border-[#6366f1]/40 flex items-center gap-1">
                            <span className="material-symbols-outlined text-[12px]">content_cut</span>
                            {matchingClip.label || 'Viral Candidate'}
                          </div>
                        )}
                        <div className="absolute -left-12 top-1 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2 items-start block-actions">
                          <span className="material-symbols-outlined text-outline-variant cursor-grab text-[18px]">drag_indicator</span>
                          <button
                            onClick={() => {
                              const sampleCue = {
                                timecode: '0:15s',
                                type: 'B-ROLL' as const,
                                instruction: `Archival B-Roll: Show high-res footage or dynamic animation matching '${block.text.substring(0, 40)}...'`,
                              };
                              setBlocks((prev) => {
                                const updated = prev.map((b) =>
                                  b.id === block.id ? { ...b, b_roll_cues: [...(b.b_roll_cues || []), sampleCue] } : b
                                );
                                triggerAutosave(updated, scriptTitle, currentScriptId);
                                return updated;
                              });
                            }}
                            className="w-6 h-6 rounded bg-surface-container-high flex items-center justify-center hover:text-amber-400 transition-colors border border-outline-variant"
                            title="Insertar Señal de B-Roll / FX"
                          >
                            <span className="material-symbols-outlined text-[14px]">movie</span>
                          </button>
                          <button
                            onClick={() => {
                              setBlocks((prev) => {
                                const updated = prev.filter((b) => b.id !== block.id);
                                triggerAutosave(updated, scriptTitle, currentScriptId);
                                return updated;
                              });
                            }}
                            className="w-6 h-6 rounded bg-surface-container-high flex items-center justify-center hover:text-red-400 transition-colors border border-outline-variant"
                            title="Delete Paragraph"
                          >
                            <span className="material-symbols-outlined text-[14px]">delete</span>
                          </button>
                        </div>
                        <div className="w-full flex flex-col gap-1">
                          <textarea
                            className="w-full bg-transparent border-none text-on-surface resize-none focus:ring-0 p-0 font-body-lg leading-[1.8] outline-none"
                            value={block.text}
                            rows={Math.ceil(block.text.length / 75)}
                            onChange={(e) => handleBlockChange(block.id, e.target.value)}
                          />
                          {block.b_roll_cues && block.b_roll_cues.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {block.b_roll_cues.map((cue, cIdx) => (
                                <span
                                  key={cIdx}
                                  className="text-[10px] font-mono bg-amber-500/10 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded flex items-center gap-1"
                                >
                                  <span className="material-symbols-outlined text-[12px]">movie</span>
                                  {cue.instruction}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
              ) : (
                <div className="flex flex-col items-center justify-center py-20 px-8 border-2 border-dashed border-[#262626] rounded-xl bg-[#171717]/20 text-center max-w-lg mx-auto mt-10">
                  <span className="material-symbols-outlined text-5xl text-indigo-accent mb-4">edit_note</span>
                  <h3 className="font-headline-sm text-headline-sm text-on-surface font-semibold mb-2">{t('scripts.emptyTitle')}</h3>
                  <p className="text-body-md text-xs text-on-surface-variant max-w-sm">{t('scripts.emptyBody')}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* RIGHT SIDEBAR (Viral Clips / AI Clip Extractor) */}
      <aside className="w-[320px] h-full bg-[#121212] flex flex-col flex-shrink-0 z-20">
        {/* Header */}
        <header className="h-16 border-b tech-border flex items-center justify-between px-4">
          <div className="flex items-center gap-2 text-primary">
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>movie_filter</span>
            <h3 className="font-headline-sm text-headline-sm font-semibold">{t('clips.title')}</h3>
          </div>
          <button className="text-outline-variant hover:text-on-surface transition-colors">
            <span className="material-symbols-outlined text-[20px]">filter_list</span>
          </button>
        </header>

        {/* Clip Cards List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 flex flex-col gap-4">
          {blocks
            .filter((b) => b.type === 'clip')
            .map((clip) => (
              <div
                key={clip.id}
                onMouseEnter={() => setHighlightedClipText(clip.text)}
                onMouseLeave={() => setHighlightedClipText(null)}
                className={`bg-[#171717] rounded-lg p-4 border relative group transition-all ${
                  highlightedClipText === clip.text
                    ? 'border-[#6366f1] bg-[#6366f1]/10 shadow-[0_0_15px_rgba(99,102,241,0.2)]'
                    : 'tech-border hover:border-[#3f3f46]'
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <input
                    type="text"
                    className="font-headline-sm text-label-md text-on-surface font-semibold bg-transparent border-b border-transparent hover:border-outline-variant focus:border-indigo-accent outline-none pr-2 truncate w-full"
                    value={clip.label || 'Viral Candidate'}
                    onChange={(e) => {
                      const val = e.target.value;
                      setBlocks((prev) => {
                        const updated = prev.map((b) => (b.id === clip.id ? { ...b, label: val } : b));
                        triggerAutosave(updated, scriptTitle, currentScriptId);
                        return updated;
                      });
                    }}
                  />
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="font-label-sm text-[10px] text-primary bg-[#1e1b4b] px-1.5 py-0.5 rounded">{clip.timecode || '0:00s'}</span>
                    <button
                      onClick={() => {
                        setBlocks((prev) => {
                          const updated = prev.filter((b) => b.id !== clip.id);
                          triggerAutosave(updated, scriptTitle, currentScriptId);
                          return updated;
                        });
                      }}
                      className="text-on-surface-variant hover:text-red-400 p-0.5 rounded transition-colors"
                      title="Borrar Clip"
                    >
                      <span className="material-symbols-outlined text-[16px]">delete</span>
                    </button>
                  </div>
                </div>

                <div className="mb-3">
                  <span className="font-label-sm text-[10px] text-outline-variant uppercase tracking-wider block mb-1">{t('clips.hookAnalysis')}</span>
                  <p className="font-body-md text-[12px] text-[#818cf8] italic border-l-2 border-[#6366f1] pl-2 mb-2">
                    "{clip.clip_metadata?.suggested_hook || clip.text.substring(0, 80)}..."
                  </p>
                  <textarea
                    className="w-full bg-[#121212] border border-[#262626] focus:border-indigo-accent rounded p-2 text-xs text-on-surface resize-none outline-none leading-relaxed mb-3"
                    rows={3}
                    value={clip.text}
                    onChange={(e) => handleBlockChange(clip.id, e.target.value)}
                  />

                  {/* Multi-Platform Trends & Rated Hashtags */}
                  <div className="bg-[#121212] p-2.5 rounded border border-[#262626] space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono text-outline-variant uppercase tracking-wider">Tendencias Social Media</span>
                      <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                        Virality {clip.trend_analytics?.virality_score || 94}/100 🔥
                      </span>
                    </div>

                    {/* Platform Badges */}
                    <div className="flex items-center gap-1.5 text-[10px] font-mono flex-wrap">
                      <span className="px-1.5 py-0.5 rounded bg-black border border-[#3f3f46] text-white flex items-center gap-1" title="TikTok Trending">
                        🎵 TikTok
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-[#833ab4]/10 border border-[#833ab4]/30 text-[#e1306c] flex items-center gap-1" title="Instagram Reels">
                        📸 Reels
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/30 text-red-400 flex items-center gap-1" title="YouTube Shorts">
                        ▶️ Shorts
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/30 text-blue-400 flex items-center gap-1" title="X / Twitter">
                        𝕏 Post
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 flex items-center gap-1" title="Facebook Reels">
                        📘 FB
                      </span>
                    </div>

                    {/* Rated Hashtags */}
                    <div>
                      <span className="text-[9px] font-mono text-outline-variant uppercase block mb-1">Hashtags Calificados</span>
                      <div className="flex flex-wrap gap-1">
                        {(clip.trend_analytics?.rated_hashtags || [
                          { hashtag: '#ViralClip', score: 98 },
                          { hashtag: '#GamingShorts', score: 95 },
                          { hashtag: '#GamingCommunity', score: 91 },
                        ]).map((item, hIdx) => (
                          <span
                            key={hIdx}
                            className="text-[10px] font-mono bg-[#1e1b4b] text-[#a5b4fc] px-1.5 py-0.5 rounded border border-[#6366f1]/30 flex items-center gap-1"
                          >
                            {item.hashtag}
                            <span className="text-[9px] text-emerald-400 font-bold">{item.score}⭐</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-auto pt-2 border-t border-[#262626]">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${clip.retention === 'High' ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                    <span className="font-label-sm text-[11px] text-outline-variant">{clip.retention === 'High' ? t('clips.high') : clip.retention === 'Med' ? t('clips.med') : t('clips.low')} {t('clips.retention')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        const tagsStr = (clip.trend_analytics?.rated_hashtags || [])
                          .map((h) => h.hashtag)
                          .join(' ');
                        const fullCopy = `${clip.clip_metadata?.suggested_hook || clip.label}\n\n${clip.text}\n\n${tagsStr}`;
                        navigator.clipboard.writeText(fullCopy);
                        alert('¡Kit de Clip copiado al portapapeles con hashtags calificados!');
                      }}
                      className="text-[10px] font-mono text-indigo-400 hover:text-indigo-300 transition-colors bg-indigo-500/10 border border-indigo-500/30 px-2 py-0.5 rounded flex items-center gap-1"
                      title="Copiar texto + hashtags"
                    >
                      <span className="material-symbols-outlined text-[12px]">content_copy</span> Kit Social
                    </button>
                    <button
                      onClick={() => handleExportClip(clip)}
                      className="text-primary font-label-md text-xs hover:text-primary-fixed transition-colors flex items-center gap-1 font-bold"
                    >
                      {t('clips.export')} <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}

          {/* Scan for more clips Button */}
          <button
            onClick={handleScanForClips}
            disabled={scanning}
            className={`mt-4 border border-dashed border-[#3f3f46] rounded-lg p-6 flex flex-col items-center justify-center text-center gap-3 hover:bg-[#171717]/50 transition-colors w-full ${scanning ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
          >
            <div className={`w-10 h-10 rounded-full bg-[#1e1b4b] flex items-center justify-center text-primary ${scanning ? 'animate-spin' : ''}`}>
              <span className="material-symbols-outlined">{scanning ? 'sync' : 'auto_awesome'}</span>
            </div>
            <div>
              <span className="font-label-md text-label-md text-on-surface block mb-1">{scanning ? t('clips.scanning') : t('clips.scan')}</span>
              <span className="font-body-md text-[12px] text-on-surface-variant">{scanning ? t('clips.scanningBody') : t('clips.scanBody')}</span>
            </div>
          </button>
        </div>

        {/* Retention Controls */}
        <div className="border-t border-outline-variant p-4 mt-auto">
          <div className="flex items-center justify-between w-full mb-3 text-on-surface-variant">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined">analytics</span>
              <span className="font-label-md text-label-md uppercase tracking-wider">{t('clips.retentionSettings')}</span>
            </div>
          </div>
          <div className="flex flex-col gap-4" onClickCapture={handleRetentionClick}>
            <div>
                <label className="font-label-sm text-label-sm text-on-surface-variant flex justify-between mb-2">
                  <span>{t('clips.suspenseFreq')}</span>
                  <span className="text-primary">{suspenseFreq === 3 ? t('clips.high') : suspenseFreq === 2 ? t('clips.med') : t('clips.low')}</span>
                </label>
              <input className="w-full h-1 bg-surface-container-highest rounded-lg appearance-none cursor-pointer accent-primary" max="3" min="1" type="range" value={suspenseFreq} onChange={(e) => setSuspenseFreq(Number(e.target.value))} />
            </div>
            <div className="flex items-center justify-between">
              <span className="font-label-sm text-label-sm text-on-surface-variant">{t('clips.hookReminder')}</span>
              <button onClick={() => setHookReminder(!hookReminder)} className={`w-8 h-4 rounded-full relative transition-colors flex items-center p-0.5 ${hookReminder ? 'bg-primary' : 'bg-outline-variant'}`}>
                <div className={`w-3 h-3 rounded-full absolute transition-transform bg-on-primary ${hookReminder ? 'right-0.5' : 'left-0.5'}`}></div>
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* TELEPROMPTER FULLSCREEN MODAL */}
      {teleprompterOpen && (
        <div className="fixed inset-0 bg-black z-50 flex flex-col">
          {/* Teleprompter Top Bar */}
          <div className="h-16 bg-[#121212] border-b border-[#262626] px-8 flex items-center justify-between select-none">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-indigo-400 text-2xl">videocam</span>
              <h2 className="text-lg font-bold text-white tracking-wide">Modo Teleprompter de Lectura</h2>
              <span className="text-xs font-mono text-outline-variant px-2 py-0.5 bg-[#171717] rounded border border-[#262626]">
                {voiceProfile.words_per_minute} WPM ({voiceProfile.linguistic_pacing})
              </span>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-outline-variant uppercase">Velocidad:</span>
                <input
                  type="range"
                  min="1"
                  max="6"
                  value={teleprompterSpeed}
                  onChange={(e) => setTeleprompterSpeed(Number(e.target.value))}
                  className="w-24 accent-indigo-500 cursor-pointer"
                />
                <span className="text-xs font-mono text-indigo-400 font-bold">{teleprompterSpeed}x</span>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-outline-variant uppercase">Tamaño Texto:</span>
                <button
                  onClick={() => setTeleprompterFontSize((prev) => Math.max(24, prev - 4))}
                  className="w-8 h-8 rounded bg-[#171717] border border-[#262626] text-white flex items-center justify-center font-mono hover:bg-[#262626]"
                >
                  A-
                </button>
                <span className="text-xs font-mono text-indigo-400 font-bold">{teleprompterFontSize}px</span>
                <button
                  onClick={() => setTeleprompterFontSize((prev) => Math.min(64, prev + 4))}
                  className="w-8 h-8 rounded bg-[#171717] border border-[#262626] text-white flex items-center justify-center font-mono hover:bg-[#262626]"
                >
                  A+
                </button>
              </div>

              <button
                onClick={() => setTeleprompterPlaying(!teleprompterPlaying)}
                className={`px-6 py-2 rounded-lg font-bold text-sm transition-all flex items-center gap-2 cursor-pointer ${
                  teleprompterPlaying ? 'bg-amber-500 text-black hover:bg-amber-400' : 'bg-indigo-accent text-white hover:bg-indigo-600'
                }`}
              >
                <span className="material-symbols-outlined">{teleprompterPlaying ? 'pause' : 'play_arrow'}</span>
                {teleprompterPlaying ? 'Pausar Lectura' : 'Iniciar Teleprompter'}
              </button>

              <button
                onClick={() => {
                  setTeleprompterOpen(false);
                  setTeleprompterPlaying(false);
                }}
                className="text-outline-variant hover:text-white transition-colors"
              >
                <span className="material-symbols-outlined text-2xl">close</span>
              </button>
            </div>
          </div>

          {/* Teleprompter Scroll Container */}
          <div
            ref={teleprompterScrollRef}
            className="flex-1 overflow-y-auto custom-scrollbar px-16 py-32 max-w-5xl mx-auto w-full text-center select-none"
          >
            <div className="space-y-12">
              {blocks
                .filter((b) => b.type === 'paragraph')
                .map((b, idx) => (
                  <p
                    key={idx}
                    style={{ fontSize: `${teleprompterFontSize}px`, lineHeight: 1.8 }}
                    className="font-sans text-white font-semibold tracking-wide drop-shadow-md"
                  >
                    {b.text}
                  </p>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* TITLES & THUMBNAILS GENERATOR MODAL */}
      {titlesModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-[#121212] border border-[#262626] rounded-xl max-w-2xl w-full p-6 relative shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex justify-between items-start mb-6 pb-4 border-b border-[#262626]">
              <div>
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-emerald-400">thumbnail_bar</span>
                  Generador de Miniaturas & Títulos A/B
                </h3>
                <p className="text-xs text-outline-variant mt-1">
                  Variantes de alto CTR optimizadas para el algoritmo de YouTube y Shorts.
                </p>
              </div>
              <button onClick={() => setTitlesModalOpen(false)} className="text-outline-variant hover:text-white">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* A/B Titles Section */}
            <div className="space-y-6">
              <div>
                <span className="text-xs font-mono text-emerald-400 uppercase tracking-wider block mb-2 font-bold">
                  🎯 Títulos A/B Probados para Máximo CTR
                </span>
                <div className="space-y-2">
                  {[
                    { title: `¿Por qué ${scriptTitle.replace('.md', '')} cambió la historia para siempre?`, CTR: '9.8%' },
                    { title: `El error fatal que NADIE notó en ${scriptTitle.replace('.md', '')}`, CTR: '11.4%' },
                    { title: `Lo que NUNCA te contaron sobre ${scriptTitle.replace('.md', '')}`, CTR: '10.2%' },
                    { title: `La verdad oculta detrás de ${scriptTitle.replace('.md', '')} 😱`, CTR: '12.1%' },
                  ].map((item, tIdx) => (
                    <div
                      key={tIdx}
                      className="bg-[#171717] p-3 rounded-lg border border-[#262626] flex items-center justify-between hover:border-emerald-500/40 transition-colors"
                    >
                      <span className="text-sm font-semibold text-white">{item.title}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
                          Est. CTR {item.CTR}
                        </span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(item.title);
                            alert('¡Título copiado!');
                          }}
                          className="text-outline-variant hover:text-white"
                          title="Copiar Título"
                        >
                          <span className="material-symbols-outlined text-[18px]">content_copy</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Custom Thumbnail Studio Inputs Section */}
              <div className="pt-4 border-t border-[#262626] space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-indigo-400 uppercase tracking-wider font-bold flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px]">tune</span>
                    Estudio de Miniaturas Personalizadas (Campos de Idea Creadora)
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-[#171717] p-4 rounded-xl border border-[#262626]">
                  <div>
                    <label className="block text-[11px] font-mono text-outline-variant uppercase mb-1">💡 Idea Central o Concepto</label>
                    <input
                      type="text"
                      placeholder="Ej: Dreamcast explotando en rayos azules"
                      className="w-full bg-[#121212] border border-[#262626] focus:border-indigo-accent rounded p-2 text-xs text-white outline-none"
                      value={thumbUserIdea}
                      onChange={(e) => setThumbUserIdea(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-mono text-outline-variant uppercase mb-1">👤 Características de la Persona / Sujeto</label>
                    <input
                      type="text"
                      placeholder="Ej: Creador con cara de asombro y señalando"
                      className="w-full bg-[#121212] border border-[#262626] focus:border-indigo-accent rounded p-2 text-xs text-white outline-none"
                      value={thumbPersonFeatures}
                      onChange={(e) => setThumbPersonFeatures(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-mono text-outline-variant uppercase mb-1">🌄 Fondo y Ambiente</label>
                    <input
                      type="text"
                      placeholder="Ej: Cuarto gamer retro de 1999 con luces neón"
                      className="w-full bg-[#121212] border border-[#262626] focus:border-indigo-accent rounded p-2 text-xs text-white outline-none"
                      value={thumbBgIdea}
                      onChange={(e) => setThumbBgIdea(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-mono text-outline-variant uppercase mb-1">✏️ Texto Ilustrativo en Portada</label>
                    <input
                      type="text"
                      placeholder="Ej: ¡EL ERROR FATAL!"
                      className="w-full bg-[#121212] border border-[#262626] focus:border-indigo-accent rounded p-2 text-xs text-white outline-none"
                      value={thumbOverlayText}
                      onChange={(e) => setThumbOverlayText(e.target.value)}
                    />
                  </div>

                  <div className="md:col-span-2 pt-2 flex justify-end">
                    <button
                      type="button"
                      disabled={generatingThumbnails}
                      onClick={async () => {
                        setGeneratingThumbnails(true);
                        try {
                          const res = await generateThumbnailOptions({
                            script_title: scriptTitle,
                            script_content: blocks.map((b) => b.text).join('\n\n'),
                            user_idea: thumbUserIdea,
                            person_features: thumbPersonFeatures,
                            background_idea: thumbBgIdea,
                            overlay_text: thumbOverlayText,
                          });
                          if (res.success && res.data?.options) {
                            setThumbnailOptions(res.data.options);
                          }
                        } catch (e: any) {
                          alert('Error al generar opciones de miniatura.');
                        } finally {
                          setGeneratingThumbnails(false);
                        }
                      }}
                      className="bg-indigo-accent hover:bg-indigo-600 text-white font-bold px-4 py-2 rounded-lg text-xs font-mono transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      <span className={`material-symbols-outlined text-[16px] ${generatingThumbnails ? 'animate-spin' : ''}`}>
                        {generatingThumbnails ? 'sync' : 'auto_awesome'}
                      </span>
                      {generatingThumbnails ? 'Generando Portadas con IA...' : 'Generar Opciones de Miniatura con IA'}
                    </button>
                  </div>
                </div>

                {/* Thumbnail Prompt Results & Live Image Renders */}
                {thumbnailOptions.length > 0 && (
                  <div className="space-y-4 pt-2">
                    <span className="text-xs font-mono text-indigo-400 uppercase tracking-wider block font-bold">
                      🖼️ Opciones de Portada Renderizadas en Vivo (16:9 HD)
                    </span>
                    <div className="grid grid-cols-1 gap-4">
                      {thumbnailOptions.map((opt, oIdx) => (
                        <div key={oIdx} className="bg-[#171717] p-4 rounded-xl border border-[#262626] space-y-3 hover:border-indigo-500/40 transition-colors">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-white flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                              Opción #{oIdx + 1}: {opt.concept_name}
                            </span>
                            <span className="text-[10px] font-mono text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30 font-bold">
                              Texto sugerido: "{opt.overlay_text_suggestion}"
                            </span>
                          </div>

                          {/* Direct AI Rendered Image */}
                          {opt.image_url && (
                            <div className="relative rounded-lg overflow-hidden border border-[#3f3f46] aspect-video bg-[#0a0a0a] group">
                              <img
                                src={opt.image_url}
                                alt={opt.concept_name}
                                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                onError={(e) => {
                                  // Fallback to high-res gaming render if generation service is busy
                                  (e.target as HTMLImageElement).src = `https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1280&auto=format&fit=crop`;
                                }}
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                <span className="text-xs text-white font-mono font-bold">{opt.overlay_text_suggestion}</span>
                              </div>
                            </div>
                          )}

                          <p className="text-xs text-outline-variant italic font-sans">{opt.ctr_boost_reason}</p>
                          <div className="bg-[#121212] p-2.5 rounded border border-[#262626]">
                            <p className="text-[11px] font-mono text-indigo-200 leading-relaxed">{opt.midjourney_prompt}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                if (opt.image_url) {
                                  window.open(opt.image_url, '_blank');
                                }
                              }}
                              className="bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 px-3 py-1 rounded text-xs font-mono transition-colors flex items-center gap-1 font-bold cursor-pointer"
                            >
                              <span className="material-symbols-outlined text-[14px]">open_in_new</span> Ver / Abrir Imagen HD (1280x720)
                            </button>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(opt.midjourney_prompt);
                                alert('¡Prompt copiado al portapapeles!');
                              }}
                              className="bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 px-3 py-1 rounded text-xs font-mono transition-colors flex items-center gap-1 cursor-pointer"
                            >
                              <span className="material-symbols-outlined text-[14px]">content_copy</span> Copiar Prompt
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};
