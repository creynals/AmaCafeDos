import { useEffect, useRef, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { CheckCircle2, XCircle, Loader2, AlertCircle } from 'lucide-react';
import { api } from '../api';
import { formatPrice } from '../utils/format';

// Polling para estados no-terminales: cada POLL_INTERVAL_MS, hasta máximo
// MAX_POLLS intentos (~60s totales). Coherente con el flujo del modal.
const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 20;

const TERMINAL = new Set(['paid', 'failed', 'cancelled']);

export default function CheckoutSuccessPage() {
  const [searchParams] = useSearchParams();
  const checkoutId = searchParams.get('checkout_id');

  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [pollCount, setPollCount] = useState(0);

  const timerRef = useRef(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!checkoutId) return;

    cancelledRef.current = false;

    async function fetchOnce(attempt) {
      try {
        const data = await api.getSumupResult(checkoutId);
        if (cancelledRef.current) return;
        setResult(data);
        setPollCount(attempt);
        if (TERMINAL.has(data.payment_status) || attempt >= MAX_POLLS) return;
        timerRef.current = setTimeout(() => fetchOnce(attempt + 1), POLL_INTERVAL_MS);
      } catch (err) {
        if (cancelledRef.current) return;
        setError(err.data?.error || err.message || 'unknown_error');
      }
    }

    fetchOnce(1);

    return () => {
      cancelledRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [checkoutId]);

  return (
    <div className="min-h-screen bg-ama-darker flex flex-col items-center justify-center px-4 py-12">
      <div className="max-w-md w-full bg-ama-card border border-ama-border rounded-xl p-8 shadow-xl">
        {renderBody({ checkoutId, result, error, pollCount })}
        <div className="mt-8 pt-6 border-t border-ama-border text-center">
          <Link
            to="/"
            className="text-ama-amber hover:underline text-sm"
          >
            Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}

function renderBody({ checkoutId, result, error, pollCount }) {
  if (!checkoutId) {
    return <ErrorBlock title="Falta checkout_id" message="La URL no contiene el parámetro checkout_id." />;
  }

  if (error === 'order_not_found') {
    return (
      <ErrorBlock
        title="Pedido no encontrado"
        message="No encontramos ningún pedido asociado a este checkout."
      />
    );
  }

  if (error) {
    return (
      <ErrorBlock
        title="Error consultando el pago"
        message="No pudimos consultar el estado del pago. Intenta recargar la página."
      />
    );
  }

  if (!result) {
    return <PendingBlock label="Consultando estado del pago..." />;
  }

  const { payment_status } = result;

  if (payment_status === 'paid') {
    return <PaidBlock result={result} />;
  }

  if (payment_status === 'failed' || payment_status === 'cancelled') {
    return <FailedBlock result={result} />;
  }

  return <PendingBlock label="Pago en validación" result={result} pollCount={pollCount} />;
}

function PaidBlock({ result }) {
  return (
    <div className="text-center">
      <CheckCircle2 className="w-16 h-16 text-green-400 mx-auto mb-4" />
      <h1 className="text-2xl font-bold text-ama-text mb-2">Pago exitoso</h1>
      <p className="text-ama-text-muted mb-6">
        Tu pedido fue confirmado correctamente.
      </p>
      <DetailRows result={result} />
    </div>
  );
}

function FailedBlock({ result }) {
  return (
    <div className="text-center">
      <XCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
      <h1 className="text-2xl font-bold text-ama-text mb-2">Pago fallido</h1>
      <p className="text-ama-text-muted mb-6">
        No pudimos completar el pago. Intenta nuevamente con otra tarjeta.
      </p>
      <DetailRows result={result} />
    </div>
  );
}

function PendingBlock({ label, result, pollCount }) {
  const exhausted = pollCount >= MAX_POLLS;
  return (
    <div className="text-center">
      <Loader2 className="w-16 h-16 text-ama-amber mx-auto mb-4 animate-spin" />
      <h1 className="text-2xl font-bold text-ama-text mb-2">{label}</h1>
      <p className="text-ama-text-muted mb-6">
        {exhausted
          ? 'El pago todavía no se confirma. Recarga esta página en unos segundos.'
          : 'Estamos confirmando el resultado del pago. No cierres esta página.'}
      </p>
      {result && <DetailRows result={result} />}
    </div>
  );
}

function ErrorBlock({ title, message }) {
  return (
    <div className="text-center">
      <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
      <h1 className="text-2xl font-bold text-ama-text mb-2">{title}</h1>
      <p className="text-ama-text-muted">{message}</p>
    </div>
  );
}

function DetailRows({ result }) {
  return (
    <dl className="text-sm text-ama-text-muted space-y-2 text-left bg-ama-darker/50 rounded-lg p-4">
      {result.order_id && (
        <Row label="Pedido" value={`#${result.order_id}`} />
      )}
      {result.transaction_code && (
        <Row label="Código transacción" value={result.transaction_code} mono />
      )}
      {result.card_scheme && (
        <Row label="Tarjeta" value={result.card_scheme} />
      )}
      {typeof result.amount === 'number' && (
        <Row
          label="Monto"
          value={`${formatPrice(result.amount)} ${result.currency || ''}`.trim()}
        />
      )}
    </dl>
  );
}

function Row({ label, value, mono = false }) {
  return (
    <div className="flex justify-between gap-4">
      <dt>{label}</dt>
      <dd className={`text-ama-text ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd>
    </div>
  );
}
