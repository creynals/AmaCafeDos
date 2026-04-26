import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { api } from '../api';

const CART_KEY = 'ama_cart_id';

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const [cart, setCart] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const persistCartId = useCallback((id) => {
    if (id) localStorage.setItem(CART_KEY, id);
    else localStorage.removeItem(CART_KEY);
  }, []);

  const ensureCart = useCallback(async () => {
    let id = localStorage.getItem(CART_KEY);
    if (id) {
      try {
        const fresh = await api.getCart(id);
        setCart(fresh);
        return fresh;
      } catch (err) {
        // Cart no existe en backend (404) o expiró: creamos uno nuevo.
        if (err?.status !== 404) console.warn('[cart] getCart falló, creando nuevo:', err.message);
        persistCartId(null);
      }
    }
    const created = await api.createCart();
    persistCartId(created.cart_id);
    setCart(created);
    return created;
  }, [persistCartId]);

  useEffect(() => {
    let cancelled = false;
    const id = localStorage.getItem(CART_KEY);
    if (!id) return () => { cancelled = true; };
    api.getCart(id)
      .then((fresh) => { if (!cancelled) setCart(fresh); })
      .catch(() => { if (!cancelled) persistCartId(null); });
    return () => { cancelled = true; };
  }, [persistCartId]);

  const refreshCart = useCallback(async () => {
    const id = cart?.cart_id || localStorage.getItem(CART_KEY);
    if (!id) return null;
    try {
      const fresh = await api.getCart(id);
      setCart(fresh);
      return fresh;
    } catch (err) {
      if (err?.status === 404) {
        persistCartId(null);
        setCart(null);
      }
      return null;
    }
  }, [cart, persistCartId]);

  const addItem = useCallback(async (productId, quantity = 1, notes) => {
    setLoading(true);
    try {
      const current = cart || await ensureCart();
      const updated = await api.addToCart(current.cart_id, productId, quantity, notes);
      setCart(updated);
      return updated;
    } finally {
      setLoading(false);
    }
  }, [cart, ensureCart]);

  const updateItem = useCallback(async (itemId, quantity) => {
    if (!cart?.cart_id) return null;
    setLoading(true);
    try {
      const updated = await api.updateCartItem(cart.cart_id, itemId, { quantity });
      setCart(updated);
      return updated;
    } finally {
      setLoading(false);
    }
  }, [cart]);

  const removeItem = useCallback(async (itemId) => {
    if (!cart?.cart_id) return null;
    setLoading(true);
    try {
      const updated = await api.removeCartItem(cart.cart_id, itemId);
      setCart(updated);
      return updated;
    } finally {
      setLoading(false);
    }
  }, [cart]);

  const clearCart = useCallback(async () => {
    if (!cart?.cart_id) return null;
    setLoading(true);
    try {
      const updated = await api.clearCart(cart.cart_id);
      setCart(updated);
      return updated;
    } finally {
      setLoading(false);
    }
  }, [cart]);

  const items = useMemo(() => cart?.items || [], [cart]);

  const total = useMemo(
    () => items.reduce((sum, it) => sum + (Number(it.subtotal) || 0), 0),
    [items]
  );

  const itemCount = useMemo(
    () => items.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0),
    [items]
  );

  return (
    <CartContext.Provider value={{
      cart,
      isOpen,
      setIsOpen,
      loading,
      total,
      itemCount,
      addItem,
      updateItem,
      removeItem,
      clearCart,
      refreshCart,
    }}>
      {children}
    </CartContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart debe usarse dentro de CartProvider');
  return ctx;
}
