import { useState, useEffect, useCallback } from 'react';
import { Button, Modal, Badge, Spinner, EmptyState } from './ui';
import { formatCurrency } from '../lib/utils';
import { productsSvc, transactionsSvc, professionalsSvc } from '../services/salon';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Select } from './ui';
import type { Product } from '../types';

interface CartItem { product: Product; qty: number; }

const PAYMENT_METHODS = [
  { value: 'Efectivo', label: '💵 Efectivo' },
  { value: 'Billetera (Yape/Plin)', label: '📱 Yape / Plin' },
  { value: 'Transferencia', label: '🏦 Transferencia' },
  { value: 'Tarjeta', label: '💳 Tarjeta' },
  { value: 'Otros', label: '🔄 Otros' },
];

// HIGH-03: explicit map — avoids 'billeterayapeplin' from generic replace
const PAYMENT_METHOD_MAP: Record<string, string> = {
  'Efectivo': 'efectivo',
  'Billetera (Yape/Plin)': 'billetera',
  'Transferencia': 'transferencia',
  'Tarjeta': 'tarjeta',
  'Otros': 'otros',
};

const CATEGORIES = ['Todos', 'Venta', 'Insumo', 'Material', 'Equipo'];

export default function POS() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [professionals, setProfessionals] = useState<any[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('Todos');
  const [loading, setLoading] = useState(true);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [success, setSuccess] = useState(false);
  const [clientName, setClientName] = useState('');
  const [impulsedBy, setImpulsedBy] = useState('');
  const [payMethod, setPayMethod] = useState('Efectivo');
  const [processing, setProcessing] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [{ data: prods }, { data: profs }] = await Promise.all([
        productsSvc.getAll(),
        professionalsSvc.getAll()
      ]);
      // Only show products that can be sold (sale price > 0)
      setProducts((prods || []).filter((p: Product) => p.sale_price > 0 || p.price > 0));
      setProfessionals(profs || []);
    } catch (error) {
      console.error('Error loading POS data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = products.filter(p => {
    const q = search.toLowerCase();
    const matchSearch = !q || p.name.toLowerCase().includes(q);
    const matchCat = category === 'Todos' || p.category === category;
    return matchSearch && matchCat;
  });

  // CRIT-04: prevent adding more than available stock
  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(i => i.product.id === product.id);
      if (existing) {
        if (existing.qty >= product.stock) return prev; // no more stock
        return prev.map(i => i.product.id === product.id ? { ...i, qty: i.qty + 1 } : i);
      }
      if (product.stock <= 0) return prev;
      return [...prev, { product, qty: 1 }];
    });
  };

  const updateQty = (productId: string, delta: number) => {
    setCart(prev => prev
      .map(i => {
        if (i.product.id !== productId) return i;
        const newQty = i.qty + delta;
        // CRIT-04: cap at available stock
        if (newQty > i.product.stock) return i;
        return { ...i, qty: newQty };
      })
      .filter(i => i.qty > 0)
    );
  };

  const removeFromCart = (productId: string) => setCart(prev => prev.filter(i => i.product.id !== productId));

  const cartCount = cart.reduce((s, i) => s + i.qty, 0);
  const subtotal = cart.reduce((s, i) => s + (i.product.sale_price || i.product.price) * i.qty, 0);

  // Checkout
  const handleCheckout = async () => {
    if (cart.length === 0) return;

    // SEC-02: require authenticated user
    if (!user?.uid) {
      alert('Debes iniciar sesión para registrar una venta.');
      return;
    }

    // CRIT-04: validate stock before processing
    for (const item of cart) {
      if (item.qty > item.product.stock) {
        alert(`Stock insuficiente para "${item.product.name}". Disponible: ${item.product.stock}, solicitado: ${item.qty}.`);
        return;
      }
    }

    setProcessing(true);
    try {
      let total_commissions = 0;
      const prof = impulsedBy ? professionals.find(p => p.id === impulsedBy) : null;

      const items = cart.map(i => {
        const sale_price = i.product.sale_price || i.product.price;
        const commission_amount = prof ? (sale_price * (prof.commission_rate || 0)) * i.qty : 0;
        total_commissions += commission_amount;
        return {
          product_id: i.product.id,
          product_name: i.product.name,
          quantity: i.qty,
          unit_price: i.product.cost_price,
          sale_price,
          commission_amount,
          impulsed_by: impulsedBy || undefined,
        };
      });

      // 1. Create sale record
      await supabase.from('sales').insert({
        items,
        subtotal,
        total: subtotal,
        payment_method: payMethod as any,
        client_name: clientName || undefined,
        created_by: user.uid,
        total_commissions,
      });

      // 2. Deduct stock (CRIT-04: no silent Math.max — stock validated above)
      for (const item of cart) {
        await productsSvc.update(item.product.id, { stock: item.product.stock - item.qty });
      }

      // 3. Register transaction with HIGH-03 correct method mapping
      await transactionsSvc.create({
        type: 'venta', status: 'completed',
        category: 'Venta de Productos', amount: subtotal,
        method: (PAYMENT_METHOD_MAP[payMethod] || 'otros') as any,
        description: `Venta POS — ${items.length} producto(s)${clientName ? ` — ${clientName}` : ''}`,
        user_id: user.uid,
      });

      setCart([]);
      setClientName('');
      setImpulsedBy('');
      setPayMethod('Efectivo');
      setCheckoutOpen(false);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 4000);
      load(); // refresh stock
    } catch (err) {
      console.error(err);
      alert('Error al procesar la venta. Inténtalo nuevamente.');
    }
    setProcessing(false);
  };

  return (
    <div className="flex flex-col lg:flex-row h-full min-h-0 animate-fade-in bg-background">

      {/* ── Left: Product Catalog ────────────────────────── */}
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        {/* Catalog header */}
        <div className="px-8 py-6 border-b border-outline-variant/20 bg-surface-container-low/40 flex-shrink-0 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-4xl font-headline-md text-on-surface tracking-tight font-normal">Punto de Venta</h1>
            {success && (
              <div className="flex items-center gap-2 text-secondary text-sm font-bold animate-fade-in">
                <span className="material-symbols-outlined text-[18px] leading-none select-none">check_circle</span>
                <span>Venta registrada exitosamente</span>
              </div>
            )}
          </div>
          {/* Search */}
          <div className="relative">
            <span className="material-symbols-outlined absolute left-5 top-1/2 -translate-y-1/2 text-on-surface-variant/50 text-[18px] select-none">search</span>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar producto..."
              className="w-full pl-13 pr-12 py-3.5 bg-white border border-outline-variant/30 rounded-full text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary focus:shadow-md transition-all duration-300 font-sans"
              id="pos-search"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-5 top-1/2 -translate-y-1/2 text-on-surface-variant/60 hover:text-primary p-1 rounded-full hover:bg-surface-container-low transition-colors active:scale-90">
                <span className="material-symbols-outlined text-[16px] leading-none select-none">close</span>
              </button>
            )}
          </div>
          {/* Category tabs */}
          <div className="flex gap-2 mt-5 overflow-x-auto pb-1 select-none font-sans scrollbar-thin">
            {CATEGORIES.map(cat => (
              <button key={cat} onClick={() => setCategory(cat)}
                className={`px-5 py-2 text-xs font-bold rounded-full whitespace-nowrap transition-all duration-300 cursor-pointer
                  ${category === cat 
                    ? 'bg-primary text-white shadow-md shadow-primary/10' 
                    : 'bg-white border border-outline-variant/20 text-on-surface-variant/70 hover:border-outline-variant/60 hover:text-on-surface'
                  }`}>
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Product grid */}
        <div className="flex-1 overflow-y-auto p-8">
          {loading ? (
            <div className="flex justify-center py-16"><Spinner size="lg" /></div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<span className="material-symbols-outlined text-[48px] text-outline/50">shopping_bag</span>}
              title="Sin productos"
              description={search ? 'Intenta con otro término.' : 'Agrega productos en el módulo de Inventario.'}
            />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-6 select-none">
              {filtered.map(p => {
                const inCart = cart.find(i => i.product.id === p.id);
                const outOfStock = p.stock <= 0;
                return (
                  <button key={p.id} onClick={() => !outOfStock && addToCart(p)} disabled={outOfStock}
                    className={`relative text-left bg-white border rounded-[2rem] p-6 transition-all duration-300 group flex flex-col justify-between min-h-[170px] cursor-pointer active:scale-98
                      ${outOfStock ? 'opacity-40 cursor-not-allowed border-outline-variant/20 bg-surface-container-low' :
                      inCart ? 'border-primary shadow-lg ring-1 ring-primary/20' : 'border-outline-variant/30 hover:border-primary hover:shadow-lg'
                    }`}>
                    {inCart && (
                      <div className="absolute top-4 right-4 w-6 h-6 bg-primary rounded-full flex items-center justify-center shadow-md animate-scale-up">
                        <span className="text-white text-xs font-bold font-sans">{inCart.qty}</span>
                      </div>
                    )}
                    <div className="mb-4 pr-6">
                      <p className="text-xs font-bold text-on-surface leading-snug truncate group-hover:text-primary transition-colors">{p.name}</p>
                      <Badge variant="peach" className="text-[9px] mt-2 uppercase tracking-wider py-0.5 px-2 font-sans">{p.category}</Badge>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-primary font-sans">{formatCurrency(p.sale_price || p.price)}</p>
                      <p className="text-[10px] text-on-surface-variant/60 font-bold uppercase tracking-wider mt-1.5 font-sans">Stock: {p.stock} {p.unit}</p>
                    </div>
                    {outOfStock && (
                      <div className="absolute inset-0 flex items-center justify-center bg-white/85 backdrop-blur-[1px] text-xs font-bold text-error uppercase tracking-widest rounded-[2rem]">Sin stock</div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Right: Cart ──────────────────────────────────── */}
      <div className="w-full lg:w-80 xl:w-[25rem] flex flex-col border-t lg:border-t-0 lg:border-l border-outline-variant/20 bg-white flex-shrink-0 shadow-lg lg:shadow-none select-none">
        {/* Cart header */}
        <div className="px-6 py-6 border-b border-outline-variant/20 flex-shrink-0 bg-surface/30">
          <div className="flex items-center justify-between">
            <h2 className="text-[10px] font-bold text-on-surface-variant/80 uppercase tracking-[0.2em] flex items-center gap-2 font-sans">
              <span className="material-symbols-outlined text-[18px] text-primary select-none">shopping_cart</span>
              <span>Carrito</span>
            </h2>
            {cartCount > 0 && (
              <div className="flex items-center gap-3">
                <Badge variant="peach" className="text-[10px] tracking-wide py-0.5 px-2.5 font-sans">{cartCount} items</Badge>
                <button onClick={() => setCart([])} className="text-xs text-on-surface-variant/50 hover:text-error transition-colors font-bold uppercase tracking-wider cursor-pointer">
                  Limpiar
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Cart items */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-16 text-center select-none animate-fade-in">
              <span className="material-symbols-outlined text-[40px] text-outline/30 mb-4">shopping_cart</span>
              <p className="text-sm font-headline-sm text-on-surface mb-1">Carrito vacío</p>
              <p className="text-xs text-on-surface-variant/60">Selecciona productos del catálogo</p>
            </div>
          ) : (
            cart.map(({ product: p, qty }) => (
              <div key={p.id} className="flex items-center gap-4 p-4 bg-surface-container-low rounded-[1.5rem] border border-outline-variant/20 animate-fade-in">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-on-surface truncate leading-snug">{p.name}</p>
                  <p className="text-[10px] text-on-surface-variant/60 font-bold mt-1 font-sans">{formatCurrency(p.sale_price || p.price)} c/u</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => updateQty(p.id, -1)}
                    className="w-6 h-6 rounded-full flex items-center justify-center bg-white border border-outline-variant/30 text-on-surface hover:border-primary hover:text-primary transition-all shadow-sm cursor-pointer active:scale-90">
                    <span className="material-symbols-outlined text-[12px] leading-none select-none">remove</span>
                  </button>
                  <span className="w-6 text-center text-xs font-bold text-on-surface font-sans">{qty}</span>
                  <button onClick={() => updateQty(p.id, 1)}
                    className="w-6 h-6 rounded-full flex items-center justify-center bg-white border border-outline-variant/30 text-on-surface hover:border-primary hover:text-primary transition-all shadow-sm cursor-pointer active:scale-90">
                    <span className="material-symbols-outlined text-[12px] leading-none select-none">add</span>
                  </button>
                  <button onClick={() => removeFromCart(p.id)}
                    className="w-6 h-6 rounded-full flex items-center justify-center text-on-surface-variant/40 hover:text-error hover:bg-error-container/20 transition-all ml-1 cursor-pointer active:scale-90"
                    aria-label="Eliminar producto">
                    <span className="material-symbols-outlined text-[16px] leading-none select-none">delete</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Cart footer */}
        <div className="px-6 py-6 border-t border-outline-variant/20 space-y-5 bg-surface-container-low/40 flex-shrink-0">
          {cart.length > 0 && (
            <div className="space-y-2.5">
              {cart.map(({ product: p, qty }) => (
                <div key={p.id} className="flex justify-between text-xs text-on-surface-variant font-medium">
                  <span className="truncate max-w-[210px]">{p.name} × {qty}</span>
                  <span className="font-sans">{formatCurrency((p.sale_price || p.price) * qty)}</span>
                </div>
              ))}
              <div className="flex justify-between text-sm font-bold text-on-surface border-t border-outline-variant/20 pt-4 mt-4 uppercase tracking-wider font-sans">
                <span>TOTAL</span>
                <span className="text-primary text-lg font-extrabold">{formatCurrency(subtotal)}</span>
              </div>
            </div>
          )}
          <Button
            className="w-full py-4 text-xs font-bold uppercase tracking-[0.2em] shadow-sm hover:shadow-md cursor-pointer"
            disabled={cart.length === 0}
            onClick={() => setCheckoutOpen(true)}
            id="pos-checkout-btn"
          >
            Cobrar {cart.length > 0 ? formatCurrency(subtotal) : ''}
          </Button>
        </div>
      </div>

      {/* ── Checkout Modal ────────────────────────────────── */}
      <Modal open={checkoutOpen} onClose={() => setCheckoutOpen(false)} title="Confirmar Venta" size="sm"
        footer={LayoutFooter()}
      >
        <div className="space-y-6 font-sans">
          {/* Summary */}
          <div className="bg-surface-container-low/60 rounded-[1.5rem] p-5 border border-outline-variant/20">
            <div className="space-y-2.5 mb-4">
              {cart.map(({ product: p, qty }) => (
                <div key={p.id} className="flex justify-between text-xs text-on-surface-variant font-medium">
                  <span className="truncate max-w-[200px]">{p.name} × {qty}</span>
                  <span>{formatCurrency((p.sale_price || p.price) * qty)}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between text-sm font-bold text-on-surface border-t border-outline-variant/20 pt-4">
              <span>Total a cobrar</span>
              <span className="text-primary font-bold text-base">{formatCurrency(subtotal)}</span>
            </div>
          </div>

          {/* Payment method */}
          <div className="select-none">
            <p className="text-[10px] font-bold text-on-surface-variant/80 uppercase tracking-[0.2em] mb-3">Método de pago</p>
            <div className="grid grid-cols-1 gap-2">
              {PAYMENT_METHODS.map(m => (
                <button key={m.value} onClick={() => setPayMethod(m.value)}
                  className={`flex items-center gap-3 px-5 py-3 rounded-full border text-xs font-bold uppercase tracking-wider transition-all duration-300 text-left cursor-pointer active:scale-98
                    ${payMethod === m.value 
                      ? 'border-primary bg-primary-fixed text-primary shadow-inner' 
                      : 'border-outline-variant/20 text-on-surface-variant/70 bg-white hover:border-outline-variant/50 hover:text-on-surface'
                    }`}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Optional client name */}
          <div>
            <label className="text-[10px] font-bold text-on-surface-variant/80 uppercase tracking-[0.2em] block mb-2 px-2">
              Cliente (opcional)
            </label>
            <input value={clientName} onChange={e => setClientName(e.target.value)}
              placeholder="Nombre del cliente"
              className="w-full bg-surface-container-low border border-transparent rounded-full px-6 py-3.5 text-sm text-on-surface placeholder:text-outline focus:outline-none focus:border-primary transition-all duration-300 font-sans"
              id="pos-client-name"
            />
          </div>

          {/* Optional Vendedor */}
          <div>
            <Select 
              label="Vendedor / Profesional (opcional)" 
              value={impulsedBy} 
              onChange={e => setImpulsedBy(e.target.value)}
              options={[{ value: '', label: '— Sin vendedor asignado —' }, ...professionals.map(p => ({
                value: p.id, label: p.name
              }))]}
            />
            {impulsedBy && (
              <p className="text-[10px] text-primary mt-1 px-2 font-bold font-sans">
                Se registrará comisión del {(professionals.find(p => p.id === impulsedBy)?.commission_rate || 0) * 100}% para {professionals.find(p => p.id === impulsedBy)?.name.split(' ')[0]}
              </p>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );

  function LayoutFooter() {
    return (
      <div className="flex justify-end gap-3 w-full font-sans">
        <Button variant="ghost" onClick={() => setCheckoutOpen(false)} type="button" className="text-xs uppercase tracking-wider px-6 py-3">Cancelar</Button>
        <Button loading={processing} onClick={handleCheckout} type="button" className="text-xs uppercase tracking-wider px-6 py-3">
          Registrar venta
        </Button>
      </div>
    );
  }
}
