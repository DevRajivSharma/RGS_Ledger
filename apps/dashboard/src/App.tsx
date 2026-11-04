import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { OverviewPage } from './pages/OverviewPage';
import { TransactionsPage } from './pages/TransactionsPage';
import { OrdersPage } from './pages/OrdersPage';
import { CustomersPage } from './pages/CustomersPage';
import { PaymentLinksPage } from './pages/PaymentLinksPage';
import { RefundsPage } from './pages/RefundsPage';
import { SettlementsPage } from './pages/SettlementsPage';
import { ReconciliationPage } from './pages/ReconciliationPage';
import { ApiKeysPage } from './pages/ApiKeysPage';
import { WebhooksPage } from './pages/WebhooksPage';
import { KycPage } from './pages/KycPage';
import { SettingsPage } from './pages/SettingsPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { apiRequest } from './services/api';

export const App: React.FC = () => {
  const [user, setUser] = useState<any | null>(null);
  const [merchant, setMerchant] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = async () => {
    setLoading(true);
    const res = await apiRequest('/auth/me');
    if (res.success && res.data) {
      setUser(res.data.user);
      setMerchant(res.data.merchant);
    } else {
      setUser(null);
      setMerchant(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const handleLogout = async () => {
    await apiRequest('/auth/logout', { method: 'POST' });
    localStorage.removeItem('rgs_token');
    setUser(null);
    setMerchant(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 text-xs font-semibold">
        <div className="flex flex-col items-center space-y-3">
          <div className="h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <span>Loading RGS Ledger...</span>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* Public Auth Routes */}
        <Route
          path="/login"
          element={user ? <Navigate to="/" replace /> : <LoginPage onLoginSuccess={checkAuth} />}
        />
        <Route
          path="/register"
          element={user ? <Navigate to="/" replace /> : <RegisterPage onLoginSuccess={checkAuth} />}
        />

        {/* Protected Dashboard Layout */}
        <Route
          path="/*"
          element={
            !user ? (
              <Navigate to="/login" replace />
            ) : (
              <div className="min-h-screen bg-slate-950 text-slate-100 flex">
                <Sidebar
                  businessName={merchant?.businessName || 'Acme Store'}
                  isSandbox={merchant?.environmentMode === 'SANDBOX'}
                />

                <div className="flex-1 ml-64 flex flex-col min-w-0">
                  <Header
                    userEmail={user.email}
                    userName={user.fullName}
                    onLogout={handleLogout}
                  />

                  <main className="flex-1 p-8 overflow-y-auto">
                    <Routes>
                      <Route path="/" element={<OverviewPage />} />
                      <Route path="/transactions" element={<TransactionsPage />} />
                      <Route path="/orders" element={<OrdersPage />} />
                      <Route path="/customers" element={<CustomersPage />} />
                      <Route path="/payment-links" element={<PaymentLinksPage />} />
                      <Route path="/refunds" element={<RefundsPage />} />
                      <Route path="/settlements" element={<SettlementsPage />} />
                      <Route path="/reconciliation" element={<ReconciliationPage />} />
                      <Route path="/api-keys" element={<ApiKeysPage />} />
                      <Route path="/webhooks" element={<WebhooksPage />} />
                      <Route path="/kyc" element={<KycPage />} />
                      <Route path="/settings" element={<SettingsPage />} />
                      <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                  </main>
                </div>
              </div>
            )
          }
        />
      </Routes>
    </BrowserRouter>
  );
};
