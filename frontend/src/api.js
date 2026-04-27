const BASE = '/api';

function getAuthHeaders() {
  const token = localStorage.getItem('admin_token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

async function request(path, { auth = false } = {}) {
  const headers = auth ? getAuthHeaders() : {};
  const res = await fetch(`${BASE}${path}`, { headers });
  if (res.status === 401 && auth) {
    localStorage.removeItem('admin_token');
    window.dispatchEvent(new Event('auth-expired'));
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const err = new Error(data.error || `API error: ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return res.json();
}

async function post(path, body, { auth = false } = {}) {
  const headers = auth ? getAuthHeaders() : { 'Content-Type': 'application/json' };
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (res.status === 401 && auth) {
    localStorage.removeItem('admin_token');
    window.dispatchEvent(new Event('auth-expired'));
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const err = new Error(data.error || `API error: ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return res.json();
}

async function put(path, body, { auth = false } = {}) {
  const headers = auth ? getAuthHeaders() : { 'Content-Type': 'application/json' };
  const res = await fetch(`${BASE}${path}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  });
  if (res.status === 401 && auth) {
    localStorage.removeItem('admin_token');
    window.dispatchEvent(new Event('auth-expired'));
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const err = new Error(data.error || `API error: ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return res.json();
}

async function patch(path, body, { auth = false } = {}) {
  const headers = auth ? getAuthHeaders() : { 'Content-Type': 'application/json' };
  const res = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  });
  if (res.status === 401 && auth) {
    localStorage.removeItem('admin_token');
    window.dispatchEvent(new Event('auth-expired'));
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const err = new Error(data.error || `API error: ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return res.json();
}

async function del(path, { auth = false } = {}) {
  const headers = auth ? getAuthHeaders() : {};
  const res = await fetch(`${BASE}${path}`, { method: 'DELETE', headers });
  if (res.status === 401 && auth) {
    localStorage.removeItem('admin_token');
    window.dispatchEvent(new Event('auth-expired'));
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const err = new Error(data.error || `API error: ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return res.json();
}

export const api = {
  getMenu: () => request('/menu'),
  getCategories: () => request('/categories'),
  getProducts: (params) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/products${qs ? '?' + qs : ''}`);
  },
  getProduct: (id) => request(`/products/${id}`),

  createCart: () => post('/cart'),
  getCart: (id) => request(`/cart/${id}`),
  addToCart: (cartId, productId, quantity = 1, notes) =>
    post(`/cart/${cartId}/items`, { product_id: productId, quantity, notes }),
  updateCartItem: (cartId, itemId, data) =>
    put(`/cart/${cartId}/items/${itemId}`, data),
  removeCartItem: (cartId, itemId) =>
    del(`/cart/${cartId}/items/${itemId}`),
  clearCart: (cartId) => del(`/cart/${cartId}`),

  createOrder: (cartId, contact, address, paymentMethod, customerInstructions = null) =>
    post('/orders', {
      cart_id: cartId,
      contact,
      address,
      payment_method: paymentMethod,
      customer_instructions: customerInstructions,
    }),
  getOrder: (id) => request(`/orders/${id}`),
  // Ciclo 56: sincronización activa de payment_status desde SumUp
  // (no depende del webhook). Usado por CheckoutModal tras widget success.
  syncOrderPayment: (id) => post(`/orders/${id}/sync-payment`, {}),

  // Ciclo 86: resultado público para la página /checkout/success a la que
  // SumUp redirige post-pago. Identificado por checkout_id (sin PII).
  getSumupResult: (checkoutId) =>
    request(`/payments/sumup/result?checkout_id=${encodeURIComponent(checkoutId)}`),

  sendMessage: async (message, cartId, history, recaptchaToken) => {
    const res = await fetch(`${BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, cart_id: cartId, history, recaptcha_token: recaptchaToken }),
    });
    const data = await res.json();
    if (!res.ok) {
      const err = new Error(data.reply || data.error || `API error: ${res.status}`);
      err.reply = data.reply;
      throw err;
    }
    return data;
  },

  // Auth endpoints (public)
  authCaptcha: () => request('/auth/captcha'),
  authLogin: (username, password, captcha_id, captcha_answer) =>
    post('/auth/login', { username, password, captcha_id, captcha_answer }),
  authLogout: (token) => {
    return fetch(`${BASE}/auth/logout`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
    }).then(r => r.json());
  },
  authCheck: (token) => {
    return fetch(`${BASE}/auth/check`, {
      headers: { 'Authorization': `Bearer ${token}` },
    }).then(r => r.json());
  },

  // Admin endpoints (authenticated)
  adminDashboard: (dateRange) => {
    const qs = dateRange?.from ? `?from=${dateRange.from}${dateRange.to ? '&to=' + dateRange.to : ''}` : '';
    return request(`/admin/dashboard${qs}`, { auth: true });
  },
  adminInventory: (dateRange) => {
    const qs = dateRange?.from ? `?from=${dateRange.from}${dateRange.to ? '&to=' + dateRange.to : ''}` : '';
    return request(`/admin/inventory${qs}`, { auth: true });
  },
  adminBestSellers: (dateRange) => {
    const qs = dateRange?.from ? `?from=${dateRange.from}${dateRange.to ? '&to=' + dateRange.to : ''}` : '';
    return request(`/admin/best-sellers${qs}`, { auth: true });
  },
  adminMarginAnalysis: (dateRange) => {
    const qs = dateRange?.from ? `?from=${dateRange.from}${dateRange.to ? '&to=' + dateRange.to : ''}` : '';
    return request(`/admin/margin-analysis${qs}`, { auth: true });
  },
  adminOrdersHistory: (limit) => request(`/admin/orders-history${limit ? '?limit=' + limit : ''}`, { auth: true }),

  // Ciclo 99/100 — Admin orders search + status mutation
  adminOrders: (params = {}) => {
    const clean = {};
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') clean[k] = v;
    });
    const qs = new URLSearchParams(clean).toString();
    return request(`/admin/orders${qs ? '?' + qs : ''}`, { auth: true });
  },
  adminOrderUpdateStatus: (id, status, reason) =>
    patch(`/admin/orders/${id}/status`, { status, reason }, { auth: true }),

  adminChat: (message, history) => post('/admin/chat', { message, history }, { auth: true }),
  adminCustomers: (dateRange) => {
    const qs = dateRange?.from ? `?from=${dateRange.from}${dateRange.to ? '&to=' + dateRange.to : ''}` : '';
    return request(`/admin/customers${qs}`, { auth: true });
  },
  adminCustomerDetail: (id) => request(`/admin/customers/${id}`, { auth: true }),
  adminCustomersSummary: (dateRange) => {
    const qs = dateRange?.from ? `?from=${dateRange.from}${dateRange.to ? '&to=' + dateRange.to : ''}` : '';
    return request(`/admin/customers-summary${qs}`, { auth: true });
  },

  // User management (authenticated)
  getUsers: () => request('/admin/users', { auth: true }),
  createUser: (data) => post('/admin/users', data, { auth: true }),
  updateUser: (id, data) => put(`/admin/users/${id}`, data, { auth: true }),
  changePassword: (id, data) => put(`/admin/users/${id}/password`, data, { auth: true }),
  deleteUser: (id) => del(`/admin/users/${id}`, { auth: true }),

  // Settings (authenticated)
  getRecaptchaConfig: () => request('/settings/recaptcha-config'),
  getRecaptchaStatus: () => request('/admin/settings/recaptcha', { auth: true }),
  saveRecaptcha: (site_key, secret_key, enabled) =>
    post('/admin/settings/recaptcha', { site_key, secret_key, enabled }, { auth: true }),
  deleteRecaptcha: () => del('/admin/settings/recaptcha', { auth: true }),

  aiStatus: () => request('/admin/settings/ai-status', { auth: true }),
  saveApiKey: (api_key) => post('/admin/settings/api-key', { api_key }, { auth: true }),
  deleteApiKey: () => del('/admin/settings/api-key', { auth: true }),
  getAvailableModels: () => request('/admin/settings/models', { auth: true }),
  saveModel: (agent, model) => post('/admin/settings/model', { agent, model }, { auth: true }),

  // SumUp configuration (authenticated) — Ciclo 15 (L2 coherence completa)
  getSumupStatus: () => request('/admin/settings/sumup', { auth: true }),
  saveSumup: (payload) => post('/admin/settings/sumup', payload, { auth: true }),
  deleteSumup: () => del('/admin/settings/sumup', { auth: true }),

  // CRUD individual de productos — Ciclo 9 SYNAPTIC (admin maintainer)
  adminProductsList: (params = {}) => {
    const clean = {};
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') clean[k] = v;
    });
    const qs = new URLSearchParams(clean).toString();
    return request(`/admin/products/list${qs ? '?' + qs : ''}`, { auth: true });
  },
  adminProductGet: (id) => request(`/admin/products/${id}`, { auth: true }),
  adminProductCreate: (data) => post('/admin/products', data, { auth: true }),
  adminProductUpdate: (id, data) => put(`/admin/products/${id}`, data, { auth: true }),
  adminProductDelete: (id, reason) => {
    const token = localStorage.getItem('admin_token');
    return fetch(`${BASE}/admin/products/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ reason: reason || null }),
    }).then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        localStorage.removeItem('admin_token');
        window.dispatchEvent(new Event('auth-expired'));
      }
      if (!res.ok) {
        const err = new Error(data.error || `API error: ${res.status}`);
        err.status = res.status;
        err.data = data;
        throw err;
      }
      return data;
    });
  },
  adminProductRestore: (id) => post(`/admin/products/${id}/restore`, {}, { auth: true }),
  adminProductAdjustStock: (id, payload) => patch(`/admin/products/${id}/stock`, payload, { auth: true }),

  // Galería multi-imagen por producto — Ciclo 10 SYNAPTIC
  adminProductImagesList: (productId) =>
    request(`/admin/products/${productId}/images`, { auth: true }),
  adminProductImageAdd: async (productId, file, { isPrimary = false, altText = null } = {}) => {
    const token = localStorage.getItem('admin_token');
    const fd = new FormData();
    fd.append('image', file);
    if (isPrimary) fd.append('is_primary', '1');
    if (altText) fd.append('alt_text', altText);
    const res = await fetch(`${BASE}/admin/products/${productId}/images`, {
      method: 'POST',
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      body: fd,
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      localStorage.removeItem('admin_token');
      window.dispatchEvent(new Event('auth-expired'));
    }
    if (!res.ok) {
      const err = new Error(data.error || `API error: ${res.status}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  },
  adminProductImageUpdate: (productId, imageId, payload) =>
    put(`/admin/products/${productId}/images/${imageId}`, payload, { auth: true }),
  adminProductImagesReorder: (productId, order) =>
    post(`/admin/products/${productId}/images/reorder`, { order }, { auth: true }),
  adminProductImageDelete: (productId, imageId) =>
    del(`/admin/products/${productId}/images/${imageId}`, { auth: true }),

  // Bulk import de productos — Ciclo 3 SYNAPTIC (admin)
  adminProductCategories: () => request('/admin/products/categories', { auth: true }),

  adminBulkTemplateUrl: () => `${BASE}/admin/products/bulk-template`,

  adminBulkImport: async (file, { dryRun = false } = {}) => {
    const token = localStorage.getItem('admin_token');
    const fd = new FormData();
    fd.append('file', file);
    const qs = dryRun ? '?dry_run=1' : '';
    const res = await fetch(`${BASE}/admin/products/bulk-import${qs}`, {
      method: 'POST',
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      body: fd,
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      localStorage.removeItem('admin_token');
      window.dispatchEvent(new Event('auth-expired'));
    }
    if (!res.ok && res.status !== 422) {
      const err = new Error(data.error || `API error: ${res.status}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    // 422 → respuesta de validación con errores fila-por-fila (no es throw)
    return { ok: res.ok, status: res.status, data };
  },

  adminUploadProductImage: async (file) => {
    const token = localStorage.getItem('admin_token');
    const fd = new FormData();
    fd.append('image', file);
    const res = await fetch(`${BASE}/admin/products/upload-image`, {
      method: 'POST',
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      body: fd,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || `API error: ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return data;
  },
};
