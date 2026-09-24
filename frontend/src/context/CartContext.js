import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';
const STORAGE_KEY = 'maja_cart_v1';

const CartContext = createContext(null);

export const CartProvider = ({ children }) => {
  const [items, setItems] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch (_e) { return []; }
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch (_e) {}
  }, [items]);

  // Add a design to the cart. Fetches its ₹ price if not supplied.
  const add = useCallback(async (item) => {
    let price = item.price_inr;
    if (price == null) {
      try {
        const { data } = await axios.get(`${API_URL}/api/store/design/${item.design_id}/price`);
        price = data?.price_inr;
      } catch (_e) { price = null; }
    }
    setItems((prev) => {
      if (prev.some((i) => i.design_id === item.design_id)) return prev;
      return [...prev, { ...item, price_inr: price }];
    });
    return price;
  }, []);

  const remove = useCallback((design_id) => {
    setItems((prev) => prev.filter((i) => i.design_id !== design_id));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const total = items.reduce((s, i) => s + (Number(i.price_inr) || 0), 0);
  const count = items.length;

  return (
    <CartContext.Provider value={{ items, add, remove, clear, total, count }}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
};
