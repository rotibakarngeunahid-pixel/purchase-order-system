import { Suspense, lazy, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import ErrorBoundary from './components/ErrorBoundary';

// Lazy-load semua halaman agar bundle awal kecil & first load cepat
const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const OrderEntry = lazy(() => import('./pages/OrderEntry'));
const OrderReview = lazy(() => import('./pages/OrderReview'));
const PurchaseRecord = lazy(() => import('./pages/PurchaseRecord'));
const Reports = lazy(() => import('./pages/Reports'));
const Analytics = lazy(() => import('./pages/Analytics'));
const Settings = lazy(() => import('./pages/Settings'));
const MasterData = lazy(() => import('./pages/MasterData'));
const DistributionListing = lazy(() => import('./pages/DistributionListing'));
const PurchaseReport = lazy(() => import('./pages/PurchaseReport'));
const HolidaySettings = lazy(() => import('./pages/HolidaySettings'));
const FinancePortal = lazy(() => import('./pages/FinancePortal'));
const DataDeletion = lazy(() => import('./pages/DataDeletion'));
const DistributionPhotos = lazy(() => import('./pages/DistributionPhotos'));

function isLoggedIn() {
  return !!localStorage.getItem('rbn_token');
}

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function Layout({ children }) {
  return (
    <div className="min-h-screen bg-gray-50 md:flex">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-auto md:h-screen">
        {children}
      </main>
    </div>
  );
}

function ProtectedRoute({ loggedIn, children }) {
  if (!loggedIn) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

export default function App() {
  const [loggedIn, setLoggedIn] = useState(isLoggedIn);

  const handleLogin = () => setLoggedIn(true);

  const handleLogout = () => {
    localStorage.removeItem('rbn_token');
    setLoggedIn(false);
  };

  // Cegah scroll mouse mengubah nilai input number yang sedang fokus
  // (qty/harga bisa berubah tanpa sengaja saat user scroll halaman)
  useEffect(() => {
    const handler = (e) => {
      const el = document.activeElement;
      if (el && el.tagName === 'INPUT' && el.type === 'number' && el === e.target) {
        el.blur();
      }
    };
    document.addEventListener('wheel', handler, { passive: true });
    return () => document.removeEventListener('wheel', handler);
  }, []);

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login" element={loggedIn ? <Navigate to="/" replace /> : <Login onLogin={handleLogin} />} />
            <Route path="/" element={<ProtectedRoute loggedIn={loggedIn}><Dashboard onLogout={handleLogout} /></ProtectedRoute>} />
            <Route path="/order" element={<ProtectedRoute loggedIn={loggedIn}><OrderEntry /></ProtectedRoute>} />
            <Route path="/order/:sessionId/review" element={<ProtectedRoute loggedIn={loggedIn}><OrderReview /></ProtectedRoute>} />
            <Route path="/purchase" element={<ProtectedRoute loggedIn={loggedIn}><PurchaseRecord /></ProtectedRoute>} />
            <Route path="/reports" element={<ProtectedRoute loggedIn={loggedIn}><Reports /></ProtectedRoute>} />
            <Route path="/analytics" element={<ProtectedRoute loggedIn={loggedIn}><Analytics /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute loggedIn={loggedIn}><Settings /></ProtectedRoute>} />
            <Route path="/master" element={<ProtectedRoute loggedIn={loggedIn}><MasterData /></ProtectedRoute>} />
            <Route path="/purchase-report" element={<ProtectedRoute loggedIn={loggedIn}><PurchaseReport /></ProtectedRoute>} />
            <Route path="/finance-portal" element={<ProtectedRoute loggedIn={loggedIn}><FinancePortal /></ProtectedRoute>} />
            <Route path="/holidays" element={<ProtectedRoute loggedIn={loggedIn}><HolidaySettings /></ProtectedRoute>} />
            <Route path="/data-deletion" element={<ProtectedRoute loggedIn={loggedIn}><DataDeletion /></ProtectedRoute>} />
            <Route path="/distribution-photos" element={<ProtectedRoute loggedIn={loggedIn}><DistributionPhotos /></ProtectedRoute>} />
            <Route path="/distribution" element={<DistributionListing />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
