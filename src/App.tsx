import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { AppShell } from '@/components/layout/AppShell';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import CourseNavigation from '@/pages/CourseNavigation';
import Dispersion from '@/pages/Dispersion';
import ExpectedStrokes from '@/pages/ExpectedStrokes';
import Conditions from '@/pages/Conditions';
import Forecast from '@/pages/Forecast';
import Rankings from '@/pages/Rankings';
import Play from '@/pages/Play';
import Tournament from '@/pages/Tournament';
import DecadeLabs from '@/pages/DecadeLabs';
import Settings from '@/pages/Settings';

function Protected({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="grid h-full place-items-center text-muted-foreground">Loading…</div>;
  return user ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/app" element={<Protected><AppShell /></Protected>}>
            <Route index element={<Dashboard />} />
            <Route path="course" element={<CourseNavigation />} />
            <Route path="dispersion" element={<Dispersion />} />
            <Route path="expected-strokes" element={<ExpectedStrokes />} />
            <Route path="conditions" element={<Conditions />} />
            <Route path="forecast" element={<Forecast />} />
            <Route path="rankings" element={<Rankings />} />
            <Route path="play" element={<Play />} />
            <Route path="tournament" element={<Tournament />} />
            <Route path="decade-labs" element={<DecadeLabs />} />
            <Route path="settings" element={<Settings />} />
          </Route>
          <Route path="*" element={<Navigate to="/app" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
