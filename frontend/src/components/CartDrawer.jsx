import { useState } from 'react';
import { X, Minus, Plus, Trash2, ShoppingBag } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { formatPrice } from '../utils/format';
import CheckoutModal from './CheckoutModal';

export default function CartDrawer() {
  const { cart, isOpen, setIsOpen, updateItem, removeItem, clearCart, loading, total, itemCount } = useCart();
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  if (!isOpen) return null;

  const items = cart?.items || [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={() => setIsOpen(false)} />
      <div className="relative w-full max-w-md bg-ama-card border-l border-ama-border flex flex-col h-full animate-slide-in-right">
        <div className="flex items-center justify-between p-4 border-b border-ama-border">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-ama-amber" />
            <h2 className="text-lg font-semibold text-ama-text">Tu Pedido</h2>
            {itemCount > 0 && (
              <span className="bg-ama-amber text-ama-darker text-xs font-bold px-2 py-0.5 rounded-full">
                {itemCount}
              </span>
            )}
          </div>
          <button onClick={() => setIsOpen(false)} className="p-1 text-ama-text-muted hover:text-ama-text">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-ama-text-muted">
              <ShoppingBag className="w-16 h-16 mb-4 opacity-30" />
              <p className="text-lg font-medium mb-1">Tu carrito esta vacio</p>
              <p className="text-sm">Agrega productos del menu</p>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <div key={item.item_id} className="bg-ama-dark rounded-xl p-4 border border-ama-border">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1 mr-2">
                      <h3 className="text-sm font-semibold text-ama-text">{item.name}</h3>
                      <p className="text-xs text-ama-text-muted">{formatPrice(item.price)} c/u</p>
                    </div>
                    <button
                      onClick={() => removeItem(item.item_id)}
                      disabled={loading}
                      className="p-1 text-ama-text-muted hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 bg-ama-card rounded-full px-2 py-1">
                      <button
                        onClick={() => updateItem(item.item_id, item.quantity - 1)}
                        disabled={loading || item.quantity <= 1}
                        className="p-0.5 text-ama-text-muted hover:text-ama-text disabled:opacity-30"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-sm font-semibold text-ama-text w-5 text-center">{item.quantity}</span>
                      <button
                        onClick={() => updateItem(item.item_id, item.quantity + 1)}
                        disabled={loading}
                        className="p-0.5 text-ama-text-muted hover:text-ama-text"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <span className="text-sm font-bold text-ama-amber">{formatPrice(item.subtotal)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div className="border-t border-ama-border p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-ama-text-muted">Total</span>
              <span className="text-xl font-bold text-ama-amber">{formatPrice(total)}</span>
            </div>
            <button
              onClick={() => setCheckoutOpen(true)}
              className="w-full bg-ama-amber hover:bg-ama-amber-light text-ama-darker font-semibold py-3 rounded-full transition-colors"
            >
              Confirmar Pedido
            </button>
            <button
              onClick={clearCart}
              disabled={loading}
              className="w-full text-sm text-ama-text-muted hover:text-red-400 transition-colors py-1"
            >
              Vaciar carrito
            </button>
          </div>
        )}
      </div>

      <CheckoutModal
        isOpen={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
      />
    </div>
  );
}
