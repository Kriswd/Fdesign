import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useOutletContext } from 'react-router-dom';

const WorkbenchPage = lazy(() => import('./pages/WorkbenchPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const WorkbenchTabsPage = lazy(() => import('./pages/WorkbenchTabsPage'));
const PsdAutoFillTab = lazy(() => import('./pages/Workbench/PsdAutoFillTab'));
const BatchProductImageTab = lazy(() => import('./pages/Workbench/BatchProductImageTab'));
const CutoutNoPsdTab = lazy(() => import('./pages/Workbench/CutoutNoPsdTab'));

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

function RouteLoading() {
  return (
    <div className="min-h-screen bg-[#070b14] text-slate-200 flex items-center justify-center">
      <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm shadow-xl">
        正在加载...
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteLoading />}>
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
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
