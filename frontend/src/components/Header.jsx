import { ShoppingCart, Search, X, Settings, Coffee } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';

export default function Header({ onSearch }) {
  const { itemCount, setIsOpen } = useCart();
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');

  const handleSearch = (e) => {
    e.preventDefault();
    onSearch?.(query);
  };

  const clearSearch = () => {
    setQuery('');
    onSearch?.('');
    setSearchOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 bg-ama-darker/95 backdrop-blur-md border-b border-ama-border">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
        <a href="/" className="flex items-center gap-2 no-underline shrink-0">
          <img
            src="/images/logo-ama.jpg"
            alt="AMA Café"
            className="w-10 h-10 rounded-full object-cover"
          />
          <span className="text-xl font-semibold tracking-tight text-ama-text">
            <span className="text-ama-amber">AMA</span> Café
          </span>
        </a>

        <div className="hidden md:inline-flex items-center gap-2 bg-ama-card/60 border border-ama-border rounded-full px-3 py-1.5 min-w-0">
          <Coffee className="w-3.5 h-3.5 text-ama-amber shrink-0" />
          <span className="text-xs text-ama-text-muted truncate">
            Una nueva experiencia para disfrutar
          </span>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {searchOpen ? (
            <form onSubmit={handleSearch} className="flex items-center gap-2">
              <input
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  onSearch?.(e.target.value);
                }}
                placeholder="Buscar..."
                autoFocus
                className="bg-ama-card border border-ama-border rounded-lg px-3 py-1.5 text-sm text-ama-text placeholder-ama-text-muted focus:outline-none focus:border-ama-amber w-40 sm:w-56"
              />
              <button type="button" onClick={clearSearch} className="text-ama-text-muted hover:text-ama-text">
                <X className="w-5 h-5" />
              </button>
            </form>
          ) : (
            <button
              onClick={() => setSearchOpen(true)}
              className="p-2 text-ama-text-muted hover:text-ama-text transition-colors"
            >
              <Search className="w-5 h-5" />
            </button>
          )}

          <button
            onClick={() => setIsOpen(true)}
            className="relative p-2 text-ama-text-muted hover:text-ama-amber transition-colors"
          >
            <ShoppingCart className="w-6 h-6" />
            {itemCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-ama-amber text-ama-darker text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {itemCount}
              </span>
            )}
          </button>

          <button
            onClick={() => navigate('/admin')}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-ama-text-muted hover:text-ama-amber border border-ama-border hover:border-ama-amber/30 rounded-lg transition-colors cursor-pointer"
            title="Panel de Administración"
          >
            <Settings className="w-4 h-4" />
            ADM
          </button>
        </div>
      </div>
    </header>
  );
}
