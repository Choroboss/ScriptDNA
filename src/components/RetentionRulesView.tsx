import React, { useState } from 'react';

interface RetentionRulesViewProps {
  isAuthenticated: boolean;
  onOpenAuthModal: () => void;
}

export const RetentionRulesView: React.FC<RetentionRulesViewProps> = ({
  isAuthenticated,
  onOpenAuthModal,
}) => {
  const [hookWindowSecs, setHookWindowSecs] = useState(15);
  const [hookStrategy, setHookStrategy] = useState('Contrarian Question + Teaser');
  const [patternInterruptInterval, setPatternInterruptInterval] = useState(2.5);
  const [visualBrollCues, setVisualBrollCues] = useState(true);
  const [soundEffectTriggers, setSoundEffectTriggers] = useState(true);
  const [viralClipThreshold, setViralClipThreshold] = useState('High');
  const [outroRetentionGuard, setOutroRetentionGuard] = useState(true);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSaveRules = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated) {
      onOpenAuthModal();
      return;
    }
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  return (
    <main className="ml-[260px] flex-1 flex h-full overflow-hidden bg-surface">
      <section className="flex-1 h-full overflow-y-auto custom-scrollbar p-10 max-w-5xl mx-auto w-full">
        <header className="mb-10">
          <div className="flex items-center gap-3 mb-2">
            <span className="material-symbols-outlined text-primary text-3xl">query_stats</span>
            <h1 className="font-display-lg text-display-lg text-on-surface tracking-tighter">Reglas de Retención</h1>
          </div>
          <p className="text-body-lg text-on-surface-variant max-w-2xl">
            Configura las reglas de retención que el motor de IA aplicará automáticamente en la estructura de tus guiones para maximizar el tiempo de visualización.
          </p>
        </header>

        {savedSuccess && (
          <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-sm font-mono flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">check_circle</span>
            Reglas de retención actualizadas y sincronizadas con el motor de generación.
          </div>
        )}

        <form onSubmit={handleSaveRules} className="space-y-8">
          {/* SECCIÓN 1: Hook Inicial */}
          <div className="card-border bg-surface-container-low p-6 rounded-xl space-y-6">
            <div className="flex items-center justify-between border-b border-outline-variant pb-4">
              <div>
                <h3 className="font-headline-sm text-headline-sm text-on-surface flex items-center gap-2">
                  <span className="material-symbols-outlined text-indigo-accent">bolt</span> Hook Inicial (0-30 Segundos)
                </h3>
                <p className="text-body-md text-on-surface-variant">Reglas para capturar la atención en los primeros segundos del video.</p>
              </div>
              <span className="px-3 py-1 bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-xs font-mono font-bold rounded-full">ALTA PRIO</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="text-label-md text-on-surface-variant block mb-2 font-bold">Ventana Crítica del Hook</label>
                <select
                  value={hookWindowSecs}
                  onChange={(e) => setHookWindowSecs(Number(e.target.value))}
                  className="w-full bg-surface-container-highest border border-outline-variant rounded px-4 py-3 text-body-md text-on-surface outline-none focus:border-indigo-accent"
                >
                  <option value={10}>Primeros 10 segundos (Shorts / Reels)</option>
                  <option value={15}>Primeros 15 segundos (Estándar YouTube)</option>
                  <option value={30}>Primeros 30 segundos (Formatos largos / Documental)</option>
                </select>
              </div>

              <div>
                <label className="text-label-md text-on-surface-variant block mb-2 font-bold">Estrategia de Hook Preferida</label>
                <select
                  value={hookStrategy}
                  onChange={(e) => setHookStrategy(e.target.value)}
                  className="w-full bg-surface-container-highest border border-outline-variant rounded px-4 py-3 text-body-md text-on-surface outline-none focus:border-indigo-accent"
                >
                  <option value="Contrarian Question + Teaser">Pregunta Contraintuitiva + Teaser de Resultado</option>
                  <option value="Bold Statement">Declaración Audaz / Polémica Inmediata</option>
                  <option value="Story Teaser">Micro-historia dramática en frío (In media res)</option>
                </select>
              </div>
            </div>
          </div>

          {/* SECCIÓN 2: Interruptores de Patrón */}
          <div className="card-border bg-surface-container-low p-6 rounded-xl space-y-6">
            <div className="border-b border-outline-variant pb-4">
              <h3 className="font-headline-sm text-headline-sm text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-indigo-accent">shuffle</span> Pattern Interrupts (Ritmo Visual)
              </h3>
              <p className="text-body-md text-on-surface-variant">Frecuencia de cambios de ritmo para evitar la caída de audiencia.</p>
            </div>

            <div className="space-y-6">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-label-md text-on-surface-variant font-bold">Frecuencia de Picos de Retención</label>
                  <span className="text-indigo-accent font-mono font-bold text-sm">Cada {patternInterruptInterval} mins</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="5"
                  step="0.5"
                  value={patternInterruptInterval}
                  onChange={(e) => setPatternInterruptInterval(parseFloat(e.target.value))}
                  className="w-full accent-indigo-accent cursor-pointer"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <label className="flex items-center gap-3 p-4 bg-surface-container-highest border border-outline-variant rounded-lg cursor-pointer hover:border-indigo-accent/50 transition-colors">
                  <input
                    type="checkbox"
                    checked={visualBrollCues}
                    onChange={(e) => setVisualBrollCues(e.target.checked)}
                    className="w-4 h-4 accent-indigo-accent"
                  />
                  <div>
                    <span className="text-on-surface font-bold text-sm block">Indicadores de B-Roll / Apoyo Visual</span>
                    <span className="text-on-surface-variant text-xs">Sugerir cortes de edición y gráficos en el guión</span>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-4 bg-surface-container-highest border border-outline-variant rounded-lg cursor-pointer hover:border-indigo-accent/50 transition-colors">
                  <input
                    type="checkbox"
                    checked={soundEffectTriggers}
                    onChange={(e) => setSoundEffectTriggers(e.target.checked)}
                    className="w-4 h-4 accent-indigo-accent"
                  />
                  <div>
                    <span className="text-on-surface font-bold text-sm block">Marcadores de Efectos de Sonido</span>
                    <span className="text-on-surface-variant text-xs">Insertar acentos de audio para enfatizar datos clave</span>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* SECCIÓN 3: Cortadores Virales y Guardias de Outro */}
          <div className="card-border bg-surface-container-low p-6 rounded-xl space-y-6">
            <div className="border-b border-outline-variant pb-4">
              <h3 className="font-headline-sm text-headline-sm text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-indigo-accent">content_cut</span> Clips Virales &amp; Retención de Outro
              </h3>
              <p className="text-body-md text-on-surface-variant">Ajustes para auto-segmentar fragmentos de alta retención.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="text-label-md text-on-surface-variant block mb-2 font-bold">Umbral de Potencial Viral</label>
                <select
                  value={viralClipThreshold}
                  onChange={(e) => setViralClipThreshold(e.target.value)}
                  className="w-full bg-surface-container-highest border border-outline-variant rounded px-4 py-3 text-body-md text-on-surface outline-none focus:border-indigo-accent"
                >
                  <option value="High">Alto (Mínimo 2 candidatos virales por guión)</option>
                  <option value="Medium">Moderado (Segmentar pasajes destacados)</option>
                  <option value="Strict">Estricto (Solo momentos de máxima intensidad)</option>
                </select>
              </div>

              <div className="flex items-center">
                <label className="flex items-center gap-3 p-4 bg-surface-container-highest border border-outline-variant rounded-lg cursor-pointer hover:border-indigo-accent/50 transition-colors w-full">
                  <input
                    type="checkbox"
                    checked={outroRetentionGuard}
                    onChange={(e) => setOutroRetentionGuard(e.target.checked)}
                    className="w-4 h-4 accent-indigo-accent"
                  />
                  <div>
                    <span className="text-on-surface font-bold text-sm block">Outro Retention Guard</span>
                    <span className="text-on-surface-variant text-xs">Evitar cierres trillados que inciten al espectador a salir del video</span>
                  </div>
                </label>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <button
              type="submit"
              className="bg-indigo-accent hover:bg-indigo-600 text-white font-bold px-8 py-3 rounded-lg shadow-lg hover:shadow-indigo-500/20 transition-all flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-sm">save</span>
              Guardar Reglas de Retención
            </button>
          </div>
        </form>
      </section>
    </main>
  );
};
