import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { CheckoutPage } from './pages/CheckoutPage';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/pay/:sessionId" element={<CheckoutPage />} />
        <Route
          path="/status/success"
          element={
            <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white text-center p-4">
              <div className="max-w-md bg-slate-900 border border-slate-800 p-8 rounded-3xl space-y-3">
                <div className="h-12 w-12 bg-emerald-500/10 text-emerald-400 rounded-full flex items-center justify-center mx-auto text-xl font-bold">✓</div>
                <h2 className="text-xl font-bold">Transaction Complete</h2>
                <p className="text-xs text-slate-400">Order successfully placed. You can now close this tab.</p>
              </div>
            </div>
          }
        />
        <Route
          path="/status/cancel"
          element={
            <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white text-center p-4">
              <div className="max-w-md bg-slate-900 border border-slate-800 p-8 rounded-3xl space-y-3">
                <div className="h-12 w-12 bg-rose-500/10 text-rose-400 rounded-full flex items-center justify-center mx-auto text-xl font-bold">✕</div>
                <h2 className="text-xl font-bold">Payment Cancelled</h2>
                <p className="text-xs text-slate-400">You cancelled the payment process.</p>
              </div>
            </div>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};
