import React, { useState, useEffect } from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import type { UserProfile } from '../../types';

interface NavItem {
  label: string;
  path: string;
  materialIcon: string;
  roles: string[];
  badge?: number;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard',   path: '/',           materialIcon: 'dashboard',    roles: ['admin', 'staff'] },
  { label: 'Agenda',      path: '/agenda',     materialIcon: 'calendar_month', roles: ['admin', 'staff'] },
  { label: 'Ventas',      path: '/pos',        materialIcon: 'payments',      roles: ['admin', 'staff'] },
  { label: 'Clientes',    path: '/clients',    materialIcon: 'face_3',        roles: ['admin', 'staff'] },
  { label: 'Inventario',  path: '/inventory',  materialIcon: 'package',       roles: ['admin', 'staff'] },
  { label: 'Proveedores', path: '/suppliers',  materialIcon: 'local_shipping', roles: ['admin'] },
  { label: 'Finanzas',    path: '/finance',    materialIcon: 'finance',       roles: ['admin'] },
  { label: 'Ajustes',     path: '/settings',   materialIcon: 'settings',      roles: ['admin'] },
];

interface LayoutProps {
  user: UserProfile;
  children: React.ReactNode;
}

export default function Layout({ user, children }: LayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // Close sidebar on ESC
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const handleSignOut = async () => {
    setSigningOut(true);
    await signOut();
    navigate('/');
  };

  const filteredNavItems = NAV_ITEMS.filter(item => item.roles.includes(user.role));

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-surface-container-low/95 border-r border-outline-variant/30 select-none">
      {/* Brand */}
      <div className="px-8 py-7 border-b border-outline-variant/20 bg-surface/40">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center flex-shrink-0 shadow-md shadow-primary/10">
            <span className="text-white font-serif font-bold text-lg select-none">E</span>
          </div>
          <div>
            <p className="text-on-surface text-lg font-serif tracking-wide leading-none">Estefany</p>
            <p className="text-primary text-[9px] font-sans tracking-[0.25em] uppercase leading-none mt-1 font-bold">BY LASHES</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-4 py-8 space-y-1 overflow-y-auto">
        {filteredNavItems.map(item => {
          const isActive = location.pathname === item.path ||
            (item.path !== '/' && location.pathname.startsWith(item.path));
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3.5 px-5 py-3.5 rounded-full transition-all duration-300 group select-none
                ${isActive
                  ? 'bg-primary text-white shadow-lg shadow-primary/15 font-semibold'
                  : 'text-on-surface-variant/80 hover:text-primary hover:bg-surface-container-high'
                }`}
            >
              <span className={`material-symbols-outlined text-[20px] leading-none ${isActive ? 'text-white' : 'text-outline group-hover:text-primary transition-colors duration-200'}`}>
                {item.materialIcon}
              </span>
              <span className="text-sm font-semibold flex-1 tracking-wide font-sans">{item.label}</span>
              {item.badge && (
                <span className="bg-primary text-white text-[10px] font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center">
                  {item.badge}
                </span>
              )}
              {isActive && <span className="material-symbols-outlined text-[16px] text-white/80 leading-none">chevron_right</span>}
            </Link>
          );
        })}
      </nav>

      {/* User footer */}
      <div className="px-4 pb-8 border-t border-outline-variant/20 pt-5 bg-surface/30">
        <div className="flex items-center gap-3.5 px-4 py-3 mb-3 bg-surface-container/30 border border-outline-variant/15 rounded-[1.5rem]">
          <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0 shadow-inner select-none">
            <span className="text-primary text-sm font-bold">
              {(user.display_name || user.email).charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-on-surface text-xs font-bold truncate">
              {user.display_name || user.email}
            </p>
            <p className="text-primary text-[9px] uppercase tracking-widest font-bold mt-1">{user.role}</p>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          className="flex items-center gap-3 w-full px-5 py-3 rounded-full text-on-surface-variant/70 hover:text-error hover:bg-error-container/20 transition-all duration-200 disabled:opacity-50 text-left cursor-pointer font-sans text-xs font-bold uppercase tracking-wider"
        >
          <span className="material-symbols-outlined text-[18px] leading-none">logout</span>
          <span>{signingOut ? 'Saliendo...' : 'Cerrar sesión'}</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-background">
      {/* DESKTOP SIDEBAR */}
      <aside
        className="hidden lg:flex flex-col w-[260px] flex-shrink-0"
        aria-label="Navegación principal"
      >
        <SidebarContent />
      </aside>

      {/* MOBILE HEADER (Top Bar) */}
      <header className="lg:hidden fixed top-0 w-full z-40 flex items-center justify-between px-gutter h-16 bg-surface/80 backdrop-blur-xl border-b border-outline-variant/20 shadow-sm flex-shrink-0">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 text-primary hover:bg-surface-container rounded-full transition-colors cursor-pointer active:scale-90"
          aria-label="Abrir menú"
          id="mobile-menu-btn"
        >
          <span className="material-symbols-outlined text-[24px]">menu</span>
        </button>

        <div className="flex items-center gap-2 select-none">
          <div className="w-7 h-7 bg-primary rounded-full flex items-center justify-center shadow-sm shadow-primary/10">
            <span className="text-white font-serif font-bold text-xs">E</span>
          </div>
          <span className="font-serif text-sm tracking-wide text-on-surface font-semibold">ESTUDIO ESTEFANY</span>
        </div>

        <button className="p-2 text-primary hover:bg-surface-container rounded-full transition-colors cursor-pointer active:scale-90" aria-label="Notificaciones">
          <span className="material-symbols-outlined text-[20px]">notifications</span>
        </button>
      </header>

      {/* MOBILE SIDEBAR DRAWER (Sliding Panel) */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        >
          <div className="absolute inset-0 bg-on-background/20 backdrop-blur-md" />
        </div>
      )}
      <aside
        className={`fixed top-0 left-0 z-50 h-full w-64 bg-background transform transition-transform duration-300 ease-in-out lg:hidden
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
        aria-label="Navegación móvil"
      >
        <div className="absolute top-4 right-4 z-50">
          <button
            onClick={() => setSidebarOpen(false)}
            className="text-on-surface-variant hover:text-primary transition-colors p-2 rounded-full hover:bg-surface-container active:scale-90 cursor-pointer"
            aria-label="Cerrar menú"
          >
            <span className="material-symbols-outlined text-[22px]">close</span>
          </button>
        </div>
        <SidebarContent />
      </aside>

      {/* MAIN CONTENT WRAPPER */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* PAGE CONTENT */}
        <main className="flex-1 flex flex-col pt-16 lg:pt-0 pb-20 lg:pb-0">
          <div className="animate-fade-in flex-1 flex flex-col">
            {children}
          </div>
        </main>

        {/* MOBILE FLOATING BOTTOM NAV BAR (From Sketch) */}
        <nav className="lg:hidden bg-surface/90 backdrop-blur-2xl text-primary font-label-md text-label-md fixed bottom-0 w-full z-40 rounded-t-[1.5rem] border-t border-outline-variant/20 shadow-lg flex justify-around items-center h-20 px-4 pb-safe select-none">
          {NAV_ITEMS.slice(0, 5).map(item => {
            const isActive = location.pathname === item.path ||
              (item.path !== '/' && location.pathname.startsWith(item.path));
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center justify-center transition-all duration-300 cursor-pointer w-16
                  ${isActive 
                    ? 'text-primary scale-105 font-bold' 
                    : 'text-on-surface-variant/60 hover:text-primary'
                  }`}
              >
                <span className="material-symbols-outlined text-[24px]" style={isActive ? { fontVariationSettings: "'FILL' 1" } : {}}>
                  {item.materialIcon}
                </span>
                <span className="text-[10px] mt-1 font-sans tracking-tight font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
