import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useOutletContext } from 'react-router-dom';
import WorkbenchPage from './pages/WorkbenchPage';
import AdminPage from './pages/AdminPage';
import WorkbenchTabsPage from './pages/WorkbenchTabsPage';
import PsdAutoFillTab from './pages/Workbench/PsdAutoFillTab';
import BatchProductImageTab from './pages/Workbench/BatchProductImageTab';
import CutoutNoPsdTab from './pages/Workbench/CutoutNoPsdTab';

function useRenderServerBaseUrl() {
  const ctx = useOutletContext();
  return ctx && typeof ctx === 'object' ? ctx.renderServerBaseUrl || '' : '';
}

function PsdAutoFillTabRoute() {
  const renderServerBaseUrl = useRenderServerBaseUrl();
  return <PsdAutoFillTab renderServerBaseUrl={renderServerBaseUrl} />;
}

function BatchProductImageTabRoute() {
  const renderServerBaseUrl = useRenderServerBaseUrl();
  return <BatchProductImageTab renderServerBaseUrl={renderServerBaseUrl} />;
}

function CutoutNoPsdTabRoute() {
  const renderServerBaseUrl = useRenderServerBaseUrl();
  return <CutoutNoPsdTab renderServerBaseUrl={renderServerBaseUrl} />;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/workbench/psd-autofill" replace />} />
        <Route path="/workbench" element={<WorkbenchTabsPage />}>
          <Route index element={<Navigate to="/workbench/psd-autofill" replace />} />
          <Route path="psd-autofill" element={<PsdAutoFillTabRoute />} />
          <Route path="batch-product-images" element={<BatchProductImageTabRoute />} />
          <Route path="cutout-no-psd" element={<CutoutNoPsdTabRoute />} />
        </Route>
        <Route path="/slot" element={<WorkbenchPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
