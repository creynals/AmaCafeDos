import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

const DEFAULT_DURATION = 4000;

const VARIANTS = {
  success: {
    icon: CheckCircle2,
    classes: 'bg-green-500/10 border-green-500/30 text-green-300',
    iconClass: 'text-green-400',
  },
  error: {
    icon: AlertCircle,
    classes: 'bg-red-500/10 border-red-500/30 text-red-300',
    iconClass: 'text-red-400',
  },
  info: {
    icon: Info,
    classes: 'bg-ama-amber/10 border-ama-amber/30 text-ama-amber',
    iconClass: 'text-ama-amber',
  },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((curr) => curr.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((type, message, duration = DEFAULT_DURATION) => {
    const id = ++idRef.current;
    setToasts((curr) => [...curr, { id, type, message }]);
    if (duration > 0) {
      setTimeout(() => dismiss(id), duration);
    }
    return id;
  }, [dismiss]);

  const value = {
    success: useCallback((msg, dur) => push('success', msg, dur), [push]),
    error: useCallback((msg, dur) => push('error', msg, dur), [push]),
    info: useCallback((msg, dur) => push('info', msg, dur), [push]),
    dismiss,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastViewport({ toasts, onDismiss }) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2 max-w-sm pointer-events-none">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }) {
  const variant = VARIANTS[toast.type] || VARIANTS.info;
  const Icon = variant.icon;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div
      role="status"
      className={`pointer-events-auto flex items-start gap-2 rounded-xl border px-4 py-3 backdrop-blur-sm shadow-lg transition-all duration-200 ${variant.classes} ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}
    >
      <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${variant.iconClass}`} />
      <p className="text-sm flex-1 leading-snug">{toast.message}</p>
      <button
        onClick={() => onDismiss(toast.id)}
        className="text-current opacity-60 hover:opacity-100 transition-opacity"
        aria-label="Cerrar notificación"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast debe usarse dentro de ToastProvider');
  return ctx;
}
