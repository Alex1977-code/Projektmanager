import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ToastProvider } from './components/Toast';
import { ConfirmProvider } from './components/Modal';
import { StoreProvider } from './store';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Projects } from './pages/Projects';
import { ProjectDetail } from './pages/ProjectDetail';
import { Schedule } from './pages/Schedule';
import { Resources } from './pages/Resources';
import { Tasks } from './pages/Tasks';
import { Timesheet } from './pages/Timesheet';
import { Controlling } from './pages/Controlling';
import { Team } from './pages/Team';
import { Settings } from './pages/Settings';

export function App() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <StoreProvider>
          <BrowserRouter>
            <Layout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/projekte" element={<Projects />} />
                <Route path="/projekte/:id" element={<ProjectDetail />} />
                <Route path="/terminplan" element={<Schedule />} />
                <Route path="/ressourcen" element={<Resources />} />
                <Route path="/aufgaben" element={<Tasks />} />
                <Route path="/zeiten" element={<Timesheet />} />
                <Route path="/controlling" element={<Controlling />} />
                <Route path="/team" element={<Team />} />
                <Route path="/einstellungen" element={<Settings />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Layout>
          </BrowserRouter>
        </StoreProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}
