import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ToastProvider } from './components/Toast';
import { ConfirmProvider } from './components/Modal';
import { StoreProvider } from './store';
import { AuthProvider } from './auth';
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
import { Protocols } from './pages/Protocols';
import { ProtocolEditor } from './pages/ProtocolEditor';
import { Absences } from './pages/Absences';
import { Invoices } from './pages/Invoices';
import { InvoiceEditor } from './pages/InvoiceEditor';

export function App() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <AuthProvider>
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
                <Route path="/protokolle" element={<Protocols />} />
                <Route path="/protokolle/:id" element={<ProtocolEditor />} />
                <Route path="/abwesenheiten" element={<Absences />} />
                <Route path="/rechnungen" element={<Invoices />} />
                <Route path="/rechnungen/:id" element={<InvoiceEditor />} />
                <Route path="/team" element={<Team />} />
                <Route path="/einstellungen" element={<Settings />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Layout>
          </BrowserRouter>
        </StoreProvider>
        </AuthProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}
