import { useState, useEffect } from 'react';
import { X, Minus, Plus } from 'lucide-react';
import { api } from '../api';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { formatPrice } from '../utils/format';

export default function ProductModal({ product, onClose }) {
  const { addItem } = useCart();
  const toast = useToast();
  const [detail, setDetail] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (product) {
      api.getProduct(product.id).then(setDetail);
      setQuantity(1);
    }
  }, [product]);

  if (!product) return null;

  const data = detail || product;

  const handleAdd = async () => {
    setAdding(true);
    await addItem(data.id, quantity);
    toast.success(`${quantity}x ${data.name} agregado al carrito`);
    setAdding(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative bg-ama-card rounded-t-3xl sm:rounded-2xl w-full max-w-md max-h-[85vh] overflow-y-auto border border-ama-border animate-slide-up sm:animate-scale-in">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 bg-ama-dark/80 rounded-full text-ama-text-muted hover:text-ama-text z-10"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="h-48 bg-ama-dark overflow-hidden">
          {product.image_url ? (
            <img
              src={product.image_url}
              alt={product.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-7xl">
              ☕
            </div>
          )}
        </div>

        <div className="p-6">
          <h2 className="text-xl font-bold text-ama-text mb-1">{data.name}</h2>
          <p className="text-ama-text-muted text-sm mb-4">{data.description}</p>
          <p className="text-2xl font-bold text-ama-amber mb-6">{formatPrice(data.price)}</p>

          {detail?.options?.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-ama-text mb-3">Adicionales (+$500 c/u)</h3>
              <div className="flex flex-wrap gap-2">
                {detail.options.map((opt) => (
                  <span
                    key={opt.id}
                    className="px-3 py-1.5 bg-ama-dark rounded-full text-xs text-ama-text-muted border border-ama-border"
                  >
                    {opt.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 bg-ama-dark rounded-full px-2 py-1">
              <button
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                className="p-1 text-ama-text-muted hover:text-ama-text"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="text-ama-text font-semibold w-6 text-center">{quantity}</span>
              <button
                onClick={() => setQuantity(quantity + 1)}
                className="p-1 text-ama-text-muted hover:text-ama-text"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={handleAdd}
              disabled={adding}
              className="bg-ama-amber hover:bg-ama-amber-light disabled:opacity-50 text-ama-darker font-semibold px-6 py-2.5 rounded-full transition-colors"
            >
              {adding ? 'Agregando...' : `Agregar ${formatPrice(data.price * quantity)}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
