import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { usePermissions } from './hooks/usePermissions.js';
import AppLayout from './components/AppLayout.jsx';
import LoginPage from './pages/LoginPage.jsx';
import SignUpPage from './pages/SignUpPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import DataKasusPage from './pages/DataKasusPage.jsx';
import MockupPage from './pages/MockupPage.jsx';
import FormKasusPage from './pages/FormKasusPage.jsx';
import HrReportPage from './pages/HrReportPage.jsx';
import SheetConfigPage from './pages/SheetConfigPage.jsx';
import BillingPage from './pages/BillingPage.jsx';
import FinanceAuditPage from './pages/FinanceAuditPage.jsx';
import RolesPage from './pages/RolesPage.jsx';

// Penjaga route per modul izin (matriks diatur di /roles, Super Admin selalu lolos).
// Akses langsung via URL ke modul terlarang → kembali ke dashboard.
function RequirePerm({ module, children }) {
  const { can, role } = usePermissions();
  if (!can(module)) {
    if (module === 'dashboard') {
      return (
        <div className="px-8 py-12 text-sm text-slate-500">
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
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignUpPage />} />

          <Route element={<AppLayout />}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<RequirePerm module="dashboard"><DashboardPage /></RequirePerm>} />
            <Route path="/kasus" element={<RequirePerm module="cases"><DataKasusPage /></RequirePerm>} />
            <Route path="/mockup" element={<RequirePerm module="mockup"><MockupPage /></RequirePerm>} />
            <Route path="/form" element={<RequirePerm module="form"><FormKasusPage /></RequirePerm>} />
            <Route path="/hrreport" element={<RequirePerm module="hrreport"><HrReportPage /></RequirePerm>} />
            {/* /master & /pricelist dialihkan ke /cfg oleh AppLayout */}
            <Route path="/cfg" element={<RequirePerm module="cfg"><SheetConfigPage /></RequirePerm>} />
            <Route path="/billing" element={<RequirePerm module="billing"><BillingPage /></RequirePerm>} />
            <Route path="/finance" element={<RequirePerm module="finance"><FinanceAuditPage /></RequirePerm>} />
            <Route path="/roles" element={<RequirePerm module="roles"><RolesPage /></RequirePerm>} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
