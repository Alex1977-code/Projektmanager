import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, MemoryRouter, Navigate, Route, Routes } from 'react-router-dom';
import { IS_HOSTED } from './hosted';
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
import { Worktime } from './pages/Worktime';
import { Offers } from './pages/Offers';
import { Reports } from './pages/Reports';
import { Messages } from './pages/Messages';
import { Accounting } from './pages/Accounting';
import { OfferEditor } from './pages/OfferEditor';
import { Roles } from './pages/Roles';

// Veröffentlichte Version: Browser-Backend mit gemeinsamer Datenbank (nur dort geladen)
const HostedGate = IS_HOSTED ? lazy(() => import('./local/HostedGate').then((m) => ({ default: m.HostedGate }))) : null;
// In der veröffentlichten Version gibt es keine URL-Pfade – Navigation im Speicher
const Router = IS_HOSTED ? MemoryRouter : BrowserRouter;

function Gate({ children }: { children: ReactNode }) {
  if (!HostedGate) return <>{children}</>;
  return <Suspense fallback={<div className="boot-screen"><div className="spinner" /></div>}><HostedGate>{children}</HostedGate></Suspense>;
}

export function App() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <Gate>
        <AuthProvider>
        <StoreProvider>
          <Router>
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
                <Route path="/auswertungen" element={<Reports />} />
                <Route path="/nachrichten" element={<Messages />} />
                <Route path="/buchhaltung" element={<Accounting />} />
                <Route path="/angebote" element={<Offers />} />
                <Route path="/angebote/:id" element={<OfferEditor />} />
                <Route path="/arbeitszeit" element={<Worktime />} />
                <Route path="/rollen" element={<Roles />} />
                <Route path="/team" element={<Team />} />
                <Route path="/einstellungen" element={<Settings />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Layout>
          </Router>
        </StoreProvider>
        </AuthProvider>
        </Gate>
      </ConfirmProvider>
    </ToastProvider>
  );
}
