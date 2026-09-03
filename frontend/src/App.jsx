import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import AppLayout from './components/AppLayout.jsx';
import LoginPage from './pages/LoginPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import DataKasusPage from './pages/DataKasusPage.jsx';
import MockupPage from './pages/MockupPage.jsx';
import FormKasusPage from './pages/FormKasusPage.jsx';
import HrReportPage from './pages/HrReportPage.jsx';
import SheetConfigPage from './pages/SheetConfigPage.jsx';
import BillingPage from './pages/BillingPage.jsx';
import FinanceAuditPage from './pages/FinanceAuditPage.jsx';
import RolesPage from './pages/RolesPage.jsx';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route element={<AppLayout />}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/kasus" element={<DataKasusPage />} />
            <Route path="/mockup" element={<MockupPage />} />
            <Route path="/form" element={<FormKasusPage />} />
            <Route path="/hrreport" element={<HrReportPage />} />
            {/* /master & /pricelist dialihkan ke /cfg oleh AppLayout */}
            <Route path="/cfg" element={<SheetConfigPage />} />
            <Route path="/billing" element={<BillingPage />} />
            <Route path="/finance" element={<FinanceAuditPage />} />
            <Route path="/roles" element={<RolesPage />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
