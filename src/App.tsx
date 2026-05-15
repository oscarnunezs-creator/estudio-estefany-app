import React, { useEffect, Component, type ReactNode } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/layout/Layout';
import Login from './components/Login';
import { Spinner } from './components/ui';
import { configSvc } from './services/salon';
import { setSalonCurrency } from './lib/utils';
import { supabaseConfigured } from './lib/supabase';

// Módulos importados estáticamente para evitar latencia de carga dinámica en desarrollo/producción
import Dashboard from './components/Dashboard';
import Agenda from './components/Agenda';
import Clients from './components/Clients';
import POS from './components/POS';
import Inventory from './components/Inventory';
import Suppliers from './components/Suppliers';
import Finance from './components/Finance';
import AdminSettings from './components/AdminSettings';

// ─── Error Boundary ──────────────────────────────────────────────────────────
interface EBState { hasError: boolean; message: string }
class ErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  state: EBState = { hasError: false, message: '' };
  static getDerivedStateFromError(err: Error): EBState {
    return { hasError: true, message: err.message };
  }
  componentDidCatch(err: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', err, info);
  }
  render() {
    if (this.state.hasError) return <ConfigErrorScreen message={this.state.message} />;
    return this.props.children;
  }
}

// ─── Config Error Screen ─────────────────────────────────────────────────────
function ConfigErrorScreen({ message }: { message?: string }) {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#fff8f5',
      fontFamily: 'Inter, system-ui, sans-serif',
      padding: '2rem',
      textAlign: 'center',
    }}>
      <div style={{
        background: '#fff',
        border: '1px solid #f2dfd3',
        borderRadius: '1.5rem',
        padding: '3rem 2.5rem',
        maxWidth: '480px',
        width: '100%',
        boxShadow: '0 8px 32px rgba(141,75,0,0.08)',
      }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚙️</div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#231a13', margin: '0 0 0.75rem' }}>
          Configuración requerida
        </h1>
        <p style={{ color: '#554336', lineHeight: 1.6, margin: '0 0 1.5rem', fontSize: '0.95rem' }}>
          Las variables de entorno de Supabase no están configuradas.
          Agrega <code style={{ background:'#fdeade', padding:'2px 6px', borderRadius:4, color:'#8d4b00' }}>VITE_SUPABASE_URL</code> y{' '}
          <code style={{ background:'#fdeade', padding:'2px 6px', borderRadius:4, color:'#8d4b00' }}>VITE_SUPABASE_ANON_KEY</code> en{' '}
          <strong>Vercel → Project → Settings → Environment Variables</strong>.
        </p>
        {message && (
          <p style={{
            fontSize: '0.75rem', color: '#887364', background: '#fdeade',
            borderRadius: '0.75rem', padding: '0.75rem 1rem', margin: 0,
            textAlign: 'left', wordBreak: 'break-all',
          }}>
            {message}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Routes ──────────────────────────────────────────────────────────────────
function AppRoutes() {
  const { user, loading } = useAuth();

  useEffect(() => {
    configSvc.get().then(({ data }) => {
      if (data?.currency) setSalonCurrency(data.currency);
    }, (err) => {
      console.warn('Could not load salon config:', err);
    });
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8f6f3] flex flex-col items-center justify-center gap-4">
        <Spinner size="lg" />
        <p className="text-xs font-medium text-[#8a8580] uppercase tracking-widest animate-pulse">
          Cargando sistema...
        </p>
      </div>
    );
  }

  if (!user) return <Login />;

  return (
    <Router>
      <Layout user={user}>
        <Routes>
          <Route path="/" element={
            user.role === 'client'
              ? <Navigate to="/agenda" replace />
              : <Dashboard />
          } />
          <Route path="/agenda"    element={<Agenda />} />
          <Route path="/clients"   element={<Clients />} />
          <Route path="/pos"       element={<POS />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/suppliers" element={
            user.role === 'admin' ? <Suppliers /> : <Navigate to="/" replace />
          } />
          <Route path="/finance"   element={
            user.role === 'admin' ? <Finance /> : <Navigate to="/" replace />
          } />
          <Route path="/settings"  element={
            user.role === 'admin' ? <AdminSettings /> : <Navigate to="/" replace />
          } />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </Router>
  );
}

// ─── App Root ────────────────────────────────────────────────────────────────
export default function App() {
  if (!supabaseConfigured) {
    return <ConfigErrorScreen />;
  }

  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </ErrorBoundary>
  );
}
