import React, { useState, useEffect, useCallback } from 'react';
import { Button, Modal, Badge, Spinner, EmptyState, Input, Pagination } from './ui';
import { productsSvc } from '../services/salon';
import type { Product } from '../types';
import Papa from 'papaparse';
import { formatCurrency } from '../lib/utils';

const CATEGORIES = ['Todos', 'Venta', 'Insumo', 'Material', 'Equipo'];

const PRODUCT_ALIASES: Record<string, string> = {
  name: 'name', product: 'name', nombre_producto: 'name', nombre: 'name', insumo: 'name', material: 'name', equipo: 'name', item: 'name', product_name: 'name',
  category: 'category', categoria: 'category', 'categoría': 'category', tipo: 'category', tipo_producto: 'category', clasificacion: 'category', 'clasificación': 'category', uso: 'category', product_type: 'category',
  unit: 'unit', unidad: 'unit', unidad_medida: 'unit', medida: 'unit', measurement: 'unit',
  cost_price: 'cost_price', costo: 'cost_price', costo_unitario: 'cost_price', unit_cost: 'cost_price', precio_costo: 'cost_price',
  sale_price: 'sale_price', precio: 'sale_price', precio_venta: 'sale_price', price: 'sale_price',
  stock: 'stock', stock_actual: 'stock', inventario: 'stock', cantidad_stock: 'stock', initial_stock: 'stock',
  min_stock: 'min_stock', stock_minimo: 'min_stock', 'stock_mínimo': 'min_stock', minimum_stock: 'min_stock', alerta_stock: 'min_stock',
  provider: 'provider', proveedor: 'provider', supplier: 'provider'
};

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function normalizeProductCategory(value?: string): 'Insumo' | 'Venta' | 'Material' | 'Equipo' {
  const normalized = normalizeText(value || "");
  if (normalized.includes("venta") || normalized.includes("retail") || normalized.includes("pos") || normalized.includes("cliente")) return "Venta";
  if (normalized.includes("insumo") || normalized.includes("consumible") || normalized.includes("consumo") || normalized.includes("uso interno") || normalized.includes("producto de servicio")) return "Insumo";
  if (normalized.includes("material") || normalized.includes("descartable") || normalized.includes("accesorio") || normalized.includes("aplicador") || normalized.includes("parche")) return "Material";
  if (normalized.includes("equipo") || normalized.includes("herramienta") || normalized.includes("aparato") || normalized.includes("activo") || normalized.includes("maquina") || normalized.includes("instrumental")) return "Equipo";
  return "Insumo";
}

function normalizeRowKeys(row: Record<string, string>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, val] of Object.entries(row)) {
    const cleanKey = key
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');
    const mappedKey = PRODUCT_ALIASES[cleanKey] || cleanKey;
    normalized[mappedKey] = val;
  }
  return normalized;
}

interface ImportRow {
  name: string;
  category: 'Insumo' | 'Venta' | 'Material' | 'Equipo';
  unit: string;
  cost_price: number;
  sale_price: number;
  price: number;
  stock: number;
  min_stock: number;
  provider: string;
  _errors: string[];
  isDuplicate?: boolean;
  duplicateReason?: string;
  selected?: boolean;
}

