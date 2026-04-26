import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Loader2, Star, Trash2, ArrowUp, ArrowDown, Image as ImageIcon, AlertCircle,
} from 'lucide-react';
import { api } from '../api';
import { useToast } from '../context/ToastContext';

// ProductImageGallery — Ciclo 10 SYNAPTIC.
// Gestor de múltiples imágenes por producto (productId requerido = solo edit mode).
// Acciones: subir, marcar primaria, reordenar (sube/baja), eliminar.
// El reordenamiento usa POST /reorder con array de imageIds en el orden deseado.

export default function ProductImageGallery({ productId }) {
  const toast = useToast();
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.adminProductImagesList(productId);
      setImages(list);
    } catch (err) {
      toast.error(err.message || 'Error al cargar imágenes');
    } finally {
      setLoading(false);
    }
  }, [productId, toast]);

  useEffect(() => {
    if (productId) load();
  }, [productId, load]);

  async function handleUpload(file) {
    if (!file) return;
    setUploading(true);
    try {
      await api.adminProductImageAdd(productId, file);
      toast.success('Imagen agregada');
      await load();
    } catch (err) {
      toast.error(err.message || 'Error al subir imagen');
    } finally {
      setUploading(false);
    }
  }

  async function handleMakePrimary(image) {
    if (image.is_primary) return;
    setBusyId(image.id);
    try {
      await api.adminProductImageUpdate(productId, image.id, { is_primary: true });
      toast.success('Imagen marcada como principal');
      await load();
    } catch (err) {
      toast.error(err.message || 'Error al marcar como principal');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(image) {
    if (!confirm('¿Eliminar esta imagen? También se borrará el archivo del servidor.')) return;
    setBusyId(image.id);
    try {
      await api.adminProductImageDelete(productId, image.id);
      toast.success('Imagen eliminada');
      await load();
    } catch (err) {
      toast.error(err.message || 'Error al eliminar imagen');
    } finally {
      setBusyId(null);
    }
  }

  async function handleMove(index, direction) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= images.length) return;
    const newOrder = [...images];
    const [moved] = newOrder.splice(index, 1);
    newOrder.splice(newIndex, 0, moved);
    setImages(newOrder); // optimistic
    try {
      await api.adminProductImagesReorder(productId, newOrder.map((i) => i.id));
    } catch (err) {
      toast.error(err.message || 'Error al reordenar');
      await load(); // revert
    }
  }

  if (!productId) {
    return (
      <div className="bg-ama-darker border border-ama-border rounded-lg p-4 text-sm text-ama-text-muted flex items-center gap-2">
        <AlertCircle size={14} className="text-yellow-400" />
        Guarda el producto primero para gestionar la galería de imágenes.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wide text-ama-text-muted">
          Galería ({images.length} {images.length === 1 ? 'imagen' : 'imágenes'})
        </div>
        <label className="inline-flex items-center gap-1.5 text-xs text-ama-amber cursor-pointer hover:underline">
          {uploading ? (
            <><Loader2 size={12} className="animate-spin" /> Subiendo…</>
          ) : (
            <><Plus size={12} /> Agregar imagen</>
          )}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={(e) => handleUpload(e.target.files?.[0])}
            className="hidden"
            disabled={uploading}
          />
        </label>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={20} className="animate-spin text-ama-amber" />
        </div>
      ) : images.length === 0 ? (
        <div className="text-center py-6 text-ama-text-muted bg-ama-darker rounded-lg border border-dashed border-ama-border">
          <ImageIcon size={24} className="mx-auto mb-1.5 opacity-40" />
          <p className="text-xs">Aún no hay imágenes en la galería.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {images.map((img, i) => (
            <li
              key={img.id}
              className={`flex items-center gap-3 p-2 rounded-lg border ${
                img.is_primary
                  ? 'bg-ama-amber/5 border-ama-amber/30'
                  : 'bg-ama-darker border-ama-border'
              }`}
            >
              <img
                src={img.url}
                alt={img.alt_text || ''}
                className="w-14 h-14 rounded-md object-cover bg-ama-card shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  {img.is_primary && (
                    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-ama-amber font-bold">
                      <Star size={10} fill="currentColor" /> Principal
                    </span>
                  )}
                  <span className="text-xs text-ama-text-muted truncate">{img.url}</span>
                </div>
                {img.alt_text && (
                  <div className="text-xs text-ama-text-muted truncate mt-0.5">{img.alt_text}</div>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => handleMove(i, -1)}
                  disabled={i === 0 || busyId === img.id}
                  className="p-1.5 text-ama-text-muted hover:text-ama-amber disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  title="Mover arriba"
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => handleMove(i, 1)}
                  disabled={i === images.length - 1 || busyId === img.id}
                  className="p-1.5 text-ama-text-muted hover:text-ama-amber disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  title="Mover abajo"
                >
                  <ArrowDown size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => handleMakePrimary(img)}
                  disabled={img.is_primary || busyId === img.id}
                  className={`p-1.5 rounded transition-colors cursor-pointer ${
                    img.is_primary
                      ? 'text-ama-amber cursor-default'
                      : 'text-ama-text-muted hover:text-ama-amber'
                  } disabled:cursor-not-allowed`}
                  title={img.is_primary ? 'Ya es principal' : 'Marcar como principal'}
                >
                  <Star size={14} fill={img.is_primary ? 'currentColor' : 'none'} />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(img)}
                  disabled={busyId === img.id}
                  className="p-1.5 text-ama-text-muted hover:text-red-400 rounded transition-colors cursor-pointer disabled:opacity-50"
                  title="Eliminar"
                >
                  {busyId === img.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
