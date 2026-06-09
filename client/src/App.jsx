import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import OrderEntry from './pages/OrderEntry';
import OrderReview from './pages/OrderReview';
import PurchaseRecord from './pages/PurchaseRecord';
import Reports from './pages/Reports';
import Analytics from './pages/Analytics';
import Settings from './pages/Settings';
import MasterData from './pages/MasterData';
import DistributionListing from './pages/DistributionListing';
import PurchaseReport from './pages/PurchaseReport';
import HolidaySettings from './pages/HolidaySettings';
import FinancePortal from './pages/FinancePortal';
import DataDeletion from './pages/DataDeletion';
import DistributionPhotos from './pages/DistributionPhotos';
import Sidebar from './components/Sidebar';

function isLoggedIn() {
  return !!localStorage.getItem('rbn_token');
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

  return (
    <BrowserRouter>
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
    </BrowserRouter>
  );
}
