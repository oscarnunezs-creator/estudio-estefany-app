import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/layout/Layout';
import Login from './components/Login';
import { Spinner } from './components/ui';
import { configSvc } from './services/salon';
import { setSalonCurrency } from './lib/utils';

// Módulos importados estáticamente para evitar latencia de carga dinámica en desarrollo/producción
import Dashboard from './components/Dashboard';
import Agenda from './components/Agenda';
import Clients from './components/Clients';
import POS from './components/POS';
import Inventory from './components/Inventory';
import Suppliers from './components/Suppliers';
import Finance from './components/Finance';
import AdminSettings from './components/AdminSettings';

function AppRoutes() {
  const { user, loading } = useAuth();

  useEffect(() => {
    configSvc.get().then(({ data }) => {
      if (data?.currency) {
        setSalonCurrency(data.currency);
      }
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

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
