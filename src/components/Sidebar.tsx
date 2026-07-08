import React from 'react';

interface SidebarProps {
  activeView: string;
  setActiveView: (view: string) => void;
  auth: {
    user: {
      name: string;
      email: string;
      tier: string;
      avatarUrl: string;
    } | null;
  };
  onOpenAuthModal: () => void;
  onLogout: () => void;
  onNewScript: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeView,
  setActiveView,
  auth,
  onOpenAuthModal,
  onLogout,
  onNewScript,
}) => {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
    { id: 'my-scripts', label: 'My Scripts', icon: 'description' },
    { id: 'style-ai-training', label: 'Style AI Training', icon: 'model_training' },
    { id: 'settings', label: 'Settings', icon: 'settings' },
  ];

  return (
    <aside className="fixed left-0 top-0 h-screen w-sidebar-width bg-background border-r border-outline-variant flex flex-col p-4 gap-4 z-50">
      {/* Header */}
      <div className="flex items-center gap-3 px-2 py-4 border-b border-outline-variant">
        <div className="w-8 h-8 rounded bg-primary-container flex items-center justify-center">
          <span className="material-symbols-outlined text-on-primary-container text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>
            terminal
          </span>
        </div>
        <div className="flex flex-col">
          <span className="font-headline-sm text-headline-sm font-bold text-primary">ScriptFlow AI</span>
          <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-widest">
            {auth.user ? auth.user.tier : 'GUEST SESSION'}
          </span>
        </div>
      </div>

      {/* CTA: New Script */}
      <button 
        onClick={() => {
          if (!auth.user) {
            onOpenAuthModal();
          } else {
            onNewScript();
          }
        }}
        className="w-full bg-primary text-on-primary font-label-md text-label-md py-2.5 rounded flex items-center justify-center gap-2 hover:bg-primary-fixed transition-colors mt-2 btn-interact cursor-pointer"
      >
        <span className="material-symbols-outlined text-[18px]">{auth.user ? 'add' : 'lock'}</span>
        New Script
      </button>

      {/* Main Nav */}
      <nav className="flex-grow space-y-1 mt-4">
        {navItems.map((item) => {
          const isActive = activeView === item.id;
          const isRestricted = !auth.user && (item.id === 'style-ai-training' || item.id === 'settings');
          return (
            <button
              key={item.id}
              onClick={() => {
                if (isRestricted) {
                  onOpenAuthModal();
                } else {
                  setActiveView(item.id);
                }
              }}
              className={`w-full flex items-center gap-3 px-3 py-2 transition-all rounded-lg group cursor-pointer ${
                isActive
                  ? 'text-primary bg-secondary-container font-semibold'
                  : 'text-on-surface-variant hover:bg-surface-container-high hover:text-white'
              }`}
            >
              <span 
                className={`material-symbols-outlined group-hover:text-primary transition-colors ${
                  isActive ? 'text-primary' : ''
                }`}
                style={{ fontVariationSettings: isActive ? "'FILL' 1" : undefined }}
              >
                {item.icon}
              </span>
              <span className="font-body-md text-body-md">{item.label}</span>
              {isRestricted && (
                <span className="material-symbols-outlined text-[16px] ml-auto text-outline-variant group-hover:text-white transition-colors">lock</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom Nav / Footer */}
      <div className="mt-auto space-y-1 pt-4 border-t border-outline-variant">
        <a className="flex items-center gap-3 px-3 py-2 text-on-surface-variant hover:bg-surface-container-high transition-colors rounded-lg group" href="#retention">
          <span className="material-symbols-outlined group-hover:text-primary transition-colors">analytics</span>
          <span className="font-body-md text-body-md">Retention Rules</span>
        </a>
        <a className="flex items-center gap-3 px-3 py-2 text-on-surface-variant hover:bg-surface-container-high transition-colors rounded-lg group" href="#help">
          <span className="material-symbols-outlined group-hover:text-primary transition-colors">help</span>
          <span className="font-body-md text-body-md">Help</span>
        </a>

        {/* User Session Footer */}
        {auth.user ? (
          <div className="pt-4 mt-4 flex items-center justify-between px-2">
            <div className="flex items-center gap-3">
              <img 
                className="w-8 h-8 rounded-full border border-outline object-cover" 
                src={auth.user.avatarUrl} 
                alt={auth.user.name} 
              />
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-white">{auth.user.name}</span>
                <span className="text-[9px] text-on-surface-variant uppercase tracking-widest">{auth.user.tier}</span>
              </div>
            </div>
            <button 
              onClick={onLogout}
              className="text-[10px] text-zinc-500 hover:text-red-400 font-mono transition-colors"
              title="Log Out"
            >
              <span className="material-symbols-outlined text-[16px]">logout</span>
            </button>
          </div>
        ) : (
          <div className="p-3 bg-surface-container rounded-xl flex flex-col gap-2 mt-4">
            <span className="text-[10px] font-mono text-on-surface-variant uppercase tracking-widest">Guest Session</span>
            <div className="flex gap-2">
              <button 
                onClick={onOpenAuthModal}
                className="flex-1 text-xs bg-primary-container text-on-primary-container py-1 rounded text-center font-bold hover:opacity-90 transition-opacity"
              >
                Log In
              </button>
              <button 
                onClick={onOpenAuthModal}
                className="flex-1 text-xs border border-outline-variant py-1 rounded text-center hover:bg-white/5 transition-all text-on-surface-variant"
              >
                Register
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
