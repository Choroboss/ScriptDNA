import React, { useState, useEffect } from 'react';
import { generateScript } from '../services/api';

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

export const MyScriptsView: React.FC<MyScriptsViewProps> = ({ voiceProfile, isAuthenticated, onOpenAuthModal }) => {
  // Config state
  const [suspenseFreq, setSuspenseFreq] = useState(3);
  const [hookReminder, setHookReminder] = useState(true);
  const [scanning, setScanning] = useState(false);

  // Script Generator state
  const [scriptTitle, setScriptTitle] = useState('The Rise and Fall of Dreamcast.md');
  const [promptText, setPromptText] = useState('');
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promptText.trim()) return;

    setGenerating(true);
    try {
      const response = await generateScript(promptText.trim(), {
        linguistic_pacing: voiceProfile.linguistic_pacing,
        words_per_minute: voiceProfile.words_per_minute,
        catchphrases: voiceProfile.catchphrases,
      });

      if (response.success && response.script) {
        const script = response.script;
        setScriptTitle(`${script.title}.md`);
        
        let clipIndex = 0;
        const newBlocks: ScriptBlock[] = script.blocks.map((block, idx) => {
          if (block.is_viral_candidate) {
            clipIndex += 1;
            return {
              id: `b-${idx}-${Date.now()}`,
              type: 'clip',
              timecode: block.clip_metadata?.duration_shorts || '0:30s',
              label: block.clip_metadata?.short_title || `Viral Clip Candidate #${clipIndex}`,
              retention: 'High',
              text: block.text,
              clip_metadata: block.clip_metadata,
            };
          } else {
            return {
              id: `b-${idx}-${Date.now()}`,
              type: 'paragraph',
              text: block.text,
            };
          }
        });
        setBlocks(newBlocks);
        setPromptText('');
      }
    } catch (err: any) {
      console.error('Failed to generate script', err);
      alert(`AI Script generation failed: ${err?.message || 'Server error'}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleRetentionClick = (e: React.MouseEvent) => {
    if (!isAuthenticated) {
      e.preventDefault();
      e.stopPropagation();
      onOpenAuthModal();
    }
  };

  // Script blocks state
  const [blocks, setBlocks] = useState<ScriptBlock[]>([
    {
      id: 'b1',
      type: 'paragraph',
      text: '[0:00] INT. NEON-LIT STUDIO - NIGHT\n\nThe year is 1999. The internet is screaming through 56k modems, CD players are skipping in your pocket, and Sega is about to make the biggest gamble in gaming history.',
    },
    {
      id: 'b2',
      type: 'paragraph',
      text: 'They called it the Dreamcast. It was beautiful. It was ahead of its time. It had an actual modem built into it before most homes even understood what broadband was.',
    },
    {
      id: 'b3',
      type: 'paragraph',
      text: 'But the dream was fragile. And a storm named PlayStation 2 was already brewing on the horizon.',
    },
    {
      id: 'b4',
      type: 'clip',
      timecode: '0:45s',
      label: 'Viral Clip Candidate #1',
      retention: 'High',
      text: "[0:45] Ever wonder why the best console failed? Sega made one fatal error. They created the perfect machine for the future, but forgot they had to sell it in the present. They built the bridge to online gaming, but PlayStation 2 promised to play DVDs. And in 2000? A DVD player was worth its weight in gold. The Dreamcast didn't die because it was bad; it died because it brought a modem to a movie fight.",
    },
    {
      id: 'b5',
      type: 'paragraph',
      text: "Let's back up to the Japanese launch. The initial stock shortages weren't a marketing ploy; they were a catastrophic manufacturing bottleneck with the PowerVR2 chip.",
    },
    {
      id: 'b6',
      type: 'clip',
      timecode: '0:38s',
      label: 'Viral Clip Candidate #2',
      retention: 'Med',
      text: '[2:15] The date every gamer remembers: September 9, 1999. 9-9-99. The American launch was a masterclass in hype. They sold over 225,000 units in 24 hours, making $98 million. It was the biggest 24 hours in entertainment retail history at the time. Bigger than Star Wars. But the hype couldn\'t save them from the structural rot that was already setting in from Tokyo.',
    },
    {
      id: 'b7',
      type: 'paragraph',
      text: "Shenmue, arguably the crown jewel of the system, cost a staggering $47 million to produce. Yu Suzuki's masterpiece was pushing boundaries that wouldn't become standard for another decade. But when your install base is struggling, a $47 million budget isn't an investment; it's an anchor.",
    },
  ]);

  // Statistics calculation
  const [wordCount, setWordCount] = useState(1842);
  const [durationText, setDurationText] = useState('12:45 min');

  useEffect(() => {
    // Dynamically calculate word count and duration based on block texts
    const totalWords = blocks.reduce((acc, block) => {
      const words = block.text.trim().split(/\s+/).filter(Boolean).length;
      return acc + words;
    }, 0);
    setWordCount(totalWords);

    const totalMinutes = totalWords / 150; // standard speaking rate of 150 WPM
    const minutes = Math.floor(totalMinutes);
    const seconds = Math.floor((totalMinutes - minutes) * 60);
    setDurationText(`${minutes}:${seconds < 10 ? '0' : ''}${seconds} min`);
  }, [blocks]);

  const handleBlockChange = (id: string, newText: string) => {
    setBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, text: newText } : b))
    );
  };

  const handleScanForClips = () => {
    if (scanning) return;
    setScanning(true);
    setTimeout(() => {
      setScanning(false);
      // Append a new clip block
      const newClip: ScriptBlock = {
        id: `b-clip-${Date.now()}`,
        type: 'clip',
        timecode: '0:22s',
        label: 'Viral Clip Candidate #3',
        retention: 'High',
        text: '[3:40] Yu Suzuki actually wanted Shenmue to be an RPG for the Sega Saturn. Think about that: putting a massive open-world game on a 32-bit dual-CPU architecture. It was literally madness. If they had scaled back the scope, Sega might still be in the console business today.',
      };
      setBlocks((prev) => [...prev, newClip]);
    }, 1500);
  };

  const handleExportClip = (clip: ScriptBlock) => {
    alert(`Exporting Script for "${clip.label}":\n\n${clip.text}`);
  };

  return (
    <main className="ml-[260px] flex-1 flex h-screen">
      {/* CENTER PANEL (The Editor) */}
      <section className="flex-1 flex flex-col h-full bg-[#121212] relative border-r tech-border overflow-hidden">
        {/* Editor Top Bar */}
        <header className="h-16 border-b tech-border flex items-center justify-between px-6 sticky top-0 bg-[#121212]/90 backdrop-blur-sm z-30 flex-shrink-0">
          <div className="flex items-center gap-4">
            <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold tracking-tight">{scriptTitle}</h2>
            <span className="px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant font-label-sm text-label-sm uppercase tracking-wider">Draft</span>
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
            <button className="ml-4 px-3 py-1.5 border border-[#3f3f46] text-on-surface hover:border-[#fafafa] rounded text-label-sm transition-colors flex items-center gap-2 btn-interact">
              <span className="material-symbols-outlined text-[16px]">history</span>
              Version History
            </button>
          </div>
        </header>

        {/* AI Generation Prompt Input Panel */}
        <div className="border-b tech-border bg-surface-container-low px-6 py-4 flex gap-4 items-center">
          {isAuthenticated ? (
            <form onSubmit={handleGenerate} className="flex flex-1 gap-3">
              <input 
                type="text" 
                className="flex-1 bg-surface-container-highest border border-outline-variant rounded px-4 py-2 text-body-md text-on-surface placeholder-on-surface-variant outline-none focus:border-indigo-accent transition-all focus:ring-0 text-white" 
                placeholder="Enter a prompt to write a script (e.g. 'Write a script about Sega Dreamcast history')..."
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                disabled={generating}
              />
              <button 
                type="submit" 
                disabled={generating}
                className="bg-indigo-accent text-white px-5 py-2 rounded font-bold hover:bg-indigo-accent/80 transition-colors flex items-center gap-2 btn-interact cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">magic_button</span>
                {generating ? 'AI Generating...' : 'Write Script'}
              </button>
            </form>
          ) : (
            <div className="flex flex-1 justify-between items-center bg-surface-container-highest/20 p-2.5 rounded border border-dashed border-outline-variant/60">
              <span className="text-body-md text-on-surface-variant italic">Viewing pre-loaded sample script ('The Rise and Fall of Dreamcast.md')</span>
              <button 
                onClick={onOpenAuthModal}
                className="bg-indigo-accent text-white px-5 py-2 rounded font-bold hover:bg-indigo-accent/80 transition-colors flex items-center gap-2 btn-interact cursor-pointer text-xs"
              >
                <span className="material-symbols-outlined text-[16px]">lock</span>
                Register to Generate Your Own Scripts
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
                    <span 
                      className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-[9px] w-2 h-2 rounded-full bg-[#6366f1] shadow-[0_0_8px_#6366f1] z-10" 
                      title="2-Min Hook Rule triggered"
                    ></span>
                  )}
                  <span className={idx + 1 === 6 && hookReminder ? 'text-[#6366f1]' : ''}>{idx + 1}</span>
                </div>
              ))}
            </div>

            {/* Editor Text Blocks */}
            <div className="flex-1 font-body-lg text-body-lg text-on-surface leading-[1.8] flex flex-col gap-6 pb-32">
              {blocks.map((block) => {
                if (block.type === 'clip') {
                  return (
                    <div 
                      key={block.id} 
                      className="relative p-4 -ml-4 -mr-4 bg-[#6366f1]/5 border border-dashed border-[#6366f1]/30 rounded group block-hover mt-4"
                    >
                      <div className="absolute -top-3 right-4 bg-[#1e1b4b] text-[#818cf8] font-label-sm text-label-sm px-2 py-0.5 rounded border border-[#6366f1]/40 flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">auto_awesome</span>
                        {block.label}
                      </div>
                      <div className="absolute -left-12 top-4 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-2 items-start block-actions">
                        <span className="material-symbols-outlined text-outline-variant cursor-grab text-[18px]">drag_indicator</span>
                        <button className="w-6 h-6 rounded bg-surface-container-high flex items-center justify-center hover:text-primary transition-colors border border-outline-variant">
                          <span className="material-symbols-outlined text-[14px]">magic_button</span>
                        </button>
                      </div>
                      <textarea
                        className="w-full bg-transparent border-none text-on-surface resize-none focus:ring-0 p-0 font-body-lg leading-[1.8] outline-none"
                        value={block.text}
                        rows={Math.ceil(block.text.length / 75)}
                        onChange={(e) => handleBlockChange(block.id, e.target.value)}
                      />
                    </div>
                  );
                } else {
                  return (
                    <div key={block.id} className="block-hover relative group flex items-start">
                      <div className="absolute -left-12 top-1 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2 items-start block-actions">
                        <span className="material-symbols-outlined text-outline-variant cursor-grab text-[18px]">drag_indicator</span>
                      </div>
                      <textarea
                        className="w-full bg-transparent border-none text-on-surface resize-none focus:ring-0 p-0 font-body-lg leading-[1.8] outline-none"
                        value={block.text}
                        rows={Math.ceil(block.text.length / 75)}
                        onChange={(e) => handleBlockChange(block.id, e.target.value)}
                      />
                    </div>
                  );
                }
              })}
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
            <h3 className="font-headline-sm text-headline-sm font-semibold">AI Clip Extractor</h3>
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
                className="bg-[#171717] rounded-lg p-4 border tech-border relative group hover:border-[#3f3f46] transition-colors"
              >
                <div className="flex justify-between items-start mb-3">
                  <h4 className="font-headline-sm text-label-md text-on-surface font-semibold leading-tight pr-8 truncate">
                    {clip.label}
                  </h4>
                  <span className="font-label-sm text-label-sm text-primary bg-[#1e1b4b] px-1.5 py-0.5 rounded absolute top-4 right-4">
                    {clip.timecode || '0:00s'}
                  </span>
                </div>
                <div className="mb-4">
                  <span className="font-label-sm text-label-sm text-outline-variant uppercase tracking-wider block mb-1">Hook Analysis</span>
                  <p className="font-body-md text-[13px] text-[#818cf8] line-clamp-3 italic border-l-2 border-[#6366f1] pl-2">
                    "{clip.clip_metadata?.suggested_hook || clip.text.substring(0, 100)}..."
                  </p>
                </div>
                <div className="flex items-center justify-between mt-auto pt-3 border-t border-[#262626]">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${clip.retention === 'High' ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                    <span className="font-label-sm text-label-sm text-outline-variant">{clip.retention} Retention</span>
                  </div>
                  <button 
                    onClick={() => handleExportClip(clip)}
                    className="text-primary font-label-md text-label-md hover:text-primary-fixed transition-colors flex items-center gap-1"
                  >
                    Export Script <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                  </button>
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
              <span className="material-symbols-outlined">
                {scanning ? 'sync' : 'auto_awesome'}
              </span>
            </div>
            <div>
              <span className="font-label-md text-label-md text-on-surface block mb-1">
                {scanning ? 'Scanning Script...' : 'Scan for more clips'}
              </span>
              <span className="font-body-md text-[12px] text-on-surface-variant">
                {scanning ? 'Analyzing hook structure...' : 'AI will analyze the rest of the draft'}
              </span>
            </div>
          </button>
        </div>

        {/* LEFT BAR RETENTION CONTROLS (Rendered in Sidebar via React portal or layout) */}
        {/* We place it in the MyScripts Sidebar Controls bottom block */}
        <div className="border-t border-outline-variant p-4 mt-auto">
          <div className="flex items-center justify-between w-full mb-3 text-on-surface-variant">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined">analytics</span>
              <span className="font-label-md text-label-md uppercase tracking-wider">Retention Settings</span>
            </div>
          </div>
          <div className="flex flex-col gap-4" onClickCapture={handleRetentionClick}>
            <div>
              <label className="font-label-sm text-label-sm text-on-surface-variant flex justify-between mb-2">
                <span>Suspense Frequency</span>
                <span className="text-primary">{suspenseFreq === 3 ? 'High' : suspenseFreq === 2 ? 'Med' : 'Low'}</span>
              </label>
              <input 
                className="w-full h-1 bg-surface-container-highest rounded-lg appearance-none cursor-pointer accent-primary" 
                max="3" 
                min="1" 
                type="range" 
                value={suspenseFreq}
                onChange={(e) => setSuspenseFreq(Number(e.target.value))}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="font-label-sm text-label-sm text-on-surface-variant">Hook Reminder (2m)</span>
              <button 
                onClick={() => setHookReminder(!hookReminder)}
                className={`w-8 h-4 rounded-full relative transition-colors flex items-center p-0.5 ${hookReminder ? 'bg-primary' : 'bg-outline-variant'}`}
              >
                <div className={`w-3 h-3 rounded-full absolute transition-transform bg-on-primary ${hookReminder ? 'right-0.5' : 'left-0.5'}`}></div>
              </button>
            </div>
          </div>
        </div>
      </aside>
    </main>
  );
};
