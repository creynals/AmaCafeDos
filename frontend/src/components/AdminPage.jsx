import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Package, TrendingUp, DollarSign, ShoppingBag, MessageCircle, Send, Loader2, BarChart3, RefreshCw, Users, UserCheck, Crown, ChevronLeft, Star, Calendar, Mail, Phone, CalendarRange, Settings, Key, Shield, Trash2, CheckCircle, AlertCircle, ChevronDown, Cpu, Zap, Lock, Eye, EyeOff, LogOut, UserCog, CreditCard, Globe, ClipboardList, FileSpreadsheet } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import UsersTab from './UsersTab';
import OrdersTab from './OrdersTab';
import BulkImportTab from './BulkImportTab';
import ProductsCrudPanel from './ProductsCrudPanel';

const TABS = [
  { id: 'products-parent', label: 'Productos', icon: Package },
  { id: 'orders', label: 'Órdenes', icon: ClipboardList },
  { id: 'customers', label: 'Clientes', icon: Users },
  { id: 'insights', label: 'Chat AI Insights', icon: MessageCircle },
  { id: 'settings', label: 'Configuración', icon: Settings },
  { id: 'users', label: 'Usuarios', icon: UserCog },
];

const PRODUCTS_SUBTABS = [
  { id: 'crud', label: 'Mantenedor Productos', icon: Package, description: 'Gestión CRUD de productos individuales (crear, editar, stock, galería)' },
  { id: 'analytics', label: 'Análisis Productos', icon: BarChart3, description: 'Métricas de ventas, top productos y tendencias' },
  { id: 'bulk-import', label: 'Importación Masiva', icon: FileSpreadsheet, description: 'Carga masiva de productos vía Excel (alta, edición, eliminación)' },
];

const WELCOME_MESSAGE = {
  role: 'assistant',
  content: '¡Hola! Soy tu asistente de inteligencia de negocios para AMA Café. Puedo ayudarte con:\n\n• Análisis de productos más vendidos\n• Tendencias de ventas por período\n• Ideas para campañas y promociones\n• Insights sobre márgenes y rentabilidad\n\n¿Qué te gustaría saber?',
};

function formatPrice(price) {
  return `$${price.toLocaleString('es-CL')}`;
}

function StatCard({ icon: Icon, label, value, sub }) {
  return (
    <div className="bg-ama-card border border-ama-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon size={16} className="text-ama-amber" />
        <span className="text-xs text-ama-text-muted">{label}</span>
      </div>
      <p className="text-xl font-bold text-ama-text">{value}</p>
      {sub && <p className="text-xs text-ama-text-muted mt-1">{sub}</p>}
    </div>
  );
}

function getPresetRange(preset) {
  const today = new Date();
  const to = today.toISOString().split('T')[0];
  let from;
  if (preset === 'week') {
    const d = new Date(today);
    d.setDate(d.getDate() - 7);
    from = d.toISOString().split('T')[0];
  } else if (preset === 'month') {
    const d = new Date(today);
    d.setMonth(d.getMonth() - 1);
    from = d.toISOString().split('T')[0];
  } else if (preset === 'quarter') {
    const d = new Date(today);
    d.setMonth(d.getMonth() - 3);
    from = d.toISOString().split('T')[0];
  } else {
    return { from: '', to: '' };
  }
  return { from, to };
}

