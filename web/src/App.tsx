import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Clients } from './pages/Clients';
import { ClientDetail } from './pages/ClientDetail';
import { Subscriptions } from './pages/Subscriptions';
import { Billing } from './pages/Billing';
import { Calendar } from './pages/Calendar';
import { WorkLogs } from './pages/WorkLogs';
import { Tasks } from './pages/Tasks';
import { Reports } from './pages/Reports';
import { SettingsPage } from './pages/Settings';

export function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (!user) return <Login />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="/clienti" element={<Clients />} />
        <Route path="/clienti/:id" element={<ClientDetail />} />
        <Route path="/abonamente" element={<Subscriptions />} />
        <Route path="/scadentar" element={<Billing />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/interventii" element={<WorkLogs />} />
        <Route path="/taskuri" element={<Tasks />} />
        <Route path="/rapoarte" element={<Reports />} />
        <Route path="/setari" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