export default function Inventory() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('Todos');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  
  // Modal & Form State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // Import State
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [showImport, setShowImport] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ok:number;fail:number}|null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    category: 'Insumo',
    unit: 'Unidad',
    location: '',
    cost_price: 0,
    sale_price: 0,
    price: 0,
    stock: 0,
    min_stock: 0,
    provider: ''
  });

  const loadProducts = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await productsSvc.getAll();
      if (error) throw error;
      setProducts(data || []);
    } catch (err) {
      console.error('Error loading products:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) || 
                         (p.provider || '').toLowerCase().includes(search.toLowerCase());
    const matchesCategory = categoryFilter === 'Todos' || p.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  const paginatedProducts = filteredProducts.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Reset page on search or filter
  useEffect(() => {
    setCurrentPage(1);
  }, [search, categoryFilter]);

  const handleOpenModal = (product?: Product) => {
    if (product) {
      setEditingProduct(product);
      setFormData({
        name: product.name,
        category: product.category,
        unit: product.unit || 'Unidad',
        location: product.location || '',
        cost_price: product.cost_price || 0,
        sale_price: product.sale_price || 0,
        price: product.price || 0,
        stock: product.stock || 0,
        min_stock: product.min_stock || 0,
        provider: product.provider || ''
      });
    } else {
      setEditingProduct(null);
      setFormData({
        name: '',
        category: 'Insumo',
        unit: 'Unidad',
        location: '',
        cost_price: 0,
        sale_price: 0,
        price: 0,
        stock: 0,
        min_stock: 0,
        provider: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      // type normalization based on category
      let type: 'sale' | 'consumption' | 'material' | 'equipment' = 'consumption';
      if (formData.category === 'Venta') type = 'sale';
      if (formData.category === 'Material') type = 'material';
      if (formData.category === 'Equipo') type = 'equipment';

      const cost = Number(formData.cost_price);
      const sale = Number(formData.sale_price);
      const pubPrice = Number(formData.price);

      // MED-05: Validate price coherence
      if (cost < 0) {
        alert('El costo no puede ser negativo.');
        return;
      }
      if (sale > 0 && sale < cost) {
        alert('El precio de venta (staff) no puede ser menor al costo.');
        return;
      }
      if (pubPrice > 0 && pubPrice < cost) {
        alert('El precio público no puede ser menor al costo.');
        return;
      }

      const payload = {
        ...formData,
        category: formData.category as 'Insumo' | 'Venta' | 'Material' | 'Equipo',
        type,
        cost_price: cost,
        sale_price: sale,
        price: pubPrice,
        stock: Number(formData.stock),
        min_stock: Number(formData.min_stock),
        active: true
      };

      if (editingProduct) {
        await productsSvc.update(editingProduct.id, payload);
      } else {
        await productsSvc.create(payload as any);
      }
      setIsModalOpen(false);
      loadProducts();
    } catch (err) {
      console.error('Error saving product:', err);
      alert('Hubo un error al guardar el producto.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Seguro que deseas eliminar este producto?')) return;
    try {
      await productsSvc.delete(id);
      loadProducts();
    } catch (err) {
      console.error('Error deleting product:', err);
    }
  };

  const handleExport = () => {
    const rows = products.map(p => ({
      nombre: p.name,
      categoria: p.category,
      unidad: p.unit || 'Unidad',
      ubicacion: p.location || '',
      precio_costo: p.cost_price,
      precio_venta: p.sale_price,
      precio: p.price,
      stock_actual: p.stock,
      stock_minimo: p.min_stock,
      proveedor: p.provider || '',
      estado: p.active ? 'Activo' : 'Inactivo'
    }));
    if (rows.length === 0) return alert('No hay productos para exportar.');
    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `inventario.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const validateRow = (row: Record<string, string>): ImportRow => {
    const norm = normalizeRowKeys(row);
    const errors: string[] = [];
    const name = (norm.name || '').trim();
    if (!name) errors.push('Nombre requerido');
    
    return {
      name,
      category: normalizeProductCategory(norm.category),
      unit: (norm.unit || 'Unidad').trim(),
      cost_price: parseFloat(norm.cost_price) || 0,
      sale_price: parseFloat(norm.sale_price) || 0,
      price: parseFloat(norm.price) || 0,
      stock: parseFloat(norm.stock) || 0,
      min_stock: parseFloat(norm.min_stock) || 0,
      provider: (norm.provider || '').trim(),
      _errors: errors
    };
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const rows = result.data.map(validateRow);
        const checkedRows = rows.map(r => {
          if (r._errors.length > 0) return { ...r, isDuplicate: false, selected: false };
          const dup = products.find(p => p.name.toLowerCase().trim() === r.name.toLowerCase().trim());
          if (dup) {
            return {
              ...r,
              isDuplicate: true,
              duplicateReason: `Mismo nombre: ${dup.name}`,
              selected: false
            };
          }
          return { ...r, isDuplicate: false, selected: true };
        });
        setImportRows(checkedRows);
        setImportResult(null);
        setShowImport(true);
      }
    });
    e.target.value = '';
  };

  const handleImportConfirm = async () => {
    const toImport = importRows.filter(r => r._errors.length === 0 && r.selected);
    if (toImport.length === 0) return;
    setImporting(true);
    let ok = 0; let fail = 0;
    for (const r of toImport) {
      let type: 'sale' | 'consumption' | 'material' | 'equipment' = 'consumption';
      if (r.category === 'Venta') type = 'sale';
      if (r.category === 'Material') type = 'material';
      if (r.category === 'Equipo') type = 'equipment';

      const { error } = await productsSvc.create({
        name: r.name,
        category: r.category,
        type,
        unit: r.unit,
        cost_price: r.cost_price,
        sale_price: r.sale_price,
        price: r.price,
        stock: r.stock,
        min_stock: r.min_stock,
        provider: r.provider,
        active: true
      } as any);
      error ? fail++ : ok++;
    }
    setImporting(false);
    setImportResult({ ok, fail });
    loadProducts();
  };

  const toggleRowSelected = (index: number) => {
    setImportRows(prev => prev.map((r, idx) => {
      if (idx === index) {
        if (r._errors.length > 0) return r;
        return { ...r, selected: !r.selected };
      }
      return r;
    }));
  };

  const selectableRows = importRows.filter(r => r._errors.length === 0);
  const allSelected = selectableRows.length > 0 && selectableRows.every(r => r.selected);

  const toggleAllSelected = () => {
    const target = !allSelected;
    setImportRows(prev => prev.map(r => {
      if (r._errors.length > 0) return r;
      return { ...r, selected: target };
    }));
  };

  return (
    <div className="p-4 md:p-8 space-y-8 animate-fade-in bg-background min-h-screen">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-4xl font-headline-md text-on-surface tracking-tight font-normal">
            Inventario
          </h1>
          <p className="text-on-surface-variant mt-2 max-w-xl">
            Gestiona insumos, productos de venta y herramientas del spa. Mantén el control de tus márgenes y evita el desabastecimiento.
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <input type="file" ref={fileRef} className="hidden" accept=".csv" onChange={handleFileChange} />
          <Button variant="ghost" onClick={() => fileRef.current?.click()} disabled={isSaving}>
            <span className="material-symbols-outlined mr-2">upload</span>Importar
          </Button>
          <Button variant="ghost" onClick={handleExport} disabled={isSaving}>
            <span className="material-symbols-outlined mr-2">download</span>Exportar
          </Button>
          <Button variant="primary" onClick={() => handleOpenModal()} className="shadow-lg shadow-primary/20" disabled={isSaving}>
            <span className="material-symbols-outlined mr-2">add</span>
            Nuevo Producto
          </Button>
        </div>
      </div>

      {/* Summary Metrics */}
      {!loading && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="bg-surface-container-low p-6 rounded-[2rem] border border-outline-variant/30 flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-primary">inventory_2</span>
            </div>
            <div>
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Total Productos</p>
              <p className="text-2xl font-serif font-bold text-on-surface">{products.length}</p>
            </div>
          </div>
          <div className="bg-surface-container-low p-6 rounded-[2rem] border border-outline-variant/30 flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-secondary/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-secondary">sell</span>
            </div>
            <div>
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Para Venta</p>
              <p className="text-2xl font-serif font-bold text-on-surface">{products.filter(p => p.category === 'Venta').length}</p>
            </div>
          </div>
          <div className="bg-surface-container-low p-6 rounded-[2rem] border border-outline-variant/30 flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-error/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-error">warning</span>
            </div>
            <div>
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Stock Crítico</p>
              <p className="text-2xl font-serif font-bold text-error">{products.filter(p => p.stock <= p.min_stock).length}</p>
            </div>
          </div>
        </div>
      )}

      {/* Filters & Search */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-surface-container-low p-4 rounded-[2rem] border border-outline-variant/30">
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-6 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
                categoryFilter === cat
                  ? 'bg-primary text-on-primary shadow-md'
                  : 'bg-surface hover:bg-surface-container-high text-on-surface-variant border border-outline-variant/30'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
        <div className="relative w-full lg:w-72">
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant/50">
            search
          </span>
          <Input
            placeholder="Buscar producto o proveedor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-12 w-full bg-surface border-transparent focus:border-primary/30"
          />
        </div>
      </div>

      {/* Products Table */}
      {loading ? (
        <div className="flex justify-center py-20">
          <Spinner size="lg" />
        </div>
      ) : filteredProducts.length === 0 ? (
        <EmptyState
          icon={<span className="material-symbols-outlined text-[48px] text-outline/50 select-none">inventory_2</span>}
          title="Sin productos"
          description={search ? "No se encontraron resultados para tu búsqueda." : "Aún no has registrado productos en el inventario."}
          action={
            <Button variant="primary" onClick={() => handleOpenModal()}>
              Crear el primer producto
            </Button>
          }
        />
      ) : (
        <div className="bg-surface-container-lowest rounded-[2rem] border border-outline-variant/20 shadow-sm overflow-hidden mb-6">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-low border-b border-outline-variant/20">
                  <th className="px-6 py-4 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Artículo / Detalle</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest text-center">Clasificación</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest text-center">Stock / Unidad</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest text-right">Costo</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest text-right">Venta</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {paginatedProducts.map(product => {
                  const isLowStock = product.stock <= product.min_stock;
                  
                  return (
                    <tr 
                      key={product.id} 
                      className="hover:bg-primary/5 transition-colors group"
                    >
                      <td className="px-6 py-4">
                        <p className="text-sm font-bold text-on-surface">{product.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-[10px] text-on-surface-variant uppercase font-black tracking-widest">
                            {product.provider || 'Sin proveedor'}
                          </p>
                          {product.location && (
                            <span className="flex items-center gap-1 text-[10px] text-on-surface-variant">
                              <span className="material-symbols-outlined text-[12px]">location_on</span> {product.location}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <Badge variant={
                          product.category === 'Venta' ? 'default' : 
                          product.category === 'Insumo' ? 'peach' : 'info'
                        } className="font-semibold px-3 py-1">
                          {product.category}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex flex-col items-center">
                          <div className="flex items-center justify-center gap-2">
                            <span className={`text-sm font-black ${isLowStock ? 'text-error' : 'text-on-surface'}`}>
                              {product.stock}
                            </span>
                            {isLowStock && <span className="material-symbols-outlined text-[16px] text-error animate-pulse">warning</span>}
                          </div>
                          <span className="text-[8px] font-black text-on-surface-variant uppercase tracking-widest">{product.unit || 'unidad'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-sm font-medium text-on-surface-variant">{formatCurrency(product.cost_price)}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className={`text-sm font-bold ${product.category === 'Venta' ? 'text-primary' : 'text-on-surface-variant/30'}`}>
                          {product.category === 'Venta' ? formatCurrency(product.price) : '—'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => handleOpenModal(product)} 
                            className="p-2 text-on-surface-variant hover:text-primary transition-colors rounded-full hover:bg-surface-container-high"
                            title="Editar"
                          >
                            <span className="material-symbols-outlined text-sm">edit</span>
                          </button>
                          <button 
                            onClick={() => handleDelete(product.id)} 
                            className="p-2 text-on-surface-variant hover:text-error transition-colors rounded-full hover:bg-error-container"
                            title="Eliminar"
                          >
                            <span className="material-symbols-outlined text-sm">delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {paginatedProducts.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-on-surface-variant/50 italic">No se encontraron productos.</td>
                    </tr>
                  )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination Controls */}
      {!loading && filteredProducts.length > itemsPerPage && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
        />
      )}

      {/* Product Modal */}
      <Modal
        open={isModalOpen}
        onClose={() => !isSaving && setIsModalOpen(false)}
        title={editingProduct ? "Editar Producto" : "Nuevo Producto"}
      >
        <form onSubmit={handleSave} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="col-span-1 md:col-span-2">
              <label className="block text-sm font-medium text-on-surface-variant mb-1 ml-1">Nombre del producto *</label>
              <Input
                required
                placeholder="Ej. Espuma limpiadora"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-on-surface-variant mb-1 ml-1">Categoría *</label>
              <select
                className="w-full h-12 px-4 rounded-full bg-surface border border-outline-variant/30 text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                value={formData.category}
                onChange={e => setFormData({ ...formData, category: e.target.value })}
              >
                <option value="Insumo">Insumo (Cabina)</option>
                <option value="Venta">Venta (Cliente)</option>
                <option value="Material">Material Fijo</option>
                <option value="Equipo">Equipo</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-on-surface-variant mb-1 ml-1">Unidad de medida</label>
              <select
                className="w-full h-12 px-4 rounded-full bg-surface border border-outline-variant/30 text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                value={formData.unit}
                onChange={e => setFormData({ ...formData, unit: e.target.value })}
              >
                <option value="Unidad">Unidad (ud)</option>
                <option value="Caja">Caja</option>
                <option value="Par">Par</option>
                <option value="Botella">Botella</option>
                <option value="Kit">Kit</option>
              </select>
            </div>

            <div className="col-span-1 md:col-span-2 bg-surface-container-lowest p-6 rounded-3xl border border-outline-variant/20 space-y-4">
              <h4 className="font-serif text-lg text-on-surface">Finanzas del Producto</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-on-surface-variant mb-1 ml-1">Costo ($)</label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.cost_price}
                    onChange={e => setFormData({ ...formData, cost_price: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-on-surface-variant mb-1 ml-1" title="Precio base para el público">Precio Público ($)</label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.price}
                    onChange={e => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="col-span-2 md:col-span-1">
                  <label className="block text-sm font-medium text-on-surface-variant mb-1 ml-1" title="Precio preferencial o de oferta (se usa en POS si existe)">Precio Venta (Oferta) ($)</label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.sale_price}
                    onChange={e => setFormData({ ...formData, sale_price: parseFloat(e.target.value) || 0 })}
                  />
                  <p className="text-[10px] text-on-surface-variant mt-1 ml-1 leading-tight">
                    * Si se define, tiene prioridad sobre el precio público en el POS.
                  </p>
                </div>
              </div>
            </div>

            <div className="col-span-1 md:col-span-2 bg-surface-container-lowest p-6 rounded-3xl border border-outline-variant/20 space-y-4">
              <h4 className="font-serif text-lg text-on-surface">Control de Stock</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-on-surface-variant mb-1 ml-1">Stock Actual</label>
                  <Input
                    type="number"
                    min="0"
                    required
                    value={formData.stock}
                    onChange={e => setFormData({ ...formData, stock: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-on-surface-variant mb-1 ml-1">Alerta Mínimo</label>
                  <Input
                    type="number"
                    min="0"
                    value={formData.min_stock}
                    onChange={e => setFormData({ ...formData, min_stock: parseInt(e.target.value) || 0 })}
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-on-surface-variant mb-1 ml-1">Proveedor (Opcional)</label>
              <Input
                placeholder="Nombre del proveedor"
                value={formData.provider}
                onChange={e => setFormData({ ...formData, provider: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-on-surface-variant mb-1 ml-1">Ubicación física</label>
              <Input
                placeholder="Ej. Estante A"
                value={formData.location}
                onChange={e => setFormData({ ...formData, location: e.target.value })}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 mt-6 border-t border-outline-variant/20">
            <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" disabled={isSaving}>
              {isSaving ? <Spinner size="sm" /> : editingProduct ? 'Actualizar Producto' : 'Guardar Producto'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Import Modal */}
      <Modal
        open={showImport}
        onClose={() => !importing && setShowImport(false)}
        title="Importar Productos"
        size="xl"
      >
        <div className="space-y-6">
          {importResult ? (
            <div className="text-center py-8 space-y-4">
              <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="material-symbols-outlined text-4xl">check_circle</span>
              </div>
              <h3 className="text-2xl font-serif text-on-surface">Importación Finalizada</h3>
              <p className="text-on-surface-variant">
                Se procesaron correctamente <strong>{importResult.ok}</strong> productos.
                {importResult.fail > 0 && (
                  <span className="text-error ml-1">
                    (Error en {importResult.fail} filas)
                  </span>
                )}
              </p>
              <Button variant="primary" onClick={() => setShowImport(false)} className="px-8">
                Cerrar
              </Button>
            </div>
          ) : (
            <>
              <div className="bg-surface-container-lowest p-4 rounded-2xl border border-outline-variant/30 flex items-start gap-3">
                <span className="material-symbols-outlined text-primary">info</span>
                <div className="text-sm text-on-surface-variant leading-relaxed">
                  <p className="font-medium text-on-surface mb-1">Instrucciones de Importación:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>Asegúrate de que el archivo CSV tenga una fila de encabezados.</li>
                    <li>Las categorías se normalizan automáticamente (Insumo, Venta, Material, Equipo).</li>
                    <li>Los productos con el mismo nombre se marcarán como duplicados para revisión.</li>
                    <li>Puedes seleccionar/deseleccionar filas antes de confirmar.</li>
                  </ul>
                </div>
              </div>

              <div className="border border-outline-variant/30 rounded-2xl overflow-hidden">
                <div className="max-h-[400px] overflow-y-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-surface-container-high z-10">
                      <tr>
                        <th className="p-4 border-b border-outline-variant/30 w-10">
                          <input 
                            type="checkbox" 
                            checked={allSelected} 
                            onChange={toggleAllSelected}
                            className="rounded border-outline-variant text-primary focus:ring-primary"
                          />
                        </th>
                        <th className="p-4 border-b border-outline-variant/30 text-xs font-bold uppercase tracking-wider text-on-surface-variant">Nombre</th>
                        <th className="p-4 border-b border-outline-variant/30 text-xs font-bold uppercase tracking-wider text-on-surface-variant">Categoría</th>
                        <th className="p-4 border-b border-outline-variant/30 text-xs font-bold uppercase tracking-wider text-on-surface-variant">Precio/Costo</th>
                        <th className="p-4 border-b border-outline-variant/30 text-xs font-bold uppercase tracking-wider text-on-surface-variant">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/10">
                      {importRows.map((row, idx) => (
                        <tr key={idx} className={`${row._errors.length > 0 ? 'bg-error-container/10' : row.isDuplicate ? 'bg-amber-50/50' : 'hover:bg-surface-container-lowest'}`}>
                          <td className="p-4">
                            <input 
                              type="checkbox" 
                              checked={row.selected} 
                              onChange={() => toggleRowSelected(idx)}
                              disabled={row._errors.length > 0}
                              className="rounded border-outline-variant text-primary focus:ring-primary"
                            />
                          </td>
                          <td className="p-4">
                            <p className="text-sm font-medium text-on-surface">{row.name || '---'}</p>
                            <p className="text-[10px] text-on-surface-variant">{row.unit} • {row.provider || 'Sin proveedor'}</p>
                          </td>
                          <td className="p-4">
                            <Badge variant={row.category === 'Venta' ? 'success' : 'default'}>
                              {row.category}
                            </Badge>
                          </td>
                          <td className="p-4">
                            <div className="text-xs space-y-0.5">
                              <p><span className="text-on-surface-variant">Costo:</span> {formatCurrency(row.cost_price)}</p>
                              <p><span className="text-on-surface-variant">P.Púb:</span> {formatCurrency(row.price)}</p>
                            </div>
                          </td>
                          <td className="p-4">
                            {row._errors.length > 0 ? (
                              <div className="flex items-center gap-1 text-error text-[10px] font-bold uppercase">
                                <span className="material-symbols-outlined text-sm">error</span>
                                {row._errors[0]}
                              </div>
                            ) : row.isDuplicate ? (
                              <div className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-1 text-amber-600 text-[10px] font-bold uppercase">
                                  <span className="material-symbols-outlined text-sm">warning</span>
                                  Duplicado
                                </div>
                                <span className="text-[9px] text-amber-700/70">{row.duplicateReason}</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1 text-green-600 text-[10px] font-bold uppercase">
                                <span className="material-symbols-outlined text-sm">check_circle</span>
                                Listo
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-between items-center pt-4">
                <p className="text-sm text-on-surface-variant">
                  {importRows.filter(r => r.selected).length} de {importRows.length} productos seleccionados para importar.
                </p>
                <div className="flex gap-3">
                  <Button variant="ghost" onClick={() => setShowImport(false)} disabled={importing}>
                    Cancelar
                  </Button>
                  <Button 
                    variant="primary" 
                    onClick={handleImportConfirm} 
                    disabled={importing || importRows.filter(r => r.selected).length === 0}
                  >
                    {importing ? <Spinner size="sm" /> : <span className="material-symbols-outlined mr-2">download</span>}
                    Confirmar Importación
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
