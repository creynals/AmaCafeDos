import { Plus } from 'lucide-react';
import { formatPrice } from '../utils/format';

export default function ProductCard({ product, onSelect, onQuickAdd, className = '' }) {
  return (
    <div
      onClick={() => onSelect(product)}
      className={`bg-ama-card rounded-2xl border border-ama-border hover:border-ama-amber/50 hover:shadow-lg hover:shadow-ama-amber/5 transition-all duration-300 cursor-pointer group overflow-hidden ${className}`}
    >
      <div className="h-32 bg-ama-dark overflow-hidden">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-5xl group-hover:scale-110 transition-transform duration-300">
            ☕
          </div>
        )}
      </div>
      <div className="p-4">
        <h3 className="text-sm font-semibold text-ama-text leading-tight mb-1">
          {product.name}
        </h3>
        <p className="text-xs text-ama-text-muted line-clamp-2 mb-3">
          {product.description}
        </p>
        <div className="flex items-center justify-between">
          <span className="text-ama-amber font-bold text-base">
            {formatPrice(product.price)}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onQuickAdd(product.id);
            }}
            className="bg-ama-amber hover:bg-ama-amber-light text-ama-darker rounded-full p-1.5 transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
