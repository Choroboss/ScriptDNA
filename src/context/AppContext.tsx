// src/context/AppContext.tsx
// Provides theme (dark/light) and language (en/es) globally across the app.

import React, { createContext, useContext, useState, useEffect } from 'react';

export type Theme = 'dark' | 'light';
export type Language = 'en' | 'es';

interface AppContextValue {
  theme: Theme;
  toggleTheme: () => void;
  language: Language;
  toggleLanguage: () => void;
  t: (key: string) => string;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

// ─── Translation dictionary ───────────────────────────────────────────────────
const translations: Record<Language, Record<string, string>> = {
  en: {
    // Sidebar
    'nav.dashboard': 'Dashboard',
    'nav.myScripts': 'My Scripts',
    'nav.styleTraining': 'Style AI Training',
    'nav.settings': 'Settings',
    'nav.newScript': 'New Script',
    'nav.retentionRules': 'Retention Rules',
    'nav.help': 'Help',
    'nav.guestSession': 'Guest Session',
    'nav.login': 'Log In',
    'nav.register': 'Register',

    // MyScripts
    'scripts.draft': 'Draft',
    'scripts.words': 'words',
    'scripts.generate': 'Write Script',
    'scripts.generating': 'AI Generating...',
    'scripts.promptPlaceholder': "Enter a prompt to generate a new script (e.g. 'Write a script about Sega Dreamcast history')...",
    'scripts.length': 'Length:',
    'scripts.refineAi': 'Refine with AI',
    'scripts.refineApply': 'Apply Refinement',
    'scripts.refinePlaceholder': 'Tell the AI how to improve the script (e.g. "Make the hook punchier", "Rewrite block 3 in a more aggressive tone")',
    'scripts.refining': 'AI is polishing your draft...',
    'scripts.docs': 'Docs',
    'scripts.yourSavedScripts': 'Your Saved Scripts',
    'scripts.new': 'New',
    'scripts.noSavedScripts': 'No saved scripts yet',
    'scripts.saved': '✓ Saved',
    'scripts.saving': 'Saving...',
    'scripts.unsaved': '● Unsaved',
    'scripts.registerCTA': 'Register to Generate Your Own Scripts',
    'scripts.previewLabel': "Viewing pre-loaded sample script ('The Rise and Fall of Dreamcast.md')",
    'scripts.emptyTitle': 'Write a prompt to generate your first script...',
    'scripts.emptyBody': 'Our AI Writer will incorporate your unique linguistic DNA, pacing, and vocabulary signatures, then auto-segment high-retention viral clips.',
    // Clip sidebar
    'clips.title': 'AI Clip Extractor',
    'clips.hookAnalysis': 'Hook Analysis',
    'clips.retention': 'Retention',
    'clips.export': 'Export Script',
    'clips.scan': 'Scan for more clips',
    'clips.scanning': 'Scanning Script...',
    'clips.scanBody': 'AI will analyze the rest of the draft',
    'clips.scanningBody': 'Analyzing hook structure...',
    'clips.retentionSettings': 'Retention Settings',
    'clips.suspenseFreq': 'Suspense Frequency',
    'clips.hookReminder': 'Hook Reminder (2m)',
    'clips.high': 'High',
    'clips.med': 'Med',
    'clips.low': 'Low',

    // Dashboard
    'dashboard.welcome': 'Welcome back',
    'dashboard.guest': 'to ScriptFlow AI',

    // Settings
    'settings.title': 'Settings',
    'settings.theme': 'Appearance',
    'settings.language': 'Language',
    'settings.darkMode': 'Dark Mode',
    'settings.lightMode': 'Light Mode',
    'settings.english': 'English',
    'settings.spanish': 'Español',

    // Common
    'common.versionHistory': 'Version History',
    'common.loading': 'Loading...',
  },

  es: {
    // Sidebar
    'nav.dashboard': 'Panel Principal',
    'nav.myScripts': 'Mis Guiones',
    'nav.styleTraining': 'Entrenamiento IA de Estilo',
    'nav.settings': 'Configuración',
    'nav.newScript': 'Nuevo Guión',
    'nav.retentionRules': 'Reglas de Retención',
    'nav.help': 'Ayuda',
    'nav.guestSession': 'Sesión de Invitado',
    'nav.login': 'Iniciar Sesión',
    'nav.register': 'Registrarse',

    // MyScripts
    'scripts.draft': 'Borrador',
    'scripts.words': 'palabras',
    'scripts.generate': 'Escribir Guión',
    'scripts.generating': 'Generando con IA...',
    'scripts.promptPlaceholder': "Escribe un prompt para generar un guión (ej. 'Escribe un guión sobre la historia de Sega Dreamcast')...",
    'scripts.length': 'Duración:',
    'scripts.refineAi': 'Refinar con IA',
    'scripts.refineApply': 'Aplicar Refinamiento',
    'scripts.refinePlaceholder': 'Dile a la IA cómo mejorar el guión (ej. "Haz el gancho más directo", "Reescribe el bloque 3 con un tono más agresivo")',
    'scripts.refining': 'La IA está puliendo tu borrador...',
    'scripts.docs': 'Docs',
    'scripts.yourSavedScripts': 'Tus Guiones Guardados',
    'scripts.new': 'Nuevo',
    'scripts.noSavedScripts': 'Aún no tienes guiones guardados',
    'scripts.saved': '✓ Guardado',
    'scripts.saving': 'Guardando...',
    'scripts.unsaved': '● Sin guardar',
    'scripts.registerCTA': 'Regístrate para Generar tus Guiones',
    'scripts.previewLabel': "Viendo guión de muestra ('The Rise and Fall of Dreamcast.md')",
    'scripts.emptyTitle': 'Escribe un prompt para generar tu primer guión...',
    'scripts.emptyBody': 'Nuestro escritor IA incorporará tu ADN lingüístico único, ritmo y firmas de vocabulario, y segmentará automáticamente los clips virales de alta retención.',
    // Clip sidebar
    'clips.title': 'Extractor de Clips IA',
    'clips.hookAnalysis': 'Análisis de Gancho',
    'clips.retention': 'Retención',
    'clips.export': 'Exportar Guión',
    'clips.scan': 'Buscar más clips',
    'clips.scanning': 'Escaneando Guión...',
    'clips.scanBody': 'La IA analizará el resto del borrador',
    'clips.scanningBody': 'Analizando estructura de ganchos...',
    'clips.retentionSettings': 'Config. de Retención',
    'clips.suspenseFreq': 'Frecuencia de Suspenso',
    'clips.hookReminder': 'Recordatorio de Gancho (2m)',
    'clips.high': 'Alta',
    'clips.med': 'Media',
    'clips.low': 'Baja',

    // Dashboard
    'dashboard.welcome': 'Bienvenido de vuelta',
    'dashboard.guest': 'a ScriptFlow AI',

    // Settings
    'settings.title': 'Configuración',
    'settings.theme': 'Apariencia',
    'settings.language': 'Idioma',
    'settings.darkMode': 'Modo Oscuro',
    'settings.lightMode': 'Modo Claro',
    'settings.english': 'English',
    'settings.spanish': 'Español',

    // Common
    'common.versionHistory': 'Historial de Versiones',
    'common.loading': 'Cargando...',
  },
};

// ─── Provider ─────────────────────────────────────────────────────────────────
export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem('scriptdna_theme') as Theme) || 'dark';
  });

  const [language, setLanguage] = useState<Language>(() => {
    return (localStorage.getItem('scriptdna_language') as Language) || 'es';
  });

  // Apply theme class to document root
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light') {
      root.classList.add('light');
      root.classList.remove('dark');
    } else {
      root.classList.add('dark');
      root.classList.remove('light');
    }
    localStorage.setItem('scriptdna_theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('scriptdna_language', language);
  }, [language]);

  const toggleTheme = () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  const toggleLanguage = () => setLanguage((prev) => (prev === 'en' ? 'es' : 'en'));

  const t = (key: string): string => {
    return translations[language][key] ?? translations['en'][key] ?? key;
  };

  return (
    <AppContext.Provider value={{ theme, toggleTheme, language, toggleLanguage, t }}>
      {children}
    </AppContext.Provider>
  );
};

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used inside AppProvider');
  return ctx;
}