function DateRangePicker({ dateRange, onChange }) {
  const [showPresets, setShowPresets] = useState(false);
  const activePreset = (() => {
    if (!dateRange.from) return 'all';
    const today = new Date().toISOString().split('T')[0];
    if (dateRange.to !== today) return null;
    for (const p of ['week', 'month', 'quarter']) {
      const r = getPresetRange(p);
      if (r.from === dateRange.from) return p;
    }
    return null;
  })();

  return (
    <div className="bg-ama-card border border-ama-border rounded-xl p-3 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <CalendarRange size={16} className="text-ama-amber shrink-0" />
        <span className="text-xs text-ama-text-muted font-medium">Período:</span>
        {[
          { id: 'week', label: '7 días' },
          { id: 'month', label: '30 días' },
          { id: 'quarter', label: '3 meses' },
          { id: 'all', label: 'Todo' },
        ].map(p => (
          <button
            key={p.id}
            onClick={() => onChange(getPresetRange(p.id))}
            className={`px-2.5 py-1 text-xs rounded-lg transition-colors cursor-pointer ${
              activePreset === p.id
                ? 'bg-ama-amber/20 text-ama-amber border border-ama-amber/30'
                : 'text-ama-text-muted hover:text-ama-text bg-ama-darker border border-ama-border'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-ama-text-muted">Desde:</span>
        <input
          type="date"
          value={dateRange.from}
          onChange={e => onChange({ ...dateRange, from: e.target.value })}
          className="bg-ama-darker border border-ama-border rounded-lg px-2.5 py-1 text-xs text-ama-text focus:border-ama-amber/50 focus:outline-none"
        />
        <span className="text-xs text-ama-text-muted">Hasta:</span>
        <input
          type="date"
          value={dateRange.to}
          onChange={e => onChange({ ...dateRange, to: e.target.value })}
          className="bg-ama-darker border border-ama-border rounded-lg px-2.5 py-1 text-xs text-ama-text focus:border-ama-amber/50 focus:outline-none"
        />
        {dateRange.from && (
          <button
            onClick={() => onChange({ from: '', to: '' })}
            className="text-xs text-ama-text-muted hover:text-red-400 transition-colors cursor-pointer ml-1"
          >
            Limpiar
          </button>
        )}
      </div>
    </div>
  );
}

function ProductsTab() {
  const [dashboard, setDashboard] = useState(null);
  const [inventory, setInventory] = useState([]);
  const [bestSellers, setBestSellers] = useState([]);
  const [margins, setMargins] = useState([]);
  const [view, setView] = useState('inventory');
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const dr = dateRange.from ? dateRange : undefined;
      const [dash, inv, best, marg] = await Promise.all([
        api.adminDashboard(dr),
        api.adminInventory(dr),
        api.adminBestSellers(dr),
        api.adminMarginAnalysis(dr),
      ]);
      setDashboard(dash);
      setInventory(inv);
      setBestSellers(best);
      setMargins(marg);
    } catch (err) {
      console.error('Error loading admin data:', err);
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-ama-amber" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      {dashboard && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={Package} label="Productos" value={dashboard.active_products} sub={`${dashboard.total_products} total`} />
          <StatCard icon={ShoppingBag} label="Pedidos" value={dashboard.total_orders} />
          <StatCard icon={DollarSign} label="Ingresos" value={formatPrice(dashboard.total_revenue)} />
          <StatCard icon={TrendingUp} label="Ticket Promedio" value={formatPrice(dashboard.avg_order_value)} />
        </div>
      )}

      {/* Date Range Picker */}
      <DateRangePicker dateRange={dateRange} onChange={setDateRange} />

      {/* Sub-nav */}
      <div className="flex items-center gap-2 border-b border-ama-border pb-2">
        {[
          { id: 'inventory', label: 'Inventario' },
          { id: 'bestsellers', label: 'Más Vendidos' },
          { id: 'margins', label: 'Margen' },
        ].map(v => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors cursor-pointer ${
              view === v.id
                ? 'bg-ama-amber text-ama-darker font-medium'
                : 'text-ama-text-muted hover:text-ama-text hover:bg-ama-card'
            }`}
          >
            {v.label}
          </button>
        ))}
        <button onClick={loadData} className="ml-auto p-1.5 text-ama-text-muted hover:text-ama-amber transition-colors cursor-pointer" title="Refrescar">
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Inventory Table */}
      {view === 'inventory' && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ama-text-muted border-b border-ama-border">
                <th className="pb-2 pr-4">Producto</th>
                <th className="pb-2 pr-4">Categoría</th>
                <th className="pb-2 pr-4 text-right">Precio</th>
                <th className="pb-2 pr-4 text-right">Stock</th>
                <th className="pb-2 pr-4 text-right">Vendidos</th>
                <th className="pb-2 pr-4 text-right">Ingresos</th>
                <th className="pb-2 text-center">Estado</th>
              </tr>
            </thead>
            <tbody>
              {inventory.map(p => (
                <tr key={p.id} className="border-b border-ama-border/50 hover:bg-ama-card/50">
                  <td className="py-2.5 pr-4">
                    <div className="flex items-center gap-2">
                      {p.image_url && (
                        <img src={p.image_url} alt="" className="w-8 h-8 rounded object-cover" />
                      )}
                      <span className="text-ama-text">{p.name}</span>
                    </div>
                  </td>
                  <td className="py-2.5 pr-4 text-ama-text-muted">{p.category}</td>
                  <td className="py-2.5 pr-4 text-right text-ama-text">{formatPrice(p.price)}</td>
                  <td className="py-2.5 pr-4 text-right">
                    <span className={`font-medium ${p.stock <= 10 ? 'text-red-400' : p.stock <= 30 ? 'text-yellow-400' : 'text-ama-text'}`}>
                      {p.stock}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 text-right text-ama-text">{p.total_sold}</td>
                  <td className="py-2.5 pr-4 text-right text-ama-amber font-medium">{formatPrice(p.total_revenue)}</td>
                  <td className="py-2.5 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${p.available ? 'bg-ama-success/20 text-ama-success' : 'bg-red-500/20 text-red-400'}`}>
                      {p.available ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Best Sellers */}
      {view === 'bestsellers' && (
        <div>
          {bestSellers.length === 0 ? (
            <div className="text-center py-12 text-ama-text-muted">
              <BarChart3 size={40} className="mx-auto mb-3 opacity-40" />
              <p>No hay datos de ventas para este período</p>
            </div>
          ) : (
            <div className="space-y-2">
              {bestSellers.map((p, i) => {
                const maxSold = bestSellers[0]?.total_sold || 1;
                const pct = (p.total_sold / maxSold) * 100;
                return (
                  <div key={p.id} className="bg-ama-card border border-ama-border rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-ama-amber font-bold text-sm w-6">#{i + 1}</span>
                        {p.image_url && <img src={p.image_url} alt="" className="w-8 h-8 rounded object-cover" />}
                        <div>
                          <p className="text-sm font-medium text-ama-text">{p.name}</p>
                          <p className="text-xs text-ama-text-muted">{p.category}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-ama-amber">{p.total_sold} uds</p>
                        <p className="text-xs text-ama-text-muted">{formatPrice(p.total_revenue)}</p>
                      </div>
                    </div>
                    <div className="h-1.5 bg-ama-darker rounded-full overflow-hidden">
                      <div className="h-full bg-ama-amber rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Margin Analysis */}
      {view === 'margins' && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ama-text-muted border-b border-ama-border">
                <th className="pb-2 pr-4">Producto</th>
                <th className="pb-2 pr-4">Categoría</th>
                <th className="pb-2 pr-4 text-right">Precio Unit.</th>
                <th className="pb-2 pr-4 text-right">Vendidos</th>
                <th className="pb-2 pr-4 text-right">Ingreso Total</th>
                <th className="pb-2 text-right">% del Total</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const totalRev = margins.reduce((s, m) => s + m.total_revenue, 0) || 1;
                return margins.map(p => (
                  <tr key={p.id} className="border-b border-ama-border/50 hover:bg-ama-card/50">
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-2">
                        {p.image_url && <img src={p.image_url} alt="" className="w-8 h-8 rounded object-cover" />}
                        <span className="text-ama-text">{p.name}</span>
                      </div>
                    </td>
                    <td className="py-2.5 pr-4 text-ama-text-muted">{p.category}</td>
                    <td className="py-2.5 pr-4 text-right text-ama-text">{formatPrice(p.unit_price)}</td>
                    <td className="py-2.5 pr-4 text-right text-ama-text">{p.total_sold}</td>
                    <td className="py-2.5 pr-4 text-right text-ama-amber font-medium">{formatPrice(p.total_revenue)}</td>
                    <td className="py-2.5 text-right">
                      <span className="text-ama-text font-medium">{((p.total_revenue / totalRev) * 100).toFixed(1)}%</span>
                    </td>
                  </tr>
                ));
              })()}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CustomersTab() {
  const [summary, setSummary] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerDetail, setCustomerDetail] = useState(null);
  const [view, setView] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('total_spent');
  const [dateRange, setDateRange] = useState({ from: '', to: '' });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const dr = dateRange.from ? dateRange : undefined;
      const [sum, custs] = await Promise.all([
        api.adminCustomersSummary(dr),
        api.adminCustomers(dr),
      ]);
      setSummary(sum);
      setCustomers(custs);
    } catch (err) {
      console.error('Error loading customer data:', err);
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => { loadData(); }, [loadData]);

  async function openDetail(id) {
    setSelectedCustomer(id);
    try {
      const detail = await api.adminCustomerDetail(id);
      setCustomerDetail(detail);
    } catch (err) {
      console.error('Error loading customer detail:', err);
    }
  }

  function closeDetail() {
    setSelectedCustomer(null);
    setCustomerDetail(null);
  }

  const sortedCustomers = [...customers].sort((a, b) => {
    if (sortBy === 'total_spent') return b.total_spent - a.total_spent;
    if (sortBy === 'total_orders') return b.total_orders - a.total_orders;
    if (sortBy === 'avg_order_value') return b.avg_order_value - a.avg_order_value;
    if (sortBy === 'recent') return new Date(b.last_order_date) - new Date(a.last_order_date);
    return 0;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-ama-amber" />
      </div>
    );
  }

  // Customer detail view
  if (selectedCustomer && customerDetail) {
    return (
      <div className="space-y-6">
        <button onClick={closeDetail} className="flex items-center gap-1 text-sm text-ama-text-muted hover:text-ama-amber transition-colors cursor-pointer">
          <ChevronLeft size={16} /> Volver a clientes
        </button>

        {/* Customer header */}
        <div className="bg-ama-card border border-ama-border rounded-xl p-5">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-bold text-ama-text">{customerDetail.name}</h3>
              <div className="flex items-center gap-4 mt-2 text-sm text-ama-text-muted">
                <span className="flex items-center gap-1"><Mail size={14} /> {customerDetail.email}</span>
                <span className="flex items-center gap-1"><Phone size={14} /> {customerDetail.phone}</span>
              </div>
              <p className="text-xs text-ama-text-muted mt-1">
                <Calendar size={12} className="inline mr-1" />
                Cliente desde {new Date(customerDetail.created_at).toLocaleDateString('es-CL')}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mt-4">
            <div className="bg-ama-darker rounded-lg p-3 text-center">
              <p className="text-xs text-ama-text-muted">Total Gastado</p>
              <p className="text-lg font-bold text-ama-amber">{formatPrice(customerDetail.total_spent)}</p>
            </div>
            <div className="bg-ama-darker rounded-lg p-3 text-center">
              <p className="text-xs text-ama-text-muted">Pedidos</p>
              <p className="text-lg font-bold text-ama-text">{customerDetail.total_orders}</p>
            </div>
            <div className="bg-ama-darker rounded-lg p-3 text-center">
              <p className="text-xs text-ama-text-muted">Ticket Promedio</p>
              <p className="text-lg font-bold text-ama-text">{formatPrice(customerDetail.avg_order_value)}</p>
            </div>
          </div>
        </div>

        {/* Favorite products */}
        {customerDetail.favorite_products?.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-ama-text mb-3 flex items-center gap-2">
              <Star size={16} className="text-ama-amber" /> Productos Favoritos
            </h4>
            <div className="space-y-2">
              {customerDetail.favorite_products.map((p, i) => {
                const maxOrdered = customerDetail.favorite_products[0]?.times_ordered || 1;
                const pct = (p.times_ordered / maxOrdered) * 100;
                return (
                  <div key={i} className="bg-ama-card border border-ama-border rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="text-sm font-medium text-ama-text">{p.name}</p>
                        <p className="text-xs text-ama-text-muted">{p.category} · {formatPrice(p.price)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-ama-amber">{p.times_ordered}x</p>
                        <p className="text-xs text-ama-text-muted">{formatPrice(p.total_spent_product)}</p>
                      </div>
                    </div>
                    <div className="h-1.5 bg-ama-darker rounded-full overflow-hidden">
                      <div className="h-full bg-ama-amber rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent orders */}
        {customerDetail.recent_orders?.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-ama-text mb-3 flex items-center gap-2">
              <ShoppingBag size={16} className="text-ama-amber" /> Últimos Pedidos
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-ama-text-muted border-b border-ama-border">
                    <th className="pb-2 pr-4">#</th>
                    <th className="pb-2 pr-4">Fecha</th>
                    <th className="pb-2 pr-4 text-right">Items</th>
                    <th className="pb-2 pr-4 text-right">Total</th>
                    <th className="pb-2">Pago</th>
                  </tr>
                </thead>
                <tbody>
                  {customerDetail.recent_orders.map(o => (
                    <tr key={o.id} className="border-b border-ama-border/50">
                      <td className="py-2 pr-4 text-ama-text-muted">#{o.id}</td>
                      <td className="py-2 pr-4 text-ama-text">{new Date(o.created_at).toLocaleDateString('es-CL')}</td>
                      <td className="py-2 pr-4 text-right text-ama-text">{o.item_count}</td>
                      <td className="py-2 pr-4 text-right text-ama-amber font-medium">{formatPrice(o.total)}</td>
                      <td className="py-2 capitalize text-ama-text-muted">{o.payment_method}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={Users} label="Total Clientes" value={summary.total_customers} />
          <StatCard icon={UserCheck} label="Activos (30d)" value={summary.active_customers_30d} />
          <StatCard icon={DollarSign} label="Ingreso Total" value={formatPrice(summary.total_revenue)} />
          <StatCard icon={TrendingUp} label="LTV Promedio" value={formatPrice(summary.avg_lifetime_value)} />
        </div>
      )}

      {/* Date Range Picker */}
      <DateRangePicker dateRange={dateRange} onChange={setDateRange} />

      {/* Sub-nav */}
      <div className="flex items-center gap-2 border-b border-ama-border pb-2">
        {[
          { id: 'overview', label: 'Ranking' },
          { id: 'top-revenue', label: 'Mejor Margen' },
          { id: 'top-frequency', label: 'Más Frecuentes' },
        ].map(v => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors cursor-pointer ${
              view === v.id
                ? 'bg-ama-amber text-ama-darker font-medium'
                : 'text-ama-text-muted hover:text-ama-text hover:bg-ama-card'
            }`}
          >
            {v.label}
          </button>
        ))}
        <button onClick={loadData} className="ml-auto p-1.5 text-ama-text-muted hover:text-ama-amber transition-colors cursor-pointer" title="Refrescar">
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Overview - Full customer list */}
      {view === 'overview' && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <span className="text-sm text-ama-text-muted">Ordenar por:</span>
            {[
              { id: 'total_spent', label: 'Gasto Total' },
              { id: 'total_orders', label: 'Pedidos' },
              { id: 'avg_order_value', label: 'Ticket Prom.' },
              { id: 'recent', label: 'Reciente' },
            ].map(s => (
              <button
                key={s.id}
                onClick={() => setSortBy(s.id)}
                className={`px-2.5 py-1 text-xs rounded-lg transition-colors cursor-pointer ${
                  sortBy === s.id
                    ? 'bg-ama-amber/20 text-ama-amber border border-ama-amber/30'
                    : 'text-ama-text-muted hover:text-ama-text bg-ama-card border border-ama-border'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-ama-text-muted border-b border-ama-border">
                  <th className="pb-2 pr-4">#</th>
                  <th className="pb-2 pr-4">Cliente</th>
                  <th className="pb-2 pr-4 text-right">Pedidos</th>
                  <th className="pb-2 pr-4 text-right">Total Gastado</th>
                  <th className="pb-2 pr-4 text-right">Ticket Prom.</th>
                  <th className="pb-2">Último Pedido</th>
                </tr>
              </thead>
              <tbody>
                {sortedCustomers.map((c, i) => (
                  <tr
                    key={c.id}
                    onClick={() => openDetail(c.id)}
                    className="border-b border-ama-border/50 hover:bg-ama-card/50 cursor-pointer"
                  >
                    <td className="py-2.5 pr-4">
                      <span className={`font-bold text-sm ${i < 3 ? 'text-ama-amber' : 'text-ama-text-muted'}`}>
                        {i < 3 ? <Crown size={14} className="inline" /> : `#${i + 1}`}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4">
                      <p className="text-ama-text font-medium">{c.name}</p>
                      <p className="text-xs text-ama-text-muted">{c.email}</p>
                    </td>
                    <td className="py-2.5 pr-4 text-right text-ama-text">{c.total_orders}</td>
                    <td className="py-2.5 pr-4 text-right text-ama-amber font-medium">{formatPrice(c.total_spent)}</td>
                    <td className="py-2.5 pr-4 text-right text-ama-text">{formatPrice(c.avg_order_value)}</td>
                    <td className="py-2.5 text-ama-text-muted text-xs">
                      {c.last_order_date ? new Date(c.last_order_date).toLocaleDateString('es-CL') : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Top by Revenue */}
      {view === 'top-revenue' && summary && (
        <div>
          <p className="text-sm text-ama-text-muted mb-4">Clientes que generan mayor ingreso para el negocio</p>
          <div className="space-y-2">
            {summary.top_by_revenue.map((c, i) => {
              const maxSpent = summary.top_by_revenue[0]?.total_spent || 1;
              const pct = (c.total_spent / maxSpent) * 100;
              return (
                <div
                  key={c.id}
                  onClick={() => openDetail(c.id)}
                  className="bg-ama-card border border-ama-border rounded-lg p-4 cursor-pointer hover:border-ama-amber/30 transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-ama-amber font-bold text-sm w-6">#{i + 1}</span>
                      <div>
                        <p className="text-sm font-medium text-ama-text">{c.name}</p>
                        <p className="text-xs text-ama-text-muted">{c.order_count} pedidos</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-ama-amber">{formatPrice(c.total_spent)}</p>
                      <p className="text-xs text-ama-text-muted">{((c.total_spent / summary.total_revenue) * 100).toFixed(1)}% del total</p>
                    </div>
                  </div>
                  <div className="h-1.5 bg-ama-darker rounded-full overflow-hidden">
                    <div className="h-full bg-ama-amber rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Top by Frequency */}
      {view === 'top-frequency' && summary && (
        <div>
          <p className="text-sm text-ama-text-muted mb-4">Clientes con mayor frecuencia de compra</p>
          <div className="space-y-2">
            {summary.top_by_frequency.map((c, i) => {
              const maxOrders = summary.top_by_frequency[0]?.order_count || 1;
              const pct = (c.order_count / maxOrders) * 100;
              return (
                <div
                  key={c.id}
                  onClick={() => openDetail(c.id)}
                  className="bg-ama-card border border-ama-border rounded-lg p-4 cursor-pointer hover:border-ama-amber/30 transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-ama-amber font-bold text-sm w-6">#{i + 1}</span>
                      <div>
                        <p className="text-sm font-medium text-ama-text">{c.name}</p>
                        <p className="text-xs text-ama-text-muted">{formatPrice(c.total_spent)} total</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-ama-amber">{c.order_count} pedidos</p>
                      <p className="text-xs text-ama-text-muted">{formatPrice(Math.round(c.total_spent / c.order_count))} promedio</p>
                    </div>
                  </div>
                  <div className="h-1.5 bg-ama-darker rounded-full overflow-hidden">
                    <div className="h-full bg-ama-amber rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function InsightsTab() {
  const [messages, setMessages] = useState([WELCOME_MESSAGE]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleSend(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setInput('');
    setLoading(true);

    try {
      const history = messages.filter(m => m !== WELCOME_MESSAGE);
      const data = await api.adminChat(text, history);
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Error al conectar con el asistente. Intenta de nuevo.',
      }]);
    } finally {
      setLoading(false);
    }
  }

  const suggestions = [
    '¿Cuáles son los productos más vendidos?',
    '¿Qué categoría genera más ingresos?',
    'Sugiere una campaña para aumentar ventas',
    '¿Qué productos deberíamos promocionar?',
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-220px)] min-h-[400px]">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 pb-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-ama-amber text-ama-darker rounded-br-md'
                  : 'bg-ama-card text-ama-text border border-ama-border rounded-bl-md'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-ama-card border border-ama-border rounded-2xl rounded-bl-md px-4 py-3">
              <Loader2 size={16} className="animate-spin text-ama-amber" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Suggestions */}
      {messages.length <= 1 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => {
                setInput(s);
                inputRef.current?.focus();
              }}
              className="text-xs px-3 py-1.5 rounded-full bg-ama-card border border-ama-border text-ama-text-muted hover:text-ama-amber hover:border-ama-amber/30 transition-colors cursor-pointer"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSend} className="flex items-center gap-2 pt-3 border-t border-ama-border">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Pregunta sobre tu negocio..."
          className="flex-1 bg-ama-card border border-ama-border rounded-xl px-4 py-2.5 text-sm text-ama-text placeholder:text-ama-text-muted outline-none focus:border-ama-amber/50 transition-colors"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={!input.trim() || loading}
          className="w-10 h-10 rounded-xl bg-ama-amber hover:bg-ama-amber-light disabled:opacity-40 disabled:hover:bg-ama-amber text-ama-darker flex items-center justify-center transition-colors cursor-pointer"
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}

function ModelSelector({ agent, label, icon: Icon, iconColor, currentModel, availableModels, loadingModels, onSave, disabled }) {
  const [selectedModel, setSelectedModel] = useState(currentModel);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => { setSelectedModel(currentModel); }, [currentModel]);

  const handleSave = async () => {
    if (!selectedModel || selectedModel === currentModel) return;
    setSaving(true);
    setMsg(null);
    try {
      await onSave(agent, selectedModel);
      setMsg({ type: 'success', text: 'Modelo actualizado' });
      setTimeout(() => setMsg(null), 3000);
    } catch {
      setMsg({ type: 'error', text: 'Error al guardar' });
    } finally {
      setSaving(false);
    }
  };

  const modelName = (id) => {
    const m = availableModels.find(m => m.id === id);
    return m ? m.name : id;
  };

  return (
    <div className="bg-ama-darker rounded-xl p-4 border border-ama-border">
      <div className="flex items-center gap-3 mb-3">
        <Icon size={18} className={iconColor} />
        <div className="flex-1">
          <p className="text-sm font-medium text-ama-text">{label}</p>
          <p className="text-xs text-ama-text-muted mt-0.5 font-mono">{currentModel}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <select
            value={selectedModel}
            onChange={e => setSelectedModel(e.target.value)}
            disabled={disabled || loadingModels || availableModels.length === 0}
            className="w-full appearance-none bg-ama-card border border-ama-border rounded-lg px-3 py-2 pr-8 text-sm text-ama-text focus:border-ama-amber/50 focus:outline-none disabled:opacity-50 cursor-pointer"
          >
            {loadingModels ? (
              <option>Cargando modelos...</option>
            ) : availableModels.length === 0 ? (
              <option>Sin modelos disponibles</option>
            ) : (
              availableModels.map(m => (
                <option key={m.id} value={m.id}>{m.name} ({m.id})</option>
              ))
            )}
          </select>
          <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ama-text-muted pointer-events-none" />
        </div>
        <button
          onClick={handleSave}
          disabled={saving || disabled || selectedModel === currentModel}
          className="flex items-center gap-1.5 px-4 py-2 bg-ama-amber text-ama-darker font-medium text-sm rounded-lg hover:bg-ama-amber-light transition-colors disabled:opacity-50 cursor-pointer whitespace-nowrap"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
          {saving ? '...' : 'Aplicar'}
        </button>
      </div>
      {msg && (
        <div className={`mt-2 flex items-center gap-1.5 text-xs ${msg.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
          {msg.type === 'success' ? <CheckCircle size={12} /> : <AlertCircle size={12} />}
          {msg.text}
        </div>
      )}
    </div>
  );
}

function RecaptchaSettings() {
  const [config, setConfig] = useState(null);
  const [siteKey, setSiteKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getRecaptchaStatus()
      .then(data => {
        setConfig(data);
        setSiteKey(data.siteKey || '');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (enabled) => {
    if (enabled && (!siteKey.trim() || !secretKey.trim())) {
      setMessage({ type: 'error', text: 'Se requieren ambas claves para habilitar reCAPTCHA' });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const result = await api.saveRecaptcha(siteKey.trim(), secretKey.trim(), enabled);
      setMessage({ type: 'success', text: result.message });
      setSecretKey('');
      const updated = await api.getRecaptchaStatus();
      setConfig(updated);
      setSiteKey(updated.siteKey || '');
    } catch {
      setMessage({ type: 'error', text: 'Error al guardar configuración' });
    } finally {
      setSaving(false);
    }
  };

  const handleDisable = async () => {
    setSaving(true);
    try {
      await api.deleteRecaptcha();
      setMessage({ type: 'success', text: 'reCAPTCHA deshabilitado' });
      const updated = await api.getRecaptchaStatus();
      setConfig(updated);
    } catch {
      setMessage({ type: 'error', text: 'Error al deshabilitar reCAPTCHA' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;

  return (
    <div className="bg-ama-card border border-ama-border rounded-xl p-6">
      <div className="flex items-center gap-3 mb-4">
        <Lock size={24} className="text-ama-amber" />
        <div>
          <h2 className="text-lg font-semibold text-ama-text">Seguridad del Chat — reCAPTCHA v3</h2>
          <p className="text-xs text-ama-text-muted">Protección invisible contra bots en el chat de clientes</p>
        </div>
      </div>

      <div className="bg-ama-darker rounded-xl p-4 border border-ama-border mb-4">
        <div className="flex items-center gap-2 mb-2">
          <Shield size={16} className="text-ama-amber" />
          <span className="text-sm font-medium text-ama-text">Estado</span>
        </div>
        <div className="flex items-center gap-2">
          {config?.enabled ? (
            <>
              <CheckCircle size={16} className="text-green-400" />
              <span className="text-sm text-green-400">Habilitado</span>
              <span className="text-xs text-ama-text-muted ml-2">
                Site Key: {config.siteKeyConfigured ? '✓' : '✗'} |
                Secret Key: {config.secretKeyConfigured ? '✓' : '✗'}
              </span>
            </>
          ) : (
            <>
              <AlertCircle size={16} className="text-yellow-400" />
              <span className="text-sm text-yellow-400">Deshabilitado — El chat no tiene protección anti-bot</span>
            </>
          )}
        </div>
      </div>

      <div className="bg-ama-darker rounded-xl p-4 border border-ama-border space-y-3">
        <h3 className="text-sm font-medium text-ama-text">
          {config?.enabled ? 'Actualizar claves' : 'Configurar reCAPTCHA v3'}
        </h3>
        <p className="text-xs text-ama-text-muted">
          Obtén las claves en <span className="text-ama-amber">Google reCAPTCHA Console</span> (selecciona reCAPTCHA v3).
        </p>
        <div>
          <label className="text-xs text-ama-text-muted mb-1 block">Site Key (pública)</label>
          <input
            type="text"
            value={siteKey}
            onChange={e => setSiteKey(e.target.value)}
            placeholder="6Lc..."
            className="w-full bg-ama-card border border-ama-border rounded-lg px-4 py-2.5 text-sm text-ama-text placeholder-ama-text-muted/50 focus:border-ama-amber/50 focus:outline-none font-mono"
          />
        </div>
        <div>
          <label className="text-xs text-ama-text-muted mb-1 block">Secret Key (privada — se almacena encriptada)</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={showSecret ? 'text' : 'password'}
                value={secretKey}
                onChange={e => setSecretKey(e.target.value)}
                placeholder={config?.secretKeyConfigured ? '••••••• (ya configurada, dejar vacío para mantener)' : '6Lc...'}
                className="w-full bg-ama-card border border-ama-border rounded-lg px-4 py-2.5 text-sm text-ama-text placeholder-ama-text-muted/50 focus:border-ama-amber/50 focus:outline-none font-mono pr-10"
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ama-text-muted hover:text-ama-text cursor-pointer"
              >
                {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <button
            onClick={() => handleSave(true)}
            disabled={saving || !siteKey.trim()}
            className="flex items-center gap-2 px-5 py-2.5 bg-ama-amber text-ama-darker font-medium text-sm rounded-lg hover:bg-ama-amber-light transition-colors disabled:opacity-50 cursor-pointer"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Shield size={16} />}
            {config?.enabled ? 'Actualizar' : 'Habilitar reCAPTCHA'}
          </button>
          {config?.enabled && (
            <button
              onClick={handleDisable}
              disabled={saving}
              className="flex items-center gap-1 px-3 py-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded-lg transition-colors cursor-pointer"
            >
              <Trash2 size={14} />
              Deshabilitar
            </button>
          )}
        </div>
        {message && (
          <div className={`flex items-center gap-2 text-sm ${message.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
            {message.type === 'success' ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
            {message.text}
          </div>
        )}
      </div>

      <div className="mt-4 bg-blue-500/5 border border-blue-500/20 rounded-lg p-3">
        <p className="text-xs text-blue-400">
          <strong>Protección activa:</strong> Input sanitization + Rate limiting (15 msg/min) + Response sanitization siempre están activos, independiente de reCAPTCHA.
        </p>
      </div>
    </div>
  );
}

function SumupSettings() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [saving, setSaving] = useState(false);

  const [mode, setMode] = useState('mock');
  const [returnUrlBase, setReturnUrlBase] = useState('');

  const [apiKey, setApiKey] = useState('');
  const [merchantCode, setMerchantCode] = useState('');
  const [appId, setAppId] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [showMerchant, setShowMerchant] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getSumupStatus();
      setStatus(data);
      setMode(data.mode?.value || 'mock');
      setReturnUrlBase(data.returnUrlBase?.value || '');
    } catch (err) {
      console.error('Error loading SumUp status:', err);
      setMessage({ type: 'error', text: 'Error al cargar configuración SumUp' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const handleSaveModeAndUrl = async () => {
    if (!/^https?:\/\/.+/i.test(returnUrlBase.trim())) {
      setMessage({ type: 'error', text: 'Return URL debe iniciar con http:// o https://' });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const result = await api.saveSumup({
        mode,
        return_url_base: returnUrlBase.trim(),
      });
      setMessage({ type: 'success', text: result.message });
      await loadStatus();
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Error al guardar modo/URL' });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCredentials = async () => {
    const payload = {};
    if (apiKey.trim()) {
      if (apiKey.trim().length < 10) {
        setMessage({ type: 'error', text: 'API Key debe tener al menos 10 caracteres' });
        return;
      }
      payload.api_key = apiKey.trim();
    }
    if (merchantCode.trim()) {
      if (merchantCode.trim().length < 3) {
        setMessage({ type: 'error', text: 'Merchant Code debe tener al menos 3 caracteres' });
        return;
      }
      payload.merchant_code = merchantCode.trim();
    }
    if (appId.trim()) {
      payload.app_id = appId.trim();
    }
    if (Object.keys(payload).length === 0) {
      setMessage({ type: 'error', text: 'Ingresa al menos un campo para guardar' });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const result = await api.saveSumup(payload);
      setMessage({ type: 'success', text: result.message });
      setApiKey('');
      setMerchantCode('');
      setAppId('');
      await loadStatus();
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Error al guardar credenciales' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAll = async () => {
    if (!confirm('¿Eliminar TODA la configuración SumUp (credenciales, modo, return URL)? Esta acción no se puede deshacer.')) return;
    try {
      await api.deleteSumup();
      setMessage({ type: 'success', text: 'Configuración SumUp eliminada completamente' });
      await loadStatus();
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Error al eliminar configuración' });
    }
  };

  if (loading) return null;

  const renderConfiguredLine = (label, cfg, opts = {}) => {
    const value = opts.plain ? cfg?.value : cfg?.masked;
    return (
      <div className="flex items-center justify-between text-xs py-1">
        <span className="text-ama-text-muted">{label}</span>
        {cfg?.configured ? (
          <span className="flex items-center gap-1.5 text-green-400 font-mono">
            <CheckCircle size={12} />
            {value || '✓'}
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-yellow-400">
            <AlertCircle size={12} />
            No configurado
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="bg-ama-card border border-ama-border rounded-xl p-6">
      <div className="flex items-center gap-3 mb-4">
        <CreditCard size={24} className="text-ama-amber" />
        <div>
          <h2 className="text-lg font-semibold text-ama-text">Integración SumUp — Pagos con Tarjeta</h2>
          <p className="text-xs text-ama-text-muted">
            Toda la configuración se almacena en la base de datos. Los secretos se cifran con AES-256-GCM.
          </p>
        </div>
      </div>

      {/* Status Panel */}
      <div className="bg-ama-darker rounded-xl p-4 border border-ama-border mb-4 space-y-1">
        <div className="flex items-center gap-2 mb-2">
          <Shield size={16} className="text-ama-amber" />
          <span className="text-sm font-medium text-ama-text">Estado Actual</span>
        </div>
        <div className="flex items-center justify-between text-xs py-1">
          <span className="text-ama-text-muted">Modo</span>
          <span className={`font-mono px-2 py-0.5 rounded ${status?.mode?.value === 'live' ? 'bg-green-400/10 text-green-400' : 'bg-blue-400/10 text-blue-400'}`}>
            {status?.mode?.value || '—'}
            <span className="ml-2 text-[10px] text-ama-text-muted">({status?.mode?.source})</span>
          </span>
        </div>
        <div className="flex items-center justify-between text-xs py-1">
          <span className="text-ama-text-muted">Return URL Base</span>
          <span className="font-mono text-ama-text truncate max-w-xs">
            {status?.returnUrlBase?.value || <span className="text-yellow-400">No configurado</span>}
          </span>
        </div>
        {renderConfiguredLine('API Key', status?.apiKey)}
        {renderConfiguredLine('Merchant Code', status?.merchantCode)}
        {renderConfiguredLine('App ID', status?.appId, { plain: true })}
      </div>

      {/* Mode + Return URL */}
      <div className="bg-ama-darker rounded-xl p-4 border border-ama-border space-y-3 mb-4">
        <h3 className="text-sm font-medium text-ama-text flex items-center gap-2">
          <Globe size={14} className="text-ama-amber" />
          Modo de Operación y URL de Retorno
        </h3>
        <div>
          <label className="text-xs text-ama-text-muted mb-1 block">Modo</label>
          <div className="flex gap-3">
            <label className="flex items-center gap-2 text-sm text-ama-text cursor-pointer">
              <input
                type="radio"
                name="sumup_mode"
                value="mock"
                checked={mode === 'mock'}
                onChange={e => setMode(e.target.value)}
                className="accent-ama-amber"
              />
              <span className="font-mono">mock</span>
              <span className="text-xs text-ama-text-muted">(sin red, para dev/tests)</span>
            </label>
            <label className="flex items-center gap-2 text-sm text-ama-text cursor-pointer">
              <input
                type="radio"
                name="sumup_mode"
                value="live"
                checked={mode === 'live'}
                onChange={e => setMode(e.target.value)}
                className="accent-ama-amber"
              />
              <span className="font-mono">live</span>
              <span className="text-xs text-ama-text-muted">(SumUp real)</span>
            </label>
          </div>
        </div>
        <div>
          <label className="text-xs text-ama-text-muted mb-1 block">
            Return URL Base
            <span className="ml-2 text-[10px] text-ama-text-muted">(se usará para construir /checkout/success y /checkout/failure)</span>
          </label>
          <input
            type="text"
            value={returnUrlBase}
            onChange={e => setReturnUrlBase(e.target.value)}
            placeholder="https://midominio.cl"
            className="w-full bg-ama-card border border-ama-border rounded-lg px-4 py-2.5 text-sm text-ama-text placeholder-ama-text-muted/50 focus:border-ama-amber/50 focus:outline-none font-mono"
          />
        </div>
        <button
          onClick={handleSaveModeAndUrl}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-ama-amber text-ama-darker font-medium text-sm rounded-lg hover:bg-ama-amber-light transition-colors disabled:opacity-50 cursor-pointer"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Globe size={16} />}
          {saving ? 'Guardando...' : 'Guardar modo y URL'}
        </button>
      </div>

      {/* Credentials */}
      <div className="bg-ama-darker rounded-xl p-4 border border-ama-border space-y-3 mb-4">
        <h3 className="text-sm font-medium text-ama-text flex items-center gap-2">
          <Key size={14} className="text-ama-amber" />
          Credenciales SumUp
        </h3>
        <p className="text-xs text-ama-text-muted">
          Deja un campo vacío para mantener el valor actual. API Key y Merchant Code se almacenan encriptados.
        </p>
        <div>
          <label className="text-xs text-ama-text-muted mb-1 block">API Key (sup_sk_...)</label>
          <div className="relative">
            <input
              type={showApiKey ? 'text' : 'password'}
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder={status?.apiKey?.configured ? `${status.apiKey.masked} — deja vacío para mantener` : 'sup_sk_...'}
              className="w-full bg-ama-card border border-ama-border rounded-lg px-4 py-2.5 text-sm text-ama-text placeholder-ama-text-muted/50 focus:border-ama-amber/50 focus:outline-none font-mono pr-10"
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ama-text-muted hover:text-ama-text cursor-pointer"
            >
              {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>
        <div>
          <label className="text-xs text-ama-text-muted mb-1 block">Merchant Code</label>
          <div className="relative">
            <input
              type={showMerchant ? 'text' : 'password'}
              value={merchantCode}
              onChange={e => setMerchantCode(e.target.value)}
              placeholder={status?.merchantCode?.configured ? `${status.merchantCode.masked} — deja vacío para mantener` : 'MABCDE12'}
              className="w-full bg-ama-card border border-ama-border rounded-lg px-4 py-2.5 text-sm text-ama-text placeholder-ama-text-muted/50 focus:border-ama-amber/50 focus:outline-none font-mono pr-10"
            />
            <button
              type="button"
              onClick={() => setShowMerchant(!showMerchant)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ama-text-muted hover:text-ama-text cursor-pointer"
            >
              {showMerchant ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>
        <div>
          <label className="text-xs text-ama-text-muted mb-1 block">App ID (pública, se usa en el Card Widget del frontend)</label>
          <input
            type="text"
            value={appId}
            onChange={e => setAppId(e.target.value)}
            placeholder={status?.appId?.configured ? `${status.appId.value} — deja vacío para mantener` : 'app_...'}
            className="w-full bg-ama-card border border-ama-border rounded-lg px-4 py-2.5 text-sm text-ama-text placeholder-ama-text-muted/50 focus:border-ama-amber/50 focus:outline-none font-mono"
          />
        </div>
        <button
          onClick={handleSaveCredentials}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-ama-amber text-ama-darker font-medium text-sm rounded-lg hover:bg-ama-amber-light transition-colors disabled:opacity-50 cursor-pointer"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Key size={16} />}
          {saving ? 'Guardando...' : 'Guardar credenciales'}
        </button>
        {message && (
          <div className={`flex items-center gap-2 text-sm ${message.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
            {message.type === 'success' ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
            {message.text}
          </div>
        )}
      </div>

      {/* Danger Zone */}
      <div className="border border-red-400/20 bg-red-400/5 rounded-xl p-4">
        <h3 className="text-sm font-medium text-red-400 mb-2 flex items-center gap-2">
          <AlertCircle size={14} />
          Zona de peligro
        </h3>
        <p className="text-xs text-ama-text-muted mb-3">
          Elimina toda la configuración SumUp (credenciales, modo y URL). Los pagos dejarán de funcionar hasta reconfigurar.
        </p>
        <button
          onClick={handleDeleteAll}
          className="flex items-center gap-2 px-4 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-400/10 border border-red-400/30 rounded-lg transition-colors cursor-pointer"
        >
          <Trash2 size={14} />
          Eliminar toda la configuración SumUp
        </button>
      </div>
    </div>
  );
}

function SettingsTab() {
  const [aiStatus, setAiStatus] = useState(null);
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [availableModels, setAvailableModels] = useState([]);
  const [loadingModels, setLoadingModels] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.aiStatus();
      setAiStatus(data);
    } catch (err) {
      console.error('Error loading AI status:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadModels = useCallback(async () => {
    try {
      setLoadingModels(true);
      const data = await api.getAvailableModels();
      setAvailableModels(data.models || []);
    } catch (err) {
      console.error('Error loading models:', err);
    } finally {
      setLoadingModels(false);
    }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  useEffect(() => {
    if (aiStatus?.configured) {
      loadModels();
    }
  }, [aiStatus?.configured, loadModels]);

  const handleSaveKey = async () => {
    if (!apiKey.trim() || apiKey.trim().length < 10) {
      setMessage({ type: 'error', text: 'Ingresa una API key válida (mínimo 10 caracteres)' });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const result = await api.saveApiKey(apiKey.trim());
      setMessage({ type: 'success', text: result.message });
      setApiKey('');
      await loadStatus();
    } catch (err) {
      setMessage({ type: 'error', text: 'Error al guardar la API key' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteKey = async () => {
    if (!confirm('¿Estás seguro de eliminar la API key? Los chats AI dejarán de funcionar.')) return;
    try {
      await api.deleteApiKey();
      setMessage({ type: 'success', text: 'API key eliminada correctamente' });
      setAvailableModels([]);
      await loadStatus();
    } catch (err) {
      setMessage({ type: 'error', text: 'Error al eliminar la API key' });
    }
  };

  const handleSaveModel = async (agent, model) => {
    const result = await api.saveModel(agent, model);
    setAiStatus(prev => ({ ...prev, models: result.models }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-ama-amber" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      {/* API Key Section */}
      <div className="bg-ama-card border border-ama-border rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <Shield size={24} className="text-ama-amber" />
          <h2 className="text-lg font-semibold text-ama-text">Configuración de Inteligencia Artificial</h2>
        </div>
        <p className="text-sm text-ama-text-muted mb-6">
          Los agentes de AI (chat de clientes y chat de administración) utilizan <strong className="text-ama-text">OpenRouter</strong> como proveedor de modelos de lenguaje.
          La API key se almacena <strong className="text-ama-text">encriptada</strong> en la base de datos.
        </p>

        <div className="bg-ama-darker rounded-xl p-4 border border-ama-border mb-6">
          <div className="flex items-center gap-2 mb-2">
            <Key size={16} className="text-ama-amber" />
            <span className="text-sm font-medium text-ama-text">Estado de la API Key</span>
          </div>
          {aiStatus?.configured ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle size={16} className="text-green-400" />
                <span className="text-sm text-green-400">Configurada</span>
                <span className="text-xs text-ama-text-muted font-mono bg-ama-card px-2 py-0.5 rounded">{aiStatus.maskedKey}</span>
              </div>
              <button
                onClick={handleDeleteKey}
                className="flex items-center gap-1 px-3 py-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded-lg transition-colors cursor-pointer"
              >
                <Trash2 size={14} />
                Eliminar
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <AlertCircle size={16} className="text-yellow-400" />
              <span className="text-sm text-yellow-400">No configurada — Los chats AI no están operativos</span>
            </div>
          )}
          {aiStatus?.updatedAt && (
            <p className="text-xs text-ama-text-muted mt-2">Última actualización: {new Date(aiStatus.updatedAt).toLocaleString('es-CL')}</p>
          )}
        </div>

        <div className="bg-ama-darker rounded-xl p-4 border border-ama-border">
          <h3 className="text-sm font-medium text-ama-text mb-3">
            {aiStatus?.configured ? 'Actualizar API Key' : 'Configurar API Key de OpenRouter'}
          </h3>
          <div className="flex gap-3">
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="sk-or-v1-..."
              className="flex-1 bg-ama-card border border-ama-border rounded-lg px-4 py-2.5 text-sm text-ama-text placeholder-ama-text-muted/50 focus:border-ama-amber/50 focus:outline-none font-mono"
              onKeyDown={e => e.key === 'Enter' && handleSaveKey()}
            />
            <button
              onClick={handleSaveKey}
              disabled={saving || !apiKey.trim()}
              className="flex items-center gap-2 px-5 py-2.5 bg-ama-amber text-ama-darker font-medium text-sm rounded-lg hover:bg-ama-amber-light transition-colors disabled:opacity-50 cursor-pointer"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Key size={16} />}
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
          {message && (
            <div className={`mt-3 flex items-center gap-2 text-sm ${message.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
              {message.type === 'success' ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
              {message.text}
            </div>
          )}
        </div>
      </div>

      {/* Model Selection Section */}
      <div className="bg-ama-card border border-ama-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Cpu size={24} className="text-ama-amber" />
            <div>
              <h2 className="text-lg font-semibold text-ama-text">Selección de Modelos</h2>
              <p className="text-xs text-ama-text-muted">Configura el modelo LLM para cada agente de forma independiente</p>
            </div>
          </div>
          {aiStatus?.configured && (
            <button
              onClick={loadModels}
              disabled={loadingModels}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-ama-text-muted hover:text-ama-amber bg-ama-darker border border-ama-border rounded-lg transition-colors cursor-pointer"
            >
              <RefreshCw size={12} className={loadingModels ? 'animate-spin' : ''} />
              {loadingModels ? 'Cargando...' : 'Refrescar modelos'}
            </button>
          )}
        </div>

        {!aiStatus?.configured ? (
          <div className="flex items-center gap-2 text-sm text-yellow-400 bg-yellow-400/5 rounded-lg p-3 border border-yellow-400/20">
            <AlertCircle size={16} />
            Configura la API key primero para poder seleccionar modelos
          </div>
        ) : (
          <div className="space-y-4">
            {availableModels.length > 0 && (
              <p className="text-xs text-ama-text-muted">
                <Zap size={12} className="inline text-green-400 mr-1" />
                {availableModels.length} modelos gratuitos disponibles en OpenRouter
              </p>
            )}

            <ModelSelector
              agent="customer"
              label="Asistente de Clientes"
              icon={MessageCircle}
              iconColor="text-blue-400"
              currentModel={aiStatus?.models?.customer || 'qwen/qwen3.6-plus:free'}
              availableModels={availableModels}
              loadingModels={loadingModels}
              onSave={handleSaveModel}
              disabled={!aiStatus?.configured}
            />

            <ModelSelector
              agent="admin"
              label="Asistente de Negocio"
              icon={BarChart3}
              iconColor="text-purple-400"
              currentModel={aiStatus?.models?.admin || 'qwen/qwen3.6-plus:free'}
              availableModels={availableModels}
              loadingModels={loadingModels}
              onSave={handleSaveModel}
              disabled={!aiStatus?.configured}
            />

            <ModelSelector
              agent="fallback"
              label="Modelo de Respaldo"
              icon={Zap}
              iconColor="text-ama-amber"
              currentModel={aiStatus?.models?.fallback || 'nvidia/nemotron-3-super-120b-a12b:free'}
              availableModels={availableModels}
              loadingModels={loadingModels}
              onSave={handleSaveModel}
              disabled={!aiStatus?.configured}
            />
          </div>
        )}
      </div>

      {/* reCAPTCHA v3 Security Section */}
      <RecaptchaSettings />

      {/* SumUp Payment Integration Section (Ciclo 15 — L2 coherence completa) */}
      <SumupSettings />

      {/* Active Agents Section */}
      <div className="bg-ama-card border border-ama-border rounded-xl p-6">
        <h3 className="text-sm font-semibold text-ama-text mb-3">Agentes AI Activos</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between bg-ama-darker rounded-lg p-3 border border-ama-border">
            <div className="flex items-center gap-3">
              <MessageCircle size={16} className="text-blue-400" />
              <div>
                <p className="text-sm text-ama-text font-medium">Asistente de Clientes</p>
                <p className="text-xs text-ama-text-muted">Ayuda a clientes con el menú, recomendaciones y pedidos</p>
                {aiStatus?.models?.customer && (
                  <p className="text-xs text-blue-400/70 font-mono mt-0.5">{aiStatus.models.customer}</p>
                )}
              </div>
            </div>
            <span className={`px-2 py-1 text-xs rounded-full ${aiStatus?.configured ? 'bg-green-400/10 text-green-400' : 'bg-yellow-400/10 text-yellow-400'}`}>
              {aiStatus?.configured ? 'Activo' : 'Sin API Key'}
            </span>
          </div>
          <div className="flex items-center justify-between bg-ama-darker rounded-lg p-3 border border-ama-border">
            <div className="flex items-center gap-3">
              <BarChart3 size={16} className="text-purple-400" />
              <div>
                <p className="text-sm text-ama-text font-medium">Asistente de Negocio</p>
                <p className="text-xs text-ama-text-muted">Análisis de ventas, clientes, campañas e insights</p>
                {aiStatus?.models?.admin && (
                  <p className="text-xs text-purple-400/70 font-mono mt-0.5">{aiStatus.models.admin}</p>
                )}
              </div>
            </div>
            <span className={`px-2 py-1 text-xs rounded-full ${aiStatus?.configured ? 'bg-green-400/10 text-green-400' : 'bg-yellow-400/10 text-yellow-400'}`}>
              {aiStatus?.configured ? 'Activo' : 'Sin API Key'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState('products-parent');
  const [activeProductsSubtab, setActiveProductsSubtab] = useState('crud');
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-ama-darker">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-ama-darker/95 backdrop-blur-md border-b border-ama-border">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="p-2 text-ama-text-muted hover:text-ama-amber transition-colors cursor-pointer"
            >
              <ArrowLeft size={20} />
            </button>
            <h1 className="text-lg font-semibold text-ama-text">
              Panel <span className="text-ama-amber">ADM</span>
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-ama-text-muted">
              {user?.display_name}
            </span>
            <button
              onClick={logout}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-ama-text-muted hover:text-red-400 border border-ama-border hover:border-red-400/30 rounded-lg transition-colors cursor-pointer"
              title="Cerrar sesión"
            >
              <LogOut size={14} />
              Salir
            </button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="max-w-6xl mx-auto px-4 pt-4">
        <div className="flex gap-1 bg-ama-card rounded-xl p-1 mb-6 w-fit overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-ama-amber text-ama-darker'
                  : 'text-ama-text-muted hover:text-ama-text'
              }`}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'products-parent' && (
          <div>
            {/* Sub-tab navigation */}
            <div className="border-b border-ama-border mb-4">
              <div className="flex gap-1 overflow-x-auto">
                {PRODUCTS_SUBTABS.map(subtab => (
                  <button
                    key={subtab.id}
                    onClick={() => setActiveProductsSubtab(subtab.id)}
                    className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-all cursor-pointer whitespace-nowrap border-b-2 -mb-px ${
                      activeProductsSubtab === subtab.id
                        ? 'border-ama-amber text-ama-amber'
                        : 'border-transparent text-ama-text-muted hover:text-ama-text hover:border-ama-border'
                    }`}
                    title={subtab.description}
                  >
                    <subtab.icon size={16} />
                    {subtab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Sub-tab description */}
            <p className="text-xs text-ama-text-muted mb-4 px-1">
              {PRODUCTS_SUBTABS.find(s => s.id === activeProductsSubtab)?.description}
            </p>

            {/* Sub-tab content */}
            {activeProductsSubtab === 'crud' && <ProductsCrudPanel />}
            {activeProductsSubtab === 'analytics' && <ProductsTab />}
            {activeProductsSubtab === 'bulk-import' && <BulkImportTab />}
          </div>
        )}
        {activeTab === 'orders' && <OrdersTab />}
        {activeTab === 'customers' && <CustomersTab />}
        {activeTab === 'insights' && <InsightsTab />}
        {activeTab === 'settings' && <SettingsTab />}
        {activeTab === 'users' && <UsersTab />}
      </div>
    </div>
  );
}
