import { useState, useEffect, useMemo } from 'react';
import Header from './components/Header';
import Hero from './components/Hero';
import CategoryBar from './components/CategoryBar';
import ProductCard from './components/ProductCard';
import ProductModal from './components/ProductModal';
import CartDrawer from './components/CartDrawer';
import ChatWidget from './components/ChatWidget';
import SkeletonCard from './components/SkeletonCard';
import { useCart } from './context/CartContext';
import { useToast } from './context/ToastContext';
import { api } from './api';

function App() {
  const [menu, setMenu] = useState([]);
  const [activeCategory, setActiveCategory] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const { addItem } = useCart();
  const toast = useToast();

  useEffect(() => {
    api.getMenu()
      .then((data) => {
        setMenu(data);
      })
      .catch((err) => {
        console.error('Error loading menu:', err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const categories = useMemo(() =>
    menu.map(({ id, name, display_name }) => ({ id, name, display_name })),
    [menu]
  );

  const filteredMenu = useMemo(() => {
    let filtered = menu;

    if (activeCategory) {
      filtered = filtered.filter((cat) => cat.name === activeCategory);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered
        .map((cat) => ({
          ...cat,
          products: cat.products.filter(
            (p) =>
              p.name.toLowerCase().includes(q) ||
              p.description.toLowerCase().includes(q)
          ),
        }))
        .filter((cat) => cat.products.length > 0);
    }

    return filtered;
  }, [menu, activeCategory, searchQuery]);

  return (
    <div className="min-h-screen bg-ama-darker">
      <Header onSearch={setSearchQuery} />
      <Hero />

      <div id="menu">
        <CategoryBar
          categories={categories}
          active={activeCategory}
          onSelect={setActiveCategory}
        />

        <main className="max-w-6xl mx-auto px-4 py-8">
          {loading ? (
            <section className="mb-12">
              <div className="h-7 bg-ama-card rounded w-40 mb-6 animate-pulse" />
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <SkeletonCard key={i} />
                ))}
              </div>
            </section>
          ) : filteredMenu.length === 0 ? (
            <div className="text-center py-20 text-ama-text-muted">
              <p className="text-lg">No se encontraron productos</p>
              <p className="text-sm mt-1">Intenta con otra busqueda</p>
            </div>
          ) : (
            filteredMenu.map((category) => (
              <section key={category.name} className="mb-12 animate-fade-in-up">
                <h2 className="text-2xl font-bold text-ama-text mb-1">
                  {category.display_name}
                </h2>
                {category.description && (
                  <p className="text-sm text-ama-text-muted mb-6">{category.description}</p>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  {category.products.map((product, idx) => (
                    <ProductCard
                      key={product.id}
                      product={{ ...product, category_name: category.name }}
                      onSelect={setSelectedProduct}
                      onQuickAdd={async (id) => {
                        await addItem(id);
                        toast.success(`${product.name} agregado al carrito`);
                      }}
                      className={`animate-fade-in-up stagger-${Math.min(idx + 1, 8)}`}
                    />
                  ))}
                </div>
              </section>
            ))
          )}
        </main>
      </div>

      <footer className="border-t border-ama-border py-8 text-center text-sm text-ama-text-muted">
        <p>AMA Cafe &mdash; Una nueva experiencia para disfrutar</p>
      </footer>

      <ProductModal
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
      />
      <CartDrawer />
      <ChatWidget />
    </div>
  );
}

export default App;
