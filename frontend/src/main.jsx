import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './index.css';
import App from './App.jsx';
import AdminPage from './components/AdminPage.jsx';
import LoginPage from './components/LoginPage.jsx';
import CheckoutSuccessPage from './components/CheckoutSuccessPage.jsx';
import { CartProvider } from './context/CartContext';
import { ToastProvider } from './context/ToastContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Loader2 } from 'lucide-react';

function ProtectedAdmin() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-ama-darker flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-ama-amber" />
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return <AdminPage />;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <CartProvider>
          <AuthProvider>
            <Routes>
              <Route path="/" element={<App />} />
              <Route path="/admin" element={<ProtectedAdmin />} />
              <Route path="/checkout/success" element={<CheckoutSuccessPage />} />
            </Routes>
          </AuthProvider>
        </CartProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
