import React, { useState, useEffect, useRef } from 'react';
import { loginUser, registerUser } from '../services/api';

interface AuthModalProps {
  onClose: () => void;
  onLoginSuccess: (user: { name: string; email: string; tier: string; avatarUrl: string }) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ onClose, onLoginSuccess }) => {
  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  // Parallax tilt effect from Stitch script
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (modalRef.current) {
        const xAxis = (window.innerWidth / 2 - e.pageX) / 80;
        const yAxis = (window.innerHeight / 2 - e.pageY) / 80;
        modalRef.current.style.transform = `rotateY(${xAxis}deg) rotateX(${yAxis}deg)`;
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (activeTab === 'login') {
        const res = await loginUser(email, password);
        if (res.success && res.user) {
          onLoginSuccess(res.user);
        }
      } else {
        if (!name.trim()) {
          setError('Name is required for registration.');
          setLoading(false);
          return;
        }
        const res = await registerUser(name.trim(), email, password);
        if (res.success && res.user) {
          onLoginSuccess(res.user);
        }
      }
    } catch (err: any) {
      console.error(err);
      const detail = err?.response?.data?.detail || err?.message || 'Authentication failed.';
      setError(detail);
    } finally {
      setLoading(false);
    }
  };

  const handleSocialLogin = () => {
    onLoginSuccess({
      name: 'Vicente Aguirre',
      email: 'vicente@example.com',
      tier: 'BYOK LICENSE',
      avatarUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDZ6DXquEzAVruY9pQ1fZcJdUIMbBmLcdGyd_2RwR6-Dwsm8m-lXrOTdjHi4lVsrNdyXQk3bjEvAALIUztnloa6U5HrGW3-q8nC-ZdcyD0_OpG61J4PKZHQC5kRXoTQHtEyzBz2ASU-utqQbBlenEEK8qh_Szhny_gx2hLCccszmAoGuve-koZoHhcBlIAD5ObWPpPe4aQJnWoywryetbqUQ_gP3-AwS5JoZqQ_6to5IJr82u7vS6vFn-9V73h05Kgqi-z4LxlC0g',
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm">
      <div 
        ref={modalRef}
        style={{ perspective: 1000 }}
        className="glass-modal w-full max-w-md rounded-2xl overflow-hidden relative shadow-2xl transition-all duration-100 ease-out"
      >
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-on-surface-variant hover:text-on-surface transition-colors"
        >
          <span className="material-symbols-outlined">close</span>
        </button>

        {/* Modal Content */}
        <div className="p-8">
          <header className="text-center mb-8">
            <div className="w-12 h-12 bg-primary/20 rounded-xl flex items-center justify-center mx-auto mb-4">
              <span className="material-symbols-outlined text-primary text-3xl">auto_fix_high</span>
            </div>
            <h2 className="font-headline-md text-headline-md text-on-surface">Welcome to ScriptFlow</h2>
            <p className="text-on-surface-variant font-body-md mt-1">Unlock AI models trained on your unique voice.</p>
          </header>

          {/* Tab Switcher */}
          <div className="flex gap-6 justify-center mb-8 border-b border-outline-variant">
            <button 
              onClick={() => setActiveTab('login')}
              className={`pb-3 px-2 font-label-md uppercase tracking-wider transition-colors ${
                activeTab === 'login' 
                  ? 'text-primary border-b-2 border-primary' 
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              [ Log In ]
            </button>
            <button 
              onClick={() => setActiveTab('register')}
              className={`pb-3 px-2 font-label-md uppercase tracking-wider transition-colors ${
                activeTab === 'register' 
                  ? 'text-primary border-b-2 border-primary' 
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              [ Register ]
            </button>
          </div>

          {/* Form Inputs */}
          {error && (
            <div className="bg-red-950/40 border border-red-500/30 text-red-400 p-3 rounded-lg text-xs font-semibold text-center mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {activeTab === 'register' && (
              <div className="space-y-1">
                <label className="font-label-sm uppercase tracking-widest text-on-surface-variant px-1">Full Name</label>
                <input 
                  className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-3 text-on-surface focus:border-primary transition-all outline-none font-body-md placeholder:text-zinc-600 focus:ring-0 text-white" 
                  placeholder="Vicente Aguirre" 
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={loading}
                />
              </div>
            )}
            <div className="space-y-1">
              <label className="font-label-sm uppercase tracking-widest text-on-surface-variant px-1">Email Address</label>
              <input 
                className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-3 text-on-surface focus:border-primary transition-all outline-none font-body-md placeholder:text-zinc-600 focus:ring-0 text-white" 
                placeholder="creator@scriptflow.ai" 
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="space-y-1">
              <label className="font-label-sm uppercase tracking-widest text-on-surface-variant px-1">Password</label>
              <input 
                className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-3 text-on-surface focus:border-primary transition-all outline-none font-body-md placeholder:text-zinc-600 focus:ring-0 text-white" 
                placeholder="••••••••" 
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
            </div>
            <button 
              className="w-full bg-primary text-on-primary-container font-headline-sm py-4 rounded-xl mt-4 hover:opacity-90 transition-all btn-interact disabled:opacity-50 cursor-pointer" 
              type="submit"
              disabled={loading}
            >
              {loading ? 'Validating credentials...' : 'Continue with Email'}
            </button>
          </form>

          <div className="flex items-center my-6 gap-4">
            <div className="h-[1px] flex-1 bg-outline-variant"></div>
            <span className="font-label-sm text-on-surface-variant uppercase">Or</span>
            <div className="h-[1px] flex-1 bg-outline-variant"></div>
          </div>

          {/* Social Auth */}
          <div className="flex flex-col gap-3">
            <button 
              onClick={handleSocialLogin}
              className="w-full flex items-center justify-center gap-3 bg-surface-container-high border border-outline-variant text-on-surface py-3 rounded-xl hover:bg-surface-bright transition-colors font-body-md btn-interact"
            >
              <img 
                className="w-5 h-5" 
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuCG-8x2mxgIf1p-LX4um0IaoYTqk93aGZVNBsB35mJ7C68gRWBJkMnD1o-G8GHpuONEN3sdyjcUKHufYIhEYS8ob7Ud7YL1LqF--GuU3EJR3BvUx57Xa6-gfljncvjiXKGeay5Lu11tptlq-Ju8XpEFAW8SR1XSIUFLOA8VALTNdKGrFWC1nzmADuO-OBVm7ZUjBa8A5lTGV8nNyJkgH4ahMhE1XdYjlVE_hf7KJI3P-2HDg-HorK6G1UBEHUHVnnHwM_PLrfrb0g" 
                alt="Google" 
              />
              Continue with Google
            </button>
            <button 
              onClick={handleSocialLogin}
              className="w-full flex items-center justify-center gap-3 bg-surface-container-high border border-outline-variant text-on-surface py-3 rounded-xl hover:bg-surface-bright transition-colors font-body-md btn-interact"
            >
              <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>apps</span>
              Continue with Apple
            </button>
          </div>

          <footer className="mt-8 text-center">
            <p className="text-xs text-on-surface-variant font-body-md">
              By continuing, you agree to our <a className="underline hover:text-primary transition-colors" href="#tos">Terms of Service</a> and <a className="underline hover:text-primary transition-colors" href="#privacy">Privacy Policy</a>.
            </p>
          </footer>
        </div>
      </div>
    </div>
  );
};
