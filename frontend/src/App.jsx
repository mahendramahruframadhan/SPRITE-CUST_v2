import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import { FontSizeProvider } from './context/FontSizeContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import { ConfirmProvider } from './components/ui/ConfirmProvider.jsx';
import { usePermissions } from './hooks/usePermissions.js';
import AppLayout from './components/AppLayout.jsx';
import { useViewTransitionLocation } from './hooks/useViewTransitionLocation.js';

// Code-splitting per halaman: bundle awal hanya memuat shell + login;
// halaman diunduh saat route dibuka (lihat warning chunk Vite sebelumnya).
const LoginPage = lazy(() => import('./pages/LoginPage.jsx'));
const SignUpPage = lazy(() => import('./pages/SignUpPage.jsx'));
const DashboardPage = lazy(() => import('./pages/DashboardPage.jsx'));
const DataKasusPage = lazy(() => import('./pages/DataKasusPage.jsx'));
const MockupPage = lazy(() => import('./pages/MockupPage.jsx'));
const FormKasusPage = lazy(() => import('./pages/FormKasusPage.jsx'));
const ClientBrandPage = lazy(() => import('./pages/ClientBrandPage.jsx'));
const HrReportPage = lazy(() => import('./pages/HrReportPage.jsx'));
const SheetConfigPage = lazy(() => import('./pages/SheetConfigPage.jsx'));
const BillingPage = lazy(() => import('./pages/BillingPage.jsx'));
const FinanceAuditPage = lazy(() => import('./pages/FinanceAuditPage.jsx'));
const RolesPage = lazy(() => import('./pages/RolesPage.jsx'));
const LogsPage = lazy(() => import('./pages/LogsPage.jsx'));
const SettingsPage = lazy(() => import('./pages/SettingsPage.jsx'));

// Fallback transisi antar-halaman (satu gaya, tanpa spinner dekoratif).
function PageFallback() {
  return (
    <div className="px-8 py-12 text-sm text-slate-500 dark:text-slate-400" role="status" aria-label="Memuat halaman">
      Memuat halaman…
    </div>
  );
}

// Routes dibungkus komponen ini agar hook view-transition (yang memakai
// useLocation) berjalan DI DALAM <BrowserRouter>.
function AnimatedRoutes() {
  const displayLocation = useViewTransitionLocation();
  return (
    <Routes location={displayLocation}>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignUpPage />} />
      <Route path="/register" element={<SignUpPage />} />

      <Route element={<AppLayout />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<RequirePerm module="dashboard"><DashboardPage /></RequirePerm>} />
        <Route path="/kasus" element={<RequirePerm module="cases"><DataKasusPage /></RequirePerm>} />
        <Route path="/mockup" element={<RequirePerm module="mockup"><MockupPage /></RequirePerm>} />
        <Route path="/form" element={<RequirePerm module="form"><FormKasusPage /></RequirePerm>} />
        <Route path="/clients" element={<RequirePerm module="clients"><ClientBrandPage /></RequirePerm>} />
        <Route path="/hrreport" element={<RequirePerm module="hrreport"><HrReportPage /></RequirePerm>} />
        {/* /master & /pricelist dialihkan ke /cfg oleh AppLayout */}
        <Route path="/cfg" element={<RequirePerm module="cfg"><SheetConfigPage /></RequirePerm>} />
        <Route path="/billing" element={<RequirePerm module="billing"><BillingPage /></RequirePerm>} />
        <Route path="/finance" element={<RequirePerm module="finance"><FinanceAuditPage /></RequirePerm>} />
        <Route path="/roles" element={<RequirePerm module="roles"><RolesPage /></RequirePerm>} />
        <Route path="/logs" element={<RequirePerm module="logs"><LogsPage /></RequirePerm>} />
        <Route path="/settings" element={<RequirePerm module="settings"><SettingsPage /></RequirePerm>} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}

// Penjaga route per modul izin (matriks diatur di /roles, Super Admin selalu lolos).
// Akses langsung via URL ke modul terlarang → kembali ke dashboard.
function RequirePerm({ module, children }) {
  const { can, role } = usePermissions();
  if (!can(module)) {
    if (module === 'dashboard') {
      return (
        <div className="px-8 py-12 text-sm text-slate-500 dark:text-slate-400">
          Role <span className="font-bold text-slate-700">{role}</span> tidak punya akses
          ke modul mana pun. Minta Super Admin mengatur izin di halaman Hak Akses.
        </div>
      );
    }
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <FontSizeProvider>
        <ToastProvider>
        <ConfirmProvider>
        <BrowserRouter>
        <Suspense fallback={<PageFallback />}>
          <AnimatedRoutes />
        </Suspense>
        </BrowserRouter>
        </ConfirmProvider>
        </ToastProvider>
        </FontSizeProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}
