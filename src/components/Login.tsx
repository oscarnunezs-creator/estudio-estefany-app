import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Button, Input } from './ui';

export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error } = await signIn(email, password);

    if (error) {
      setError('Credenciales incorrectas. Verifica tu correo y contraseña.');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex select-none">
      {/* Panel izquierdo — Branding de Lujo */}
      <div className="hidden lg:flex lg:w-1/2 bg-inverse-surface flex-col justify-between p-16 relative overflow-hidden">
        {/* Decorative organic ambient light */}
        <div className="absolute top-[-20%] left-[-20%] w-[80%] h-[80%] rounded-full bg-primary/8 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] rounded-full bg-primary/5 blur-[100px] pointer-events-none" />

        {/* Logo */}
        <div className="relative z-10 animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center shadow-lg shadow-primary/20">
              <span className="text-white font-serif font-semibold text-lg">E</span>
            </div>
            <span className="text-white font-sans font-bold text-xs tracking-[0.25em] uppercase">Estefany By Lashes</span>
          </div>
        </div>

        {/* Centro */}
        <div className="space-y-8 relative z-10 max-w-md animate-slide-in">
          <div className="space-y-4">
            <p className="text-primary-fixed-dim text-xs font-bold uppercase tracking-[0.25em]">Estudio Boutique & Spa</p>
            <h1 className="text-white text-4.5xl font-serif leading-[1.2] font-normal tracking-wide">
              Gestiona tu estudio<br />de forma <span className="font-serif-luxury text-primary-fixed-dim">inteligente</span> y <span className="font-serif-luxury text-primary-fixed-dim">exclusiva</span>.
            </h1>
          </div>
          <p className="text-outline-variant text-sm leading-relaxed font-normal">
            Agenda, clientes, finanzas, inventario y comisiones. Todo en un solo espacio unificado de alto rendimiento y diseño premium.
          </p>

          {/* Features */}
          <div className="space-y-4 pt-6 border-t border-outline/30">
            {[
              'Agenda visual en tiempo real',
              'CRM de clientes con historial de cabina',
              'Control financiero diario automatizado',
              'Gestión de inventarios y consumos',
            ].map(feature => (
              <div key={feature} className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-[14px] text-primary-fixed-dim select-none" style={{ fontVariationSettings: "'wght' 700" }}>check</span>
                </div>
                <span className="text-outline-variant text-xs font-medium tracking-wide">{feature}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <p className="text-outline/60 text-xs tracking-wider font-semibold relative z-10 uppercase font-sans animate-fade-in">
          © {new Date().getFullYear()} ESTUDIO ESTEFANY BY LASHES
        </p>
      </div>

      {/* Panel derecho — Formulario */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-background relative overflow-hidden">
        {/* Mobile decorative light */}
        <div className="lg:hidden absolute top-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-primary/5 blur-[80px] pointer-events-none" />

        <div className="w-full max-w-sm animate-fade-in space-y-10 z-10">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3">
            <div className="w-9 h-9 bg-primary rounded-full flex items-center justify-center shadow-md shadow-primary/10">
              <span className="text-white font-serif font-semibold text-base">E</span>
            </div>
            <span className="font-bold text-xs tracking-[0.2em] uppercase text-on-surface">Estefany By Lashes</span>
          </div>

          <div className="space-y-2">
            <h2 className="text-4xl font-headline-md text-on-surface tracking-tight font-normal">Bienvenida</h2>
            <p className="text-xs text-on-surface-variant/60 font-bold tracking-widest uppercase">Ingresa tus credenciales para continuar</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <Input
              label="Correo electrónico"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="correo@ejemplo.com"
              required
              autoComplete="email"
              id="login-email"
            />

            <Input
              label="Contraseña"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
              id="login-password"
            />

            {error && (
              <div className="flex items-start gap-3 p-4 bg-error-container/40 border border-error-container/20 rounded-[1.5rem] animate-fade-in">
                <span className="material-symbols-outlined text-[18px] text-error flex-shrink-0 select-none">error</span>
                <p className="text-xs font-semibold text-on-error-container leading-normal">{error}</p>
              </div>
            )}

            <Button
              type="submit"
              loading={loading}
              className="w-full py-4 text-xs font-bold uppercase tracking-[0.2em]"
              id="login-submit"
            >
              {loading ? 'Ingresando...' : 'Ingresar al sistema'}
            </Button>
          </form>

          <p className="text-center text-[10px] text-on-surface-variant/50 font-bold uppercase tracking-widest leading-relaxed">
            ¿Problemas para ingresar? Contacta al soporte del estudio.
          </p>
        </div>
      </div>
    </div>
  );
}
