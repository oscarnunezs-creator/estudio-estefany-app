import React, { useState, useEffect, useCallback } from 'react';
import { Button, Modal, Badge, Spinner, EmptyState, Input, Select, Card, Pagination } from './ui';
import { suppliersSvc, purchasesSvc, debtsSvc, productsSvc, cashRecordsSvc, transactionsSvc } from '../services/salon';
import Papa from 'papaparse';
import type { Supplier, Purchase, SupplierDebt, Product } from '../types';

export default function Suppliers() {
  const [activeTab, setActiveTab] = useState<'suppliers' | 'purchases' | 'debts'>('suppliers');
  
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [debts, setDebts] = useState<SupplierDebt[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Modals
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [isDebtModalOpen, setIsDebtModalOpen] = useState(false);
  
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [selectedDebt, setSelectedDebt] = useState<SupplierDebt | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Pagination states
  const [suppliersPage, setSuppliersPage] = useState(1);
  const [purchasesPage, setPurchasesPage] = useState(1);
  const [debtsPage, setDebtsPage] = useState(1);
  const itemsPerPage = 9;
  const tableItemsPerPage = 10;

  // Forms
  const [supplierForm, setSupplierForm] = useState({
    name: '', contact_name: '', phone: '', email: '', address: '',
    category: '', delivery_days: '', payment_conditions: '', ruc: '', notes: ''
  });

  const [purchaseForm, setPurchaseForm] = useState({
    supplier_id: '',
    date: new Date().toISOString().split('T')[0],
    payment_method: 'efectivo',
    due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    items: [] as { product_id: string; product_name: string; quantity: number; unit_price: number }[]
  });

  const [paymentAmount, setPaymentAmount] = useState(0);
  const [debtPaymentMethod, setDebtPaymentMethod] = useState('transferencia');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [supRes, purRes, debtRes, prodRes] = await Promise.all([
        suppliersSvc.getAll(),
        purchasesSvc.getAll(),
        debtsSvc.getAll(),
        productsSvc.getAll()
      ]);
      if (supRes.data) setSuppliers(supRes.data);
      if (purRes.data) setPurchases(purRes.data);
      if (debtRes.data) setDebts(debtRes.data);
      if (prodRes.data) setProducts(prodRes.data);
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // --- SUPPLIERS LOGIC ---
  const handleOpenSupplierModal = (supplier?: Supplier) => {
    if (supplier) {
      setEditingSupplier(supplier);
      setSupplierForm({
        name: supplier.name, contact_name: supplier.contact_name || '', phone: supplier.phone || '',
        email: supplier.email || '', address: supplier.address || '', category: supplier.category || '',
        delivery_days: supplier.delivery_days || '', payment_conditions: supplier.payment_conditions || '',
        ruc: supplier.ruc || '', notes: supplier.notes || ''
      });
    } else {
      setEditingSupplier(null);
      setSupplierForm({
        name: '', contact_name: '', phone: '', email: '', address: '',
        category: '', delivery_days: '', payment_conditions: '', ruc: '', notes: ''
      });
    }
    setIsSupplierModalOpen(true);
  };

  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      if (editingSupplier) {
        await suppliersSvc.update(editingSupplier.id, { ...supplierForm, active: true });
      } else {
        await suppliersSvc.create({ ...supplierForm, active: true });
      }
      setIsSupplierModalOpen(false);
      loadData();
    } catch (err) {
      console.error('Error saving supplier:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteSupplier = async (id: string) => {
    if (!window.confirm('¿Seguro que deseas eliminar este proveedor?')) return;
    try {
      await suppliersSvc.delete(id);
      loadData();
    } catch (err) {
      console.error('Error deleting supplier:', err);
    }
  };

  const handleExportSuppliers = () => {
    const rows = suppliers.map(s => ({
      nombre: s.name,
      contacto: s.contact_name || '',
      telefono: s.phone || '',
      email: s.email || '',
      direccion: s.address || '',
      categoria: s.category || '',
      dias_entrega: s.delivery_days || '',
      condiciones_pago: s.payment_conditions || '',
      ruc: s.ruc || '',
      notas: s.notes || '',
      estado: s.active ? 'Activo' : 'Inactivo'
    }));
    if (rows.length === 0) return alert('No hay proveedores para exportar.');
    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `proveedores.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportSuppliers = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        setIsSaving(true);
        let count = 0;
        try {
          for (const row of results.data as any[]) {
            const name = row['nombre'] || row['Nombre'];
            if (!name) continue;
            
            await suppliersSvc.create({
              name,
              contact_name: row['contacto'] || row['Contacto'] || '',
              phone: row['telefono'] || row['Teléfono'] || '',
              email: row['email'] || row['Email'] || '',
              address: row['direccion'] || row['Dirección'] || '',
              category: row['categoria'] || row['Categoría'] || '',
              delivery_days: row['dias_entrega'] || row['Días Entrega'] || '',
              payment_conditions: row['condiciones_pago'] || row['Condiciones Pago'] || '',
              ruc: row['ruc'] || row['RUC'] || '',
              notes: row['notas'] || row['Notas'] || '',
              active: (row['estado'] || row['Estado']) !== 'Inactivo'
            });
            count++;
          }
          alert(`¡Se importaron ${count} proveedores exitosamente!`);
          loadData();
        } catch (err) {
          console.error(err);
          alert('Error al importar proveedores.');
        } finally {
          setIsSaving(false);
          e.target.value = '';
        }
      }
    });
  };

  // --- PURCHASES LOGIC ---
  const handleAddPurchaseItem = () => {
    if (products.length === 0) return;
    setPurchaseForm(prev => ({
      ...prev,
      items: [...prev.items, { product_id: products[0].id, product_name: products[0].name, quantity: 1, unit_price: products[0].cost_price || 0 }]
    }));
  };

  const handleSavePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (purchaseForm.items.length === 0) return alert('Añade al menos un producto a la compra.');
    if (!purchaseForm.supplier_id) return alert('Selecciona un proveedor.');

    setIsSaving(true);
    try {
      const supplier = suppliers.find(s => s.id === purchaseForm.supplier_id);
      const totalAmount = purchaseForm.items.reduce((acc, item) => acc + (item.quantity * item.unit_price), 0);

      // 1. Create Purchase
      const { data: newPurchase, error: purchaseErr } = await purchasesSvc.create({
        supplier_id: purchaseForm.supplier_id,
        supplier_name: supplier?.name || 'Desconocido',
        date: purchaseForm.date,
        items: purchaseForm.items,
        total_amount: totalAmount,
        payment_method: purchaseForm.payment_method,
        status: purchaseForm.payment_method === 'credit' ? 'pending_payment' : 'paid',
        active: true
      });
      if (purchaseErr) throw purchaseErr;

      // 2. Update Stock sequentially
      for (const item of purchaseForm.items) {
        const prod = products.find(p => p.id === item.product_id);
        if (prod) {
          await productsSvc.update(prod.id, { stock: prod.stock + item.quantity });
        }
      }

      // 3. Handle Debt or Cash Record deduction
      if (purchaseForm.payment_method === 'credit') {
        await debtsSvc.create({
          supplier_id: purchaseForm.supplier_id,
          supplier_name: supplier?.name || 'Desconocido',
          purchase_id: newPurchase.id,
          total_amount: totalAmount,
          remaining_amount: totalAmount,
          due_date: purchaseForm.due_date,
          status: 'pending',
          payments: []
        });
      } else if (purchaseForm.payment_method === 'efectivo') {
        const { data: todayCash } = await cashRecordsSvc.getToday();
        if (todayCash && todayCash.status === 'open') {
          await transactionsSvc.create({
            cash_record_id: todayCash.id,
            type: 'expense',
            status: 'completed',
            category: 'Insumos',
            amount: totalAmount,
            method: 'efectivo',
            description: `Compra a ${supplier?.name}`,
            user_id: 'sistema' // or active user ID
          });
        }
      }

      setIsPurchaseModalOpen(false);
      setPurchaseForm({
        supplier_id: '',
        date: new Date().toISOString().split('T')[0],
        payment_method: 'efectivo',
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        items: []
      });
      loadData();
    } catch (err) {
      console.error('Error procesando compra:', err);
      alert('Error al registrar la compra.');
    } finally {
      setIsSaving(false);
    }
  };

  // --- DEBTS LOGIC ---
  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDebt) return;
    setIsSaving(true);
    try {
      const newRemaining = selectedDebt.remaining_amount - paymentAmount;
      const newStatus = newRemaining <= 0 ? 'paid' : 'pending';
      const payments = selectedDebt.payments || [];
      payments.push({
        date: new Date().toISOString(),
        amount: paymentAmount,
        method: debtPaymentMethod
      });

      await debtsSvc.update(selectedDebt.id, {
        remaining_amount: newRemaining,
        status: newStatus,
        payments
      });

      // Register Transaction (if applicable)
      if (debtPaymentMethod === 'efectivo') {
        const { data: todayCash } = await cashRecordsSvc.getToday();
        if (todayCash && todayCash.status === 'open') {
           await transactionsSvc.create({
            cash_record_id: todayCash.id,
            type: 'expense',
            status: 'completed',
            category: 'Pago Proveedor',
            amount: paymentAmount,
            method: 'efectivo',
            description: `Abono de deuda a ${selectedDebt.supplier_name}`,
            user_id: 'sistema'
          });
        }
      }

      setIsDebtModalOpen(false);
      setSelectedDebt(null);
      setPaymentAmount(0);
      loadData();
    } catch (err) {
      console.error(err);
      alert('Error al registrar el pago.');
    } finally {
      setIsSaving(false);
    }
  };

  const filteredSuppliers = suppliers.filter(s => 
    s.name.toLowerCase().includes(search.toLowerCase()) || 
    (s.category || '').toLowerCase().includes(search.toLowerCase())
  );

  const paginatedSuppliers = filteredSuppliers.slice((suppliersPage - 1) * itemsPerPage, suppliersPage * itemsPerPage);
  const paginatedPurchases = purchases.slice((purchasesPage - 1) * tableItemsPerPage, purchasesPage * tableItemsPerPage);
  const filteredDebts = debts.filter(d => d.status !== 'paid');
  const paginatedDebts = filteredDebts.slice((debtsPage - 1) * tableItemsPerPage, debtsPage * tableItemsPerPage);

  // Reset pages on search/tab change
  useEffect(() => {
    setSuppliersPage(1);
    setPurchasesPage(1);
    setDebtsPage(1);
  }, [search, activeTab]);

  return (
    <div className="p-4 md:p-8 space-y-8 animate-fade-in bg-background flex-1 overflow-y-auto pb-24">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-4xl font-headline-md text-on-surface tracking-tight font-normal">
            Proveedores y Compras
          </h1>
          <p className="text-on-surface-variant mt-2 max-w-xl">
            Directorio logístico, registro de compras con aumento de stock y cuentas por pagar.
          </p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          {activeTab === 'suppliers' && (
            <>
              <input type="file" id="import-suppliers" className="hidden" accept=".csv" onChange={handleImportSuppliers} disabled={isSaving} />
              <Button variant="ghost" onClick={() => document.getElementById('import-suppliers')?.click()} disabled={isSaving}>
                {isSaving ? <Spinner size="sm" /> : <><span className="material-symbols-outlined mr-2">upload</span>Importar</>}
              </Button>
              <Button variant="ghost" onClick={handleExportSuppliers} disabled={isSaving}>
                <span className="material-symbols-outlined mr-2">download</span>Exportar
              </Button>
              <Button variant="primary" onClick={() => handleOpenSupplierModal()} className="shadow-lg shadow-primary/20">
                <span className="material-symbols-outlined mr-2">add</span> Nuevo Proveedor
              </Button>
            </>
          )}
          {activeTab === 'purchases' && (
            <Button variant="primary" onClick={() => setIsPurchaseModalOpen(true)} className="shadow-lg shadow-primary/20">
              <span className="material-symbols-outlined mr-2">shopping_bag</span> Registrar Compra
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-outline-variant/30 pb-4 overflow-x-auto">
        <button 
          onClick={() => setActiveTab('suppliers')}
          className={`px-6 py-2 rounded-full font-medium transition-all flex items-center gap-2 ${activeTab === 'suppliers' ? 'bg-primary text-white' : 'bg-surface-container hover:bg-surface-container-high text-on-surface-variant'}`}
        >
          <span className="material-symbols-outlined text-sm">local_shipping</span>
          Directorio
        </button>
        <button 
          onClick={() => setActiveTab('purchases')}
          className={`px-6 py-2 rounded-full font-medium transition-all flex items-center gap-2 ${activeTab === 'purchases' ? 'bg-primary text-white' : 'bg-surface-container hover:bg-surface-container-high text-on-surface-variant'}`}
        >
          <span className="material-symbols-outlined text-sm">receipt_long</span>
          Historial de Compras
        </button>
        <button 
          onClick={() => setActiveTab('debts')}
          className={`px-6 py-2 rounded-full font-medium transition-all flex items-center gap-2 ${activeTab === 'debts' ? 'bg-primary text-white' : 'bg-surface-container hover:bg-surface-container-high text-on-surface-variant'}`}
        >
          <span className="material-symbols-outlined text-sm">account_balance_wallet</span>
          Cuentas por Pagar
          {debts.filter(d => d.status === 'pending').length > 0 && (
            <span className="w-2 h-2 bg-error rounded-full ml-1" />
          )}
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : (
        <>
          {/* TAB: SUPPLIERS */}
          {activeTab === 'suppliers' && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-surface-container-low p-4 rounded-[2rem] border border-outline-variant/30 flex items-center max-w-md">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant/50">search</span>
                <Input
                  placeholder="Buscar por nombre o categoría..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-12 bg-surface border-transparent"
                />
              </div>

              {filteredSuppliers.length === 0 ? (
                <EmptyState icon={<span className="material-symbols-outlined text-[48px]">local_shipping</span>} title="Directorio Vacío" description="No se encontraron proveedores." />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {paginatedSuppliers.map(supplier => (
                    <div key={supplier.id} className="group bg-surface-container-lowest rounded-[2rem] p-6 border border-outline-variant/20 shadow-sm hover:shadow-lg transition-all">
                      <div className="flex justify-between items-start mb-4">
                        <Badge variant="peach" className="px-3 py-1 font-semibold">{supplier.category || 'General'}</Badge>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => handleOpenSupplierModal(supplier)} className="p-2 text-on-surface-variant hover:text-primary transition-colors rounded-full hover:bg-surface-container-high">
                            <span className="material-symbols-outlined text-sm">edit</span>
                          </button>
                          <button onClick={() => handleDeleteSupplier(supplier.id)} className="p-2 text-on-surface-variant hover:text-error transition-colors rounded-full hover:bg-error-container">
                            <span className="material-symbols-outlined text-sm">delete</span>
                          </button>
                        </div>
                      </div>
                      <h3 className="font-serif text-2xl text-on-surface font-semibold mb-1 truncate">{supplier.name}</h3>
                      <p className="text-on-surface-variant text-sm mb-4">RUC: {supplier.ruc || 'N/A'}</p>
                      <div className="space-y-3 pt-4 border-t border-outline-variant/10">
                        <div className="flex items-center gap-3 text-sm text-on-surface-variant">
                          <span className="material-symbols-outlined text-[18px]">person</span> <span className="truncate">{supplier.contact_name || 'Sin contacto'}</span>
                        </div>
                        <div className="flex items-center gap-3 text-sm text-on-surface-variant">
                          <span className="material-symbols-outlined text-[18px]">phone</span> <span>{supplier.phone || 'Sin teléfono'}</span>
                        </div>
                        <div className="flex items-center gap-3 text-sm text-on-surface-variant">
                          <span className="material-symbols-outlined text-[18px]">local_shipping</span> <span className="truncate">{supplier.delivery_days || 'No especificado'}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {filteredSuppliers.length > itemsPerPage && (
                <Pagination
                  currentPage={suppliersPage}
                  totalPages={Math.ceil(filteredSuppliers.length / itemsPerPage)}
                  onPageChange={setSuppliersPage}
                />
              )}
            </div>
          )}

          {/* TAB: PURCHASES */}
          {activeTab === 'purchases' && (
            <div className="space-y-6 animate-fade-in">
              {purchases.length === 0 ? (
                <EmptyState icon={<span className="material-symbols-outlined text-[48px]">receipt_long</span>} title="Sin Compras" description="Registra compras para actualizar tu inventario." />
              ) : (
                <Card className="overflow-hidden p-0 border-none shadow-sm mb-6">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead className="bg-surface-container-low text-on-surface-variant text-sm border-b border-outline-variant/30">
                        <tr>
                          <th className="px-6 py-4 font-medium rounded-tl-2xl">Fecha</th>
                          <th className="px-6 py-4 font-medium">Proveedor</th>
                          <th className="px-6 py-4 font-medium">Items</th>
                          <th className="px-6 py-4 font-medium">Total</th>
                          <th className="px-6 py-4 font-medium rounded-tr-2xl">Pago</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant/20 bg-surface-container-lowest">
                        {paginatedPurchases.map(p => (
                          <tr key={p.id} className="hover:bg-surface-container-low/50 transition-colors">
                            <td className="px-6 py-4 text-on-surface">{new Date(p.date).toLocaleDateString('es-ES')}</td>
                            <td className="px-6 py-4 text-on-surface font-medium">{p.supplier_name}</td>
                            <td className="px-6 py-4">
                              <div className="flex flex-wrap gap-1">
                                {p.items.map((item, i) => (
                                  <Badge key={i} variant="default" className="text-[10px]">{item.quantity}x {item.product_name}</Badge>
                                ))}
                              </div>
                            </td>
                            <td className="px-6 py-4 font-bold text-on-surface">S/ {p.total_amount.toFixed(2)}</td>
                            <td className="px-6 py-4">
                              {p.payment_method === 'credit' ? (
                                <Badge variant="warning">Crédito</Badge>
                              ) : (
                                <Badge variant="success" className="capitalize">{p.payment_method}</Badge>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}

              {purchases.length > tableItemsPerPage && (
                <Pagination
                  currentPage={purchasesPage}
                  totalPages={Math.ceil(purchases.length / tableItemsPerPage)}
                  onPageChange={setPurchasesPage}
                />
              )}
            </div>
          )}

          {/* TAB: DEBTS */}
          {activeTab === 'debts' && (
            <div className="space-y-6 animate-fade-in">
              <div className="grid grid-cols-1 gap-4 mb-6">
                {paginatedDebts.map(debt => (
                  <Card key={debt.id} className="flex flex-col md:flex-row md:items-center justify-between gap-6 hover:shadow-md transition-shadow">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-error-container text-on-error-container flex items-center justify-center font-serif text-xl font-bold">
                        {debt.supplier_name.charAt(0)}
                      </div>
                      <div>
                        <h3 className="font-serif text-xl text-on-surface font-bold">{debt.supplier_name}</h3>
                        <p className="text-sm text-on-surface-variant flex items-center gap-1 mt-1">
                          <span className="material-symbols-outlined text-[16px] text-error">event</span>
                          Vence: {new Date(debt.due_date).toLocaleDateString('es-ES')}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-8 md:gap-12">
                      <div>
                        <p className="text-xs text-on-surface-variant uppercase tracking-wider font-semibold mb-1">Total</p>
                        <p className="text-on-surface font-medium">S/ {debt.total_amount.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-error uppercase tracking-wider font-semibold mb-1">Pendiente</p>
                        <p className="text-error font-bold text-2xl">S/ {debt.remaining_amount.toFixed(2)}</p>
                      </div>
                      <Button 
                        variant="primary" 
                        onClick={() => { setSelectedDebt(debt); setPaymentAmount(debt.remaining_amount); setIsDebtModalOpen(true); }}
                      >
                        Registrar Pago
                      </Button>
                    </div>
                  </Card>
                ))}
                {filteredDebts.length === 0 && (
                  <EmptyState icon={<span className="material-symbols-outlined text-[48px] text-success">task_alt</span>} title="Todo al día" description="No tienes deudas pendientes con proveedores." />
                )}
              </div>

              {filteredDebts.length > tableItemsPerPage && (
                <Pagination
                  currentPage={debtsPage}
                  totalPages={Math.ceil(filteredDebts.length / tableItemsPerPage)}
                  onPageChange={setDebtsPage}
                />
              )}
            </div>
          )}
        </>
      )}

      {/* --- MODALS --- */}
      <Modal open={isSupplierModalOpen} onClose={() => !isSaving && setIsSupplierModalOpen(false)} title={editingSupplier ? "Editar Proveedor" : "Nuevo Proveedor"}>
        <form onSubmit={handleSaveSupplier} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="col-span-1 md:col-span-2">
              <Input label="Razón Social / Nombre *" required value={supplierForm.name} onChange={e => setSupplierForm({ ...supplierForm, name: e.target.value })} />
            </div>
            <Input label="RUC" value={supplierForm.ruc} onChange={e => setSupplierForm({ ...supplierForm, ruc: e.target.value })} />
            <Input label="Categoría" value={supplierForm.category} onChange={e => setSupplierForm({ ...supplierForm, category: e.target.value })} />
            <div className="col-span-1 md:col-span-2 pt-4 pb-2"><h4 className="font-serif text-lg text-on-surface">Datos de Contacto</h4></div>
            <Input label="Contacto" value={supplierForm.contact_name} onChange={e => setSupplierForm({ ...supplierForm, contact_name: e.target.value })} />
            <Input label="Teléfono *" required value={supplierForm.phone} onChange={e => setSupplierForm({ ...supplierForm, phone: e.target.value })} />
            <div className="col-span-1 md:col-span-2 pt-4 pb-2"><h4 className="font-serif text-lg text-on-surface">Logística Comercial</h4></div>
            <Input label="Días de Entrega" value={supplierForm.delivery_days} onChange={e => setSupplierForm({ ...supplierForm, delivery_days: e.target.value })} />
            <Input label="Condiciones de Pago" value={supplierForm.payment_conditions} onChange={e => setSupplierForm({ ...supplierForm, payment_conditions: e.target.value })} />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="ghost" onClick={() => setIsSupplierModalOpen(false)}>Cancelar</Button>
            <Button type="submit" variant="primary" disabled={isSaving}>{isSaving ? <Spinner size="sm" /> : 'Guardar'}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={isPurchaseModalOpen} onClose={() => !isSaving && setIsPurchaseModalOpen(false)} title="Registrar Compra a Proveedor">
        <form onSubmit={handleSavePurchase} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select 
              label="Proveedor *" 
              value={purchaseForm.supplier_id} 
              onChange={e => setPurchaseForm({...purchaseForm, supplier_id: e.target.value})}
              options={[
                { value: '', label: 'Seleccionar proveedor...' },
                ...suppliers.map(s => ({ value: s.id, label: s.name }))
              ]}
            />
            <Input type="date" label="Fecha" value={purchaseForm.date} onChange={e => setPurchaseForm({...purchaseForm, date: e.target.value})} />
            <Select 
              label="Método de Pago" 
              value={purchaseForm.payment_method} 
              onChange={e => setPurchaseForm({...purchaseForm, payment_method: e.target.value})}
              options={[
                { value: 'efectivo', label: 'Efectivo (Caja)' },
                { value: 'transferencia', label: 'Transferencia' },
                { value: 'credit', label: 'Crédito (Cuenta por Pagar)' }
              ]}
            />
            {purchaseForm.payment_method === 'credit' && (
              <Input type="date" label="Fecha de Vencimiento" value={purchaseForm.due_date} onChange={e => setPurchaseForm({...purchaseForm, due_date: e.target.value})} />
            )}
          </div>
          
          <div className="space-y-4 pt-4 border-t border-outline-variant/30">
            <div className="flex justify-between items-center">
              <h4 className="font-serif text-lg text-on-surface">Productos y Stock</h4>
              <Button type="button" variant="subtle" onClick={handleAddPurchaseItem} className="text-xs py-1">
                <span className="material-symbols-outlined text-sm mr-1">add</span> Añadir Ítem
              </Button>
            </div>
            {purchaseForm.items.map((item, index) => (
              <div key={index} className="flex gap-2 items-end bg-surface-container-lowest p-3 rounded-2xl border border-outline-variant/20">
                <div className="flex-1">
                  <Select 
                    label="Producto" 
                    value={item.product_id}
                    onChange={e => {
                      const prod = products.find(p => p.id === e.target.value);
                      const newItems = [...purchaseForm.items];
                      newItems[index] = { ...item, product_id: e.target.value, product_name: prod?.name || '', unit_price: prod?.cost_price || 0 };
                      setPurchaseForm({...purchaseForm, items: newItems});
                    }}
                    options={products.map(p => ({ value: p.id, label: p.name }))}
                  />
                </div>
                <div className="w-24">
                  <Input type="number" label="Cant." value={item.quantity} onChange={e => {
                    const newItems = [...purchaseForm.items];
                    newItems[index].quantity = Number(e.target.value);
                    setPurchaseForm({...purchaseForm, items: newItems});
                  }} />
                </div>
                <div className="w-32">
                  <Input type="number" label="Precio Unit." value={item.unit_price} onChange={e => {
                    const newItems = [...purchaseForm.items];
                    newItems[index].unit_price = Number(e.target.value);
                    setPurchaseForm({...purchaseForm, items: newItems});
                  }} />
                </div>
                <button type="button" onClick={() => {
                  const newItems = purchaseForm.items.filter((_, i) => i !== index);
                  setPurchaseForm({...purchaseForm, items: newItems});
                }} className="p-2 mb-1 text-error hover:bg-error-container rounded-xl transition-colors">
                  <span className="material-symbols-outlined">delete</span>
                </button>
              </div>
            ))}
            <div className="text-right pt-4">
              <p className="text-sm text-on-surface-variant">Total Compra</p>
              <p className="text-3xl font-bold text-on-surface">
                S/ {purchaseForm.items.reduce((acc, item) => acc + (item.quantity * item.unit_price), 0).toFixed(2)}
              </p>
            </div>
          </div>
          
          <div className="flex justify-end gap-3 pt-4 border-t border-outline-variant/30">
            <Button type="button" variant="ghost" onClick={() => setIsPurchaseModalOpen(false)}>Cancelar</Button>
            <Button type="submit" variant="primary" disabled={isSaving}>{isSaving ? <Spinner size="sm" /> : 'Confirmar Compra'}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={isDebtModalOpen} onClose={() => !isSaving && setIsDebtModalOpen(false)} title="Registrar Pago a Proveedor">
        <form onSubmit={handleSavePayment} className="space-y-6">
          <div className="bg-error-container/30 p-4 rounded-2xl">
            <p className="text-sm text-on-surface-variant">Proveedor</p>
            <p className="font-serif text-lg font-bold text-on-surface">{selectedDebt?.supplier_name}</p>
            <div className="flex justify-between mt-2 pt-2 border-t border-error/20">
              <p className="text-sm">Deuda Actual:</p>
              <p className="font-bold text-error">S/ {selectedDebt?.remaining_amount.toFixed(2)}</p>
            </div>
          </div>
          <Input label="Monto a Pagar (S/.) *" type="number" required max={selectedDebt?.remaining_amount} value={paymentAmount} onChange={e => setPaymentAmount(Number(e.target.value))} />
          <Select 
            label="Método de Pago" 
            value={debtPaymentMethod} 
            onChange={e => setDebtPaymentMethod(e.target.value)}
            options={[
              { value: 'transferencia', label: 'Transferencia / Yape / Plin' },
              { value: 'efectivo', label: 'Efectivo (Extraer de Caja)' }
            ]}
          />
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="ghost" onClick={() => setIsDebtModalOpen(false)}>Cancelar</Button>
            <Button type="submit" variant="primary" disabled={isSaving}>{isSaving ? <Spinner size="sm" /> : 'Procesar Pago'}</Button>
          </div>
        </form>
      </Modal>

    </div>
  );
}
