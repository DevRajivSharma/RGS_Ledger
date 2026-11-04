import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { DeveloperPortal } from './pages/DeveloperPortal';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/*" element={<DeveloperPortal />} />
      </Routes>
    </BrowserRouter>
  );
};
