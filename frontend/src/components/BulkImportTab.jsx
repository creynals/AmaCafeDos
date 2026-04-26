import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Upload, Download, FileSpreadsheet, CheckCircle, AlertCircle, Loader2,
  Image as ImageIcon, Tag, Trash2, RefreshCw,
} from 'lucide-react';
import { api } from '../api';

// BulkImportTab — Ciclo 3 SYNAPTIC.
// Tab nuevo (separado de "Gestión Productos") para importación masiva de
// productos vía Excel. Decisiones aplicadas:
//   - SKU opcional para productos nuevos
//   - Categorías solo existentes
//   - Imágenes en local (subida directa al backend → /static/products/...)
//   - action=delete soporta eliminación lógica
//   - Plantilla Excel descargable
//   - Solo admin autenticado (la ruta hereda requireAuth)

function StatPill({ label, value, tone = 'default' }) {
  const tones = {
    default: 'bg-ama-darker border-ama-border text-ama-text',
    success: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300',
    error: 'bg-red-500/10 border-red-500/30 text-red-300',
    info: 'bg-ama-amber/10 border-ama-amber/30 text-ama-amber',
  };
  return (
    <div className={`px-3 py-2 rounded-lg border ${tones[tone]} text-center`}>
      <div className="text-xl font-bold">{value}</div>
      <div className="text-[11px] uppercase tracking-wide opacity-70">{label}</div>
    </div>
  );
}

