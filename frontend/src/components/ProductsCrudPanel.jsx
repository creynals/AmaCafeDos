import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus, Pencil, Trash2, RotateCcw, RefreshCw, Loader2, X, Search,
  Package, AlertCircle, Boxes, Eye, EyeOff,
} from 'lucide-react';
import { api } from '../api';
import { useToast } from '../context/ToastContext';
import ProductImageGallery from './ProductImageGallery';

// ProductsCrudPanel — Ciclo 9 SYNAPTIC.
// Mantenedor individual de productos (CRUD) según gap C8:
//   crear / editar / eliminar (soft) / restaurar / ajuste rápido stock.
// Galería de imágenes (subida múltiple por producto) queda diferida —
// por ahora aprovecha el endpoint existente /admin/products/upload-image
// para subir 1 imagen y guardar el image_url resultante.

function formatPrice(price) {
  if (price === null || price === undefined) return '—';
  return `$${Number(price).toLocaleString('es-CL')}`;
}

function emptyForm() {
  return {
    id: null,
    name: '',
    description: '',
    category_id: '',
    price: '',
    stock: '0',
    available: 1,
    sort_order: '0',
    image_url: '',
    sku: '',
  };
}

export default function ProductsCrudPanel() {
  const toast = useToast();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCategoryId, setFilterCategoryId] = useState('');
  const [includeDeleted, setIncludeDeleted] = useState(false);

  const [editing, setEditing] = useState(null); // null | { ...form }
  const [stockTarget, setStockTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [list, cats] = await Promise.all([
        api.adminProductsList({
          include_deleted: includeDeleted ? 1 : undefined,
          category_id: filterCategoryId || undefined,
          search: search || undefined,
        }),
        api.adminProductCategories(),
      ]);
      setProducts(list);
      setCategories(cats);
    } catch (err) {
      toast.error(err.message || 'Error al cargar productos');
    } finally {
      setLoading(false);
    }
  }, [includeDeleted, filterCategoryId, search, toast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const stats = useMemo(() => {
    const active = products.filter((p) => !p.deleted_at);
    const lowStock = active.filter((p) => (p.stock ?? 0) <= 10).length;
    const outOfStock = active.filter((p) => (p.stock ?? 0) === 0).length;
    return {
      total: products.length,
      active: active.length,
      deleted: products.length - active.length,
      lowStock,
      outOfStock,
    };
  }, [products]);

  function openCreate() {
    setEditing(emptyForm());
  }

  function openEdit(p) {
    setEditing({
      id: p.id,
      name: p.name ?? '',
      description: p.description ?? '',
      category_id: String(p.category_id ?? ''),
      price: String(p.price ?? ''),
      stock: String(p.stock ?? 0),
      available: p.available ?? 1,
      sort_order: String(p.sort_order ?? 0),
      image_url: p.image_url ?? '',
      sku: p.sku ?? '',
    });
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatPill Icon={Boxes} label="Total" value={stats.total} />
        <StatPill Icon={Package} label="Activos" value={stats.active} tone="success" />
        <StatPill Icon={Trash2} label="Eliminados" value={stats.deleted} tone="muted" />
        <StatPill Icon={AlertCircle} label="Stock bajo (≤10)" value={stats.lowStock} tone="warn" />
        <StatPill Icon={AlertCircle} label="Sin stock" value={stats.outOfStock} tone="error" />
      </div>

      {/* Toolbar */}
      <div className="bg-ama-card border border-ama-border rounded-xl p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-ama-text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o SKU"
            className="w-full bg-ama-darker border border-ama-border rounded-lg pl-7 pr-2 py-1.5 text-sm text-ama-text focus:border-ama-amber/50 focus:outline-none"
          />
        </div>
        <select
          value={filterCategoryId}
          onChange={(e) => setFilterCategoryId(e.target.value)}
          className="bg-ama-darker border border-ama-border rounded-lg px-2 py-1.5 text-sm text-ama-text focus:border-ama-amber/50 focus:outline-none"
        >
          <option value="">Todas las categorías</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.display_name}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-ama-text-muted cursor-pointer select-none">
          <input
            type="checkbox"
            checked={includeDeleted}
            onChange={(e) => setIncludeDeleted(e.target.checked)}
            className="accent-ama-amber"
          />
          Incluir eliminados
        </label>
        <button
          onClick={loadAll}
          className="ml-auto p-1.5 text-ama-text-muted hover:text-ama-amber transition-colors cursor-pointer"
          title="Refrescar"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 bg-ama-amber text-ama-darker px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-ama-amber/90 transition-colors cursor-pointer"
        >
          <Plus size={14} /> Nuevo Producto
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={28} className="animate-spin text-ama-amber" />
        </div>
      ) : products.length === 0 ? (
        <div className="text-center py-16 text-ama-text-muted">
          <Package size={40} className="mx-auto mb-3 opacity-40" />
          <p>No hay productos {search || filterCategoryId ? 'que coincidan con los filtros' : ''}.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ama-text-muted border-b border-ama-border">
                <th className="pb-2 pr-3">Producto</th>
                <th className="pb-2 pr-3">SKU</th>
                <th className="pb-2 pr-3">Categoría</th>
                <th className="pb-2 pr-3 text-right">Precio</th>
                <th className="pb-2 pr-3 text-right">Stock</th>
                <th className="pb-2 pr-3 text-center">Estado</th>
                <th className="pb-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const isDeleted = !!p.deleted_at;
                return (
                  <tr key={p.id} className={`border-b border-ama-border/50 ${isDeleted ? 'opacity-50' : 'hover:bg-ama-card/50'}`}>
                    <td className="py-2.5 pr-3">
                      <div className="flex items-center gap-2">
                        {p.image_url ? (
                          <img src={p.image_url} alt="" className="w-9 h-9 rounded object-cover bg-ama-darker" />
                        ) : (
                          <div className="w-9 h-9 rounded bg-ama-darker flex items-center justify-center">
                            <Package size={14} className="text-ama-text-muted" />
                          </div>
                        )}
                        <div>
                          <div className="text-ama-text font-medium">{p.name}</div>
                          {p.description && (
                            <div className="text-xs text-ama-text-muted truncate max-w-[220px]">{p.description}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 pr-3 text-ama-text-muted text-xs">
                      {p.sku || <span className="opacity-50">—</span>}
                    </td>
                    <td className="py-2.5 pr-3 text-ama-text-muted">{p.category_display_name || p.category_name || '—'}</td>
                    <td className="py-2.5 pr-3 text-right text-ama-text">{formatPrice(p.price)}</td>
                    <td className="py-2.5 pr-3 text-right">
                      <button
                        onClick={() => !isDeleted && setStockTarget(p)}
                        disabled={isDeleted}
                        className={`font-medium ${
                          (p.stock ?? 0) === 0 ? 'text-red-400' :
                          (p.stock ?? 0) <= 10 ? 'text-yellow-400' : 'text-ama-text'
                        } ${!isDeleted ? 'hover:underline cursor-pointer' : 'cursor-not-allowed'}`}
                        title="Ajustar stock"
                      >
                        {p.stock ?? 0}
                      </button>
                    </td>
                    <td className="py-2.5 pr-3 text-center">
                      {isDeleted ? (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-red-500/20 text-red-400">Eliminado</span>
                      ) : p.available ? (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-ama-success/20 text-ama-success">Activo</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-ama-text-muted/20 text-ama-text-muted">Oculto</span>
                      )}
                    </td>
                    <td className="py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {isDeleted ? (
                          <button
                            onClick={async () => {
                              try {
                                await api.adminProductRestore(p.id);
                                toast.success(`Producto "${p.name}" restaurado`);
                                loadAll();
                              } catch (err) {
                                toast.error(err.message || 'Error al restaurar');
                              }
                            }}
                            className="p-1.5 text-ama-text-muted hover:text-ama-amber rounded transition-colors cursor-pointer"
                            title="Restaurar"
                          >
                            <RotateCcw size={15} />
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => openEdit(p)}
                              className="p-1.5 text-ama-text-muted hover:text-ama-amber rounded transition-colors cursor-pointer"
                              title="Editar"
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              onClick={() => setDeleteTarget(p)}
                              className="p-1.5 text-ama-text-muted hover:text-red-400 rounded transition-colors cursor-pointer"
                              title="Eliminar"
                            >
                              <Trash2 size={15} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      {editing && (
        <ProductFormModal
          form={editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            loadAll();
          }}
        />
      )}
      {stockTarget && (
        <StockAdjustModal
          product={stockTarget}
          onClose={() => setStockTarget(null)}
          onSaved={() => {
            setStockTarget(null);
            loadAll();
          }}
        />
      )}
      {deleteTarget && (
        <DeleteConfirmModal
          product={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirmed={() => {
            setDeleteTarget(null);
            loadAll();
          }}
        />
      )}
    </div>
  );
}

// eslint-disable-next-line no-unused-vars
function StatPill({ Icon, label, value, tone = 'default' }) {
  const tones = {
    default: 'bg-ama-darker border-ama-border text-ama-text',
    success: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300',
    warn: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-300',
    error: 'bg-red-500/10 border-red-500/30 text-red-300',
    muted: 'bg-ama-darker border-ama-border text-ama-text-muted',
  };
  return (
    <div className={`px-3 py-2 rounded-lg border ${tones[tone]} flex items-center gap-2`}>
      <Icon size={16} className="opacity-70" />
      <div>
        <div className="text-lg font-bold leading-tight">{value}</div>
        <div className="text-[10px] uppercase tracking-wide opacity-70">{label}</div>
      </div>
    </div>
  );
}

// ─── Modal: formulario crear/editar ──────────────────────────────────────────
function ProductFormModal({ form, categories, onClose, onSaved }) {
  const toast = useToast();
  const [data, setData] = useState(form);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const isEdit = data.id !== null;

  function update(field, value) {
    setData((d) => ({ ...d, [field]: value }));
  }

  async function handleImageUpload(file) {
    if (!file) return;
    setUploadingImage(true);
    try {
      const result = await api.adminUploadProductImage(file);
      update('image_url', result.url);
      toast.success('Imagen cargada');
    } catch (err) {
      toast.error(err.message || 'Error al subir imagen');
    } finally {
      setUploadingImage(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (saving) return;

    const errors = [];
    if (!data.name.trim()) errors.push('Nombre requerido');
    if (!data.category_id) errors.push('Categoría requerida');
    const priceNum = Number(data.price);
    if (!Number.isInteger(priceNum) || priceNum < 0) errors.push('Precio entero >= 0 requerido');
    const stockNum = data.stock === '' ? 0 : Number(data.stock);
    if (!Number.isInteger(stockNum) || stockNum < 0) errors.push('Stock entero >= 0 requerido');
    if (errors.length) {
      toast.error(errors.join(' · '));
      return;
    }

    const payload = {
      name: data.name.trim(),
      description: data.description.trim() || null,
      category_id: Number(data.category_id),
      price: priceNum,
      stock: stockNum,
      available: data.available ? 1 : 0,
      sort_order: data.sort_order === '' ? 0 : Number(data.sort_order),
      image_url: data.image_url.trim() || null,
      sku: data.sku.trim() || null,
    };

    setSaving(true);
    try {
      if (isEdit) {
        await api.adminProductUpdate(data.id, payload);
        toast.success('Producto actualizado');
      } else {
        await api.adminProductCreate(payload);
        toast.success('Producto creado');
      }
      onSaved();
    } catch (err) {
      const detail = err.data?.details ? ` — ${err.data.details.join(', ')}` : '';
      toast.error((err.message || 'Error al guardar') + detail);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title={isEdit ? `Editar producto #${data.id}` : 'Nuevo producto'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Nombre *">
            <input
              type="text"
              value={data.name}
              onChange={(e) => update('name', e.target.value)}
              className={inputCls}
              required
            />
          </Field>
          <Field label="SKU (opcional)">
            <input
              type="text"
              value={data.sku}
              onChange={(e) => update('sku', e.target.value)}
              className={inputCls}
              placeholder="Ej: CAFE-001"
            />
          </Field>
          <Field label="Categoría *">
            <select
              value={data.category_id}
              onChange={(e) => update('category_id', e.target.value)}
              className={inputCls}
              required
            >
              <option value="">— Seleccionar —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.display_name}</option>
              ))}
            </select>
          </Field>
          <Field label="Precio (CLP) *">
            <input
              type="number"
              min="0"
              step="1"
              value={data.price}
              onChange={(e) => update('price', e.target.value)}
              className={inputCls}
              required
            />
          </Field>
          <Field label="Stock">
            <input
              type="number"
              min="0"
              step="1"
              value={data.stock}
              onChange={(e) => update('stock', e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Orden de visualización">
            <input
              type="number"
              step="1"
              value={data.sort_order}
              onChange={(e) => update('sort_order', e.target.value)}
              className={inputCls}
            />
          </Field>
        </div>

        <Field label="Descripción">
          <textarea
            value={data.description}
            onChange={(e) => update('description', e.target.value)}
            rows={3}
            className={inputCls}
          />
        </Field>

        <Field label="Imagen principal (legacy / fallback)">
          <div className="flex items-center gap-3">
            {data.image_url ? (
              <img src={data.image_url} alt="" className="w-16 h-16 rounded-lg object-cover bg-ama-darker" />
            ) : (
              <div className="w-16 h-16 rounded-lg bg-ama-darker flex items-center justify-center">
                <Package size={20} className="text-ama-text-muted" />
              </div>
            )}
            <div className="flex-1 space-y-2">
              <input
                type="text"
                value={data.image_url}
                onChange={(e) => update('image_url', e.target.value)}
                placeholder="/static/products/imagen.jpg o URL externa"
                className={inputCls}
              />
              <label className="inline-flex items-center gap-2 text-xs text-ama-amber cursor-pointer hover:underline">
                {uploadingImage ? (
                  <><Loader2 size={12} className="animate-spin" /> Subiendo…</>
                ) : (
                  <>📤 Subir imagen local</>
                )}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={(e) => handleImageUpload(e.target.files?.[0])}
                  className="hidden"
                  disabled={uploadingImage}
                />
              </label>
              <p className="text-[10px] text-ama-text-muted leading-snug">
                Se usa como fallback cuando no hay galería. Al marcar una imagen como principal en la galería,
                este campo se sincroniza automáticamente.
              </p>
            </div>
          </div>
        </Field>

        <div className="border-t border-ama-border pt-4">
          <ProductImageGallery productId={isEdit ? data.id : null} />
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => update('available', data.available ? 0 : 1)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors cursor-pointer ${
              data.available
                ? 'bg-ama-success/10 border-ama-success/30 text-ama-success'
                : 'bg-ama-darker border-ama-border text-ama-text-muted'
            }`}
          >
            {data.available ? <Eye size={14} /> : <EyeOff size={14} />}
            {data.available ? 'Visible al público' : 'Oculto'}
          </button>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-ama-border">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-ama-text-muted hover:text-ama-text cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-ama-amber text-ama-darker text-sm font-medium hover:bg-ama-amber/90 disabled:opacity-50 cursor-pointer flex items-center gap-2"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {isEdit ? 'Guardar cambios' : 'Crear producto'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

// ─── Modal: ajuste rápido de stock ───────────────────────────────────────────
function StockAdjustModal({ product, onClose, onSaved }) {
  const toast = useToast();
  const [mode, setMode] = useState('absolute'); // 'absolute' | 'delta'
  const [value, setValue] = useState(String(product.stock ?? 0));
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (saving) return;
    const num = Number(value);
    if (!Number.isInteger(num)) {
      toast.error('Debe ser un entero');
      return;
    }
    const payload = mode === 'absolute' ? { stock: num } : { delta: num };
    if (reason.trim()) payload.reason = reason.trim();

    setSaving(true);
    try {
      await api.adminProductAdjustStock(product.id, payload);
      toast.success(`Stock de "${product.name}" actualizado`);
      onSaved();
    } catch (err) {
      toast.error(err.message || 'Error al ajustar stock');
    } finally {
      setSaving(false);
    }
  }

  const preview = (() => {
    const num = Number(value);
    if (!Number.isInteger(num)) return null;
    if (mode === 'absolute') return num;
    return (product.stock ?? 0) + num;
  })();

  return (
    <ModalShell title={`Ajustar stock — ${product.name}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-ama-darker rounded-lg p-3 text-sm">
          <span className="text-ama-text-muted">Stock actual: </span>
          <span className="text-ama-text font-bold">{product.stock ?? 0}</span>
        </div>

        <div className="flex items-center gap-2">
          {[
            { id: 'absolute', label: 'Establecer valor' },
            { id: 'delta', label: 'Sumar / restar' },
          ].map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              className={`flex-1 px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer ${
                mode === m.id
                  ? 'bg-ama-amber/20 text-ama-amber border border-ama-amber/30'
                  : 'bg-ama-darker text-ama-text-muted border border-ama-border hover:text-ama-text'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        <Field label={mode === 'absolute' ? 'Nuevo stock' : 'Delta (+/-)'}>
          <input
            type="number"
            step="1"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className={inputCls}
            autoFocus
          />
        </Field>

        {preview !== null && (
          <div className="text-xs text-ama-text-muted">
            Stock resultante: <span className={`font-bold ${preview < 0 ? 'text-red-400' : 'text-ama-text'}`}>{preview}</span>
            {preview < 0 && ' — el backend rechazará valores negativos'}
          </div>
        )}

        <Field label="Motivo (opcional)">
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ej: ajuste por inventario físico"
            className={inputCls}
          />
        </Field>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-ama-border">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-ama-text-muted hover:text-ama-text cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-ama-amber text-ama-darker text-sm font-medium hover:bg-ama-amber/90 disabled:opacity-50 cursor-pointer flex items-center gap-2"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Aplicar
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

// ─── Modal: confirmación de eliminación ──────────────────────────────────────
function DeleteConfirmModal({ product, onClose, onConfirmed }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleConfirm() {
    if (saving) return;
    setSaving(true);
    try {
      await api.adminProductDelete(product.id, reason.trim() || null);
      toast.success(`Producto "${product.name}" eliminado`);
      onConfirmed();
    } catch (err) {
      toast.error(err.message || 'Error al eliminar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title="Confirmar eliminación" onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
          <AlertCircle size={18} className="text-red-400 shrink-0 mt-0.5" />
          <div className="text-sm text-red-200">
            <p className="font-medium">¿Eliminar "{product.name}"?</p>
            <p className="text-xs text-red-300/80 mt-1">
              Es una eliminación lógica (soft-delete): el producto deja de aparecer en el catálogo pero queda preservado y se puede restaurar luego.
            </p>
          </div>
        </div>

        <Field label="Motivo (opcional)">
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ej: descontinuado"
            className={inputCls}
          />
        </Field>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-ama-border">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-ama-text-muted hover:text-ama-text cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 disabled:opacity-50 cursor-pointer flex items-center gap-2"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Eliminar
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

// ─── Shells & helpers ────────────────────────────────────────────────────────
function ModalShell({ title, onClose, children }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-ama-card border border-ama-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-3 border-b border-ama-border">
          <h3 className="text-base font-semibold text-ama-text">{title}</h3>
          <button onClick={onClose} className="text-ama-text-muted hover:text-ama-text cursor-pointer">
            <X size={18} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-wide text-ama-text-muted mb-1.5">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  'w-full bg-ama-darker border border-ama-border rounded-lg px-3 py-2 text-sm text-ama-text focus:border-ama-amber/50 focus:outline-none';
