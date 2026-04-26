import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageCircle, X, Send, Loader2 } from 'lucide-react';
import { api } from '../api';
import { useCart } from '../context/CartContext';

const WELCOME_MESSAGE = {
  role: 'assistant',
  content: '¡Hola! Soy el asistente de AMA Café ☕ ¿En qué puedo ayudarte? Puedo recomendarte algo del menú, contarte sobre nuestros productos o resolver tus dudas.',
};

function loadRecaptchaScript(siteKey) {
  if (document.getElementById('recaptcha-v3-script')) return;
  const script = document.createElement('script');
  script.id = 'recaptcha-v3-script';
  script.src = `https://www.google.com/recaptcha/api.js?render=${siteKey}`;
  script.async = true;
  document.head.appendChild(script);
}

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([WELCOME_MESSAGE]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [recaptchaSiteKey, setRecaptchaSiteKey] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const { cart } = useCart();

  useEffect(() => {
    api.getRecaptchaConfig().then(config => {
      if (config.enabled && config.siteKey) {
        setRecaptchaSiteKey(config.siteKey);
        loadRecaptchaScript(config.siteKey);
      }
    }).catch(() => {});
  }, []);

  const getRecaptchaToken = useCallback(async () => {
    if (!recaptchaSiteKey || !window.grecaptcha) return null;
    try {
      await new Promise(resolve => window.grecaptcha.ready(resolve));
      return await window.grecaptcha.execute(recaptchaSiteKey, { action: 'chat' });
    } catch {
      return null;
    }
  }, [recaptchaSiteKey]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  async function handleSend(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    const userMessage = { role: 'user', content: text };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const history = messages.filter(m => m !== WELCOME_MESSAGE);
      const cartId = localStorage.getItem('ama_cart_id');
      const recaptchaToken = await getRecaptchaToken();
      const data = await api.sendMessage(text, cartId, history, recaptchaToken);
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: err.reply || 'Lo siento, hubo un problema al conectar con el asistente. Intenta de nuevo.',
      }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* FAB Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-ama-amber hover:bg-ama-amber-light text-ama-darker flex items-center justify-center shadow-lg transition-all duration-300 hover:scale-105 cursor-pointer"
        aria-label={isOpen ? 'Cerrar chat' : 'Abrir chat'}
      >
        {isOpen ? <X size={24} /> : <MessageCircle size={24} />}
      </button>

      {/* Chat Panel */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 z-50 w-[360px] max-w-[calc(100vw-48px)] h-[500px] max-h-[calc(100vh-140px)] bg-ama-dark border border-ama-border rounded-2xl shadow-2xl flex flex-col animate-scale-in overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-ama-border bg-ama-card rounded-t-2xl">
            <div className="w-8 h-8 rounded-full bg-ama-amber/20 flex items-center justify-center text-ama-amber text-sm font-bold">
              A
            </div>
            <div>
              <p className="text-sm font-semibold text-ama-text">AMA Café Asistente</p>
              <p className="text-xs text-ama-success flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-ama-success inline-block" />
                En línea
              </p>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-ama-amber text-ama-darker rounded-br-md'
                      : 'bg-ama-card text-ama-text border border-ama-border rounded-bl-md'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-ama-card border border-ama-border rounded-2xl rounded-bl-md px-4 py-2">
                  <Loader2 size={16} className="animate-spin text-ama-amber" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form onSubmit={handleSend} className="flex items-center gap-2 px-3 py-3 border-t border-ama-border">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Escribe tu mensaje..."
              className="flex-1 bg-ama-card border border-ama-border rounded-xl px-3 py-2 text-sm text-ama-text placeholder:text-ama-text-muted outline-none focus:border-ama-amber/50 transition-colors"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="w-9 h-9 rounded-xl bg-ama-amber hover:bg-ama-amber-light disabled:opacity-40 disabled:hover:bg-ama-amber text-ama-darker flex items-center justify-center transition-colors cursor-pointer"
            >
              <Send size={16} />
            </button>
          </form>
          {recaptchaSiteKey && (
            <div className="px-3 pb-2 text-center text-[10px] leading-tight text-ama-text-muted">
              Protegido por reCAPTCHA de Google —{' '}
              <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:text-ama-text">Privacidad</a>
              {' · '}
              <a href="https://policies.google.com/terms" target="_blank" rel="noopener noreferrer" className="underline hover:text-ama-text">Términos</a>
            </div>
          )}
        </div>
      )}
    </>
  );
}