function CategoriesPanel({ categories, loading, onReload }) {
  return (
    <div className="bg-ama-card border border-ama-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Tag size={16} className="text-ama-amber" />
          <h3 className="text-sm font-semibold text-ama-text">Categorías existentes</h3>
        </div>
        <button
          onClick={onReload}
          disabled={loading}
          className="text-xs text-ama-text-muted hover:text-ama-amber flex items-center gap-1 cursor-pointer disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Recargar
        </button>
      </div>
      <p className="text-xs text-ama-text-muted mb-2">
        Solo se permiten estas categorías en la importación. No se auto-crean.
      </p>
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-ama-text-muted">
          <Loader2 size={12} className="animate-spin" /> Cargando...
        </div>
      ) : categories.length === 0 ? (
        <div className="text-xs text-red-300">No hay categorías. Crea al menos una antes de importar.</div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {categories.map(c => (
            <span
              key={c.id}
              className="px-2 py-0.5 text-[11px] rounded-md bg-ama-darker border border-ama-border text-ama-text"
              title={c.display_name}
            >
              <code className="text-ama-amber">{c.name}</code>
              <span className="text-ama-text-muted ml-1">· {c.display_name}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ImageUploader() {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  const onPick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setError(null); setResult(null);
    try {
      const data = await api.adminUploadProductImage(file);
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const copyUrl = () => {
    if (result?.url) {
      navigator.clipboard.writeText(result.url);
    }
  };

  return (
    <div className="bg-ama-card border border-ama-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <ImageIcon size={16} className="text-ama-amber" />
        <h3 className="text-sm font-semibold text-ama-text">Subir imagen</h3>
      </div>
      <p className="text-xs text-ama-text-muted mb-3">
        Sube una imagen y copia la URL para usarla en la columna <code className="text-ama-amber">image_url</code> del Excel.
      </p>
      <input
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp,.gif"
        onChange={onPick}
        disabled={uploading}
        className="block w-full text-xs text-ama-text-muted file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-ama-amber file:text-ama-darker file:font-medium file:cursor-pointer file:hover:bg-ama-amber/80 cursor-pointer"
      />
      {uploading && (
        <div className="mt-3 flex items-center gap-2 text-xs text-ama-text-muted">
          <Loader2 size={12} className="animate-spin" /> Subiendo...
        </div>
      )}
      {error && (
        <div className="mt-3 text-xs text-red-300 flex items-start gap-1.5">
          <AlertCircle size={12} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {result && (
        <div className="mt-3 p-2 bg-ama-darker border border-ama-border rounded-lg">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle size={12} className="text-emerald-400" />
            <span className="text-xs text-emerald-300">Imagen subida</span>
          </div>
          <div className="flex items-center gap-2">
            <code className="text-[11px] text-ama-amber bg-ama-card px-2 py-1 rounded flex-1 truncate">
              {result.url}
            </code>
            <button
              onClick={copyUrl}
              className="text-[11px] px-2 py-1 bg-ama-amber/20 text-ama-amber rounded border border-ama-amber/30 hover:bg-ama-amber/30 cursor-pointer"
            >
              Copiar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ResultsPanel({ result, dryRun }) {
  if (!result) return null;
  const hasErrors = result.errors && result.errors.length > 0;

  return (
    <div className={`bg-ama-card border rounded-xl p-4 ${hasErrors ? 'border-red-500/30' : 'border-emerald-500/30'}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {hasErrors
            ? <AlertCircle size={16} className="text-red-400" />
            : <CheckCircle size={16} className="text-emerald-400" />}
          <h3 className="text-sm font-semibold text-ama-text">
            {hasErrors
              ? 'Validación falló — ningún cambio aplicado'
              : dryRun
                ? 'Validación exitosa (dry-run, sin cambios)'
                : 'Importación completada'}
          </h3>
        </div>
        {result.batch_id && (
          <code className="text-[10px] text-ama-text-muted">{result.batch_id}</code>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3">
        <StatPill label="Filas" value={result.total_rows ?? 0} />
        <StatPill label="Procesadas" value={result.processed ?? 0} tone="info" />
        <StatPill label="Creadas" value={result.created ?? 0} tone={result.created ? 'success' : 'default'} />
        <StatPill label="Actualizadas" value={result.updated ?? 0} tone={result.updated ? 'success' : 'default'} />
        <StatPill label="Eliminadas" value={result.deleted ?? 0} tone={result.deleted ? 'error' : 'default'} />
      </div>

      {hasErrors && (
        <div className="bg-ama-darker border border-red-500/20 rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-red-500/10 border-b border-red-500/20">
            <span className="text-xs font-medium text-red-300">
              {result.errors.length} fila(s) con errores
            </span>
          </div>
          <div className="max-h-72 overflow-y-auto divide-y divide-ama-border">
            {result.errors.map((e, i) => (
              <div key={i} className="px-3 py-2 text-xs">
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 font-mono text-[10px]">
                    Fila {e.row}
                  </span>
                </div>
                <ul className="list-disc list-inside text-ama-text-muted space-y-0.5">
                  {e.errors.map((msg, j) => <li key={j}>{msg}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function BulkImportTab() {
  const [categories, setCategories] = useState([]);
  const [loadingCats, setLoadingCats] = useState(true);
  const [file, setFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [resultDryRun, setResultDryRun] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  const loadCategories = useCallback(async () => {
    setLoadingCats(true);
    try {
      const cats = await api.adminProductCategories();
      setCategories(cats);
    } catch (err) {
      console.error('Error loading categories:', err);
    } finally {
      setLoadingCats(false);
    }
  }, []);

  useEffect(() => { loadCategories(); }, [loadCategories]);

  const downloadTemplate = () => {
    const token = localStorage.getItem('admin_token');
    fetch(api.adminBulkTemplateUrl(), {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
    })
      .then(r => {
        if (!r.ok) throw new Error('No se pudo descargar la plantilla');
        return r.blob();
      })
      .then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'plantilla-productos.xlsx';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      })
      .catch(err => setError(err.message));
  };

  const onPickFile = (e) => {
    const f = e.target.files?.[0];
    setFile(f || null);
    setResult(null);
    setError(null);
  };

  const runImport = async (dryRun) => {
    if (!file) return;
    setImporting(true);
    setError(null);
    setResult(null);
    setResultDryRun(dryRun);
    try {
      const { data } = await api.adminBulkImport(file, { dryRun });
      setResult(data);
      if (!dryRun && data.success) {
        // Si el import real fue exitoso, limpiamos archivo para evitar reimport accidental
        setFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-ama-text flex items-center gap-2">
          <FileSpreadsheet size={20} className="text-ama-amber" />
          Importación Masiva
        </h2>
        <p className="text-xs text-ama-text-muted mt-1">
          Crea, actualiza o elimina productos en lote desde una plantilla Excel.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <CategoriesPanel
          categories={categories}
          loading={loadingCats}
          onReload={loadCategories}
        />
        <ImageUploader />
      </div>

      {/* Acciones principales */}
      <div className="bg-ama-card border border-ama-border rounded-xl p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Upload size={16} className="text-ama-amber" />
          <h3 className="text-sm font-semibold text-ama-text">Importar productos</h3>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={downloadTemplate}
            className="px-3 py-1.5 text-xs bg-ama-darker border border-ama-border rounded-lg text-ama-text hover:border-ama-amber/50 flex items-center gap-1.5 cursor-pointer"
          >
            <Download size={14} />
            Descargar plantilla
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={onPickFile}
            disabled={importing}
            className="text-xs text-ama-text-muted file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-ama-amber file:text-ama-darker file:font-medium file:cursor-pointer file:hover:bg-ama-amber/80"
          />
        </div>

        {file && (
          <div className="p-2 bg-ama-darker border border-ama-border rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-ama-text">
              <FileSpreadsheet size={14} className="text-ama-amber" />
              <span>{file.name}</span>
              <span className="text-ama-text-muted">({(file.size / 1024).toFixed(1)} KB)</span>
            </div>
            <button
              onClick={() => {
                setFile(null);
                setResult(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
              className="text-ama-text-muted hover:text-red-400 cursor-pointer"
              title="Quitar archivo"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => runImport(true)}
            disabled={!file || importing}
            className="px-4 py-2 text-xs bg-ama-darker border border-ama-border rounded-lg text-ama-text hover:border-ama-amber/50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
          >
            {importing && resultDryRun
              ? <Loader2 size={14} className="animate-spin" />
              : <CheckCircle size={14} />}
            Validar (dry-run)
          </button>
          <button
            onClick={() => runImport(false)}
            disabled={!file || importing}
            className="px-4 py-2 text-xs bg-ama-amber text-ama-darker font-medium rounded-lg hover:bg-ama-amber/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
          >
            {importing && !resultDryRun
              ? <Loader2 size={14} className="animate-spin" />
              : <Upload size={14} />}
            Aplicar importación
          </button>
        </div>

        <p className="text-[11px] text-ama-text-muted">
          Tip: ejecuta primero la validación (dry-run) para ver errores antes de aplicar.
          La importación completa es transaccional: si una fila falla, ningún cambio se aplica.
        </p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex items-start gap-2">
          <AlertCircle size={16} className="text-red-400 mt-0.5 shrink-0" />
          <span className="text-sm text-red-300">{error}</span>
        </div>
      )}

      <ResultsPanel result={result} dryRun={resultDryRun} />
    </div>
  );
}
