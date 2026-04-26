import { useEffect, useRef, useState } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';

/**
 * SumUp Card Widget v2 embebido.
 *
 * Ciclo 31 (Option C — Modernización SumUp-Native, DG #2):
 *   El widget habla DIRECTO con la API de SumUp desde el navegador (PCI scope
 *   reducido — los datos de la tarjeta nunca tocan nuestro backend). Cuando
 *   el widget reporta éxito vía onResponse, el componente dispara onSuccess
 *   y el caller hace polling sobre /api/orders/:id para detectar
 *   payment_status='paid' actualizado por el webhook (source of truth).
 *
 * Carga el SDK desde el CDN público de SumUp:
 *   https://gateway.sumup.com/gateway/ecom/card/v2/sdk.js
 *
 * Si ya está cargado (otro mount previo), reusa la instancia global.
 *
 * Props:
 *   checkoutId   — id del checkout creado en el backend (orders.js)
 *   amount       — monto en CLP (para mostrar en el widget)
 *   currency     — 'CLP'
 *   locale       — 'es-CL' por default
 *   onSuccess    — callback({ status, transactionId? }) cuando widget reporta éxito
 *   onError      — callback({ message, body? }) cuando widget reporta error
 *   onLoad       — callback() cuando widget terminó de montar
 */

const SUMUP_SDK_URL = 'https://gateway.sumup.com/gateway/ecom/card/v2/sdk.js';
const CONTAINER_ID  = 'sumup-card-widget-mount';

let sdkLoadPromise = null;

function loadSumUpSdk() {
  if (typeof window !== 'undefined' && window.SumUpCard) {
    return Promise.resolve(window.SumUpCard);
  }
  if (sdkLoadPromise) return sdkLoadPromise;

  sdkLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${SUMUP_SDK_URL}"]`);
    if (existing) {
      existing.addEventListener('load',  () => resolve(window.SumUpCard));
      existing.addEventListener('error', () => reject(new Error('SumUp SDK load failed')));
      return;
    }
    const script = document.createElement('script');
    script.src   = SUMUP_SDK_URL;
    script.async = true;
    script.onload  = () => resolve(window.SumUpCard);
    script.onerror = () => {
      sdkLoadPromise = null;
      reject(new Error('SumUp SDK load failed'));
    };
    document.head.appendChild(script);
  });

  return sdkLoadPromise;
}

export default function SumUpCardWidget({
  checkoutId,
  amount,
  currency = 'CLP',
  locale   = 'es-CL',
  onSuccess,
  onError,
  onLoad,
}) {
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [errorMsg, setErrorMsg] = useState(null);
  const widgetRef = useRef(null);

  useEffect(() => {
    if (!checkoutId) return;
    let disposed = false;

    (async () => {
      try {
        const SumUpCard = await loadSumUpSdk();
        if (disposed) return;
        if (!SumUpCard?.mount) {
          throw new Error('SumUp SDK loaded pero SumUpCard.mount no existe');
        }

        widgetRef.current = SumUpCard.mount({
          id:         CONTAINER_ID,
          checkoutId,
          amount,
          currency,
          locale,
          onLoad: () => {
            if (disposed) return;
            setStatus('ready');
            onLoad?.();
          },
          onResponse: (type, body) => {
            // [FASE 0 — instrumentación diagnóstica C73] log crudo del SDK SumUp
            console.log('[sumup][onResponse][type]', type);
            console.log('[sumup][onResponse][body]', body);
            // Ciclo 80 (R1+R2): 'sent' NO es terminal — solo significa que la
            // tarjeta fue enviada al procesador. Disparar onSuccess en 'sent'
            // arrancaba el sync/polling antes de que SumUp ejecutara el cobro
            // (raíz de checkouts en PENDING con transactions:[]). Solo
            // 'success' es el evento terminal de éxito.
            if (type === 'success') {
              onSuccess?.({ type, body });
            } else if (type === 'error' || type === 'invalid') {
              onError?.({
                message: body?.message || 'Pago rechazado por el procesador.',
                body,
              });
            } else if (type === 'auth-screen-displayed') {
              // 3DS challenge en curso — el widget gestiona la UI; no tocar.
              console.log('[sumup][onResponse] 3DS flow iniciado');
            } else if (type === 'sent') {
              // Tarjeta enviada al procesador; esperando 'success' o 'error'.
              console.log('[sumup][onResponse] tarjeta enviada, esperando resultado');
            }
          },
        });
      } catch (err) {
        if (disposed) return;
        setStatus('error');
        setErrorMsg(err.message);
        onError?.({ message: err.message });
      }
    })();

    return () => {
      disposed = true;
      try {
        if (widgetRef.current?.unmount) widgetRef.current.unmount();
      } catch {
        // unmount es best-effort; SumUp SDK no documenta el contrato exacto
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkoutId]);

  return (
    <div className="w-full">
      {status === 'loading' && (
        <div className="flex items-center gap-2 text-sm text-ama-text-muted py-4">
          <Loader2 className="w-4 h-4 animate-spin" />
          Cargando formulario de pago seguro...
        </div>
      )}
      {status === 'error' && (
        <div className="flex items-start gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl p-3">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">No se pudo cargar el formulario de pago</p>
            <p className="text-xs text-red-400/80 mt-1">{errorMsg}</p>
          </div>
        </div>
      )}
      <div
        id={CONTAINER_ID}
        className={status === 'ready' ? 'block' : 'hidden'}
      />
    </div>
  );
}
