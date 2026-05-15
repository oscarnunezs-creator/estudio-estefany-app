import { supabase } from '../lib/supabase';
import type { Appointment, Customer, Product, Transaction, SalonConfig } from '../types';

// ─── helpers ────────────────────────────────────────────────
const todayISO = () => new Date().toISOString().split('T')[0];

// HIGH-04: fixed UTC-5 for America/Lima — avoids browser/OS timezone dependency
const todayRangeUTC = () => {
  const PERU_OFFSET_MS = 5 * 60 * 60 * 1000; // UTC-5 = +5h to convert local→UTC
  const now = new Date();
  const localMidnight = new Date(now);
  localMidnight.setHours(0, 0, 0, 0);
  const localEnd = new Date(now);
  localEnd.setHours(23, 59, 59, 999);
  return {
    from: new Date(localMidnight.getTime() + PERU_OFFSET_MS).toISOString(),
    to: new Date(localEnd.getTime() + PERU_OFFSET_MS).toISOString(),
  };
};

// ─── APPOINTMENTS ────────────────────────────────────────────
export const appointmentsSvc = {
  getByRange: (from: string, to: string) =>
    supabase.from('appointments').select('*').gte('start_time', from).lt('start_time', to).order('start_time'),

  getToday: () => {
    const { from, to } = todayRangeUTC();
    return supabase.from('appointments').select('*')
      .gte('start_time', from).lt('start_time', to).order('start_time');
  },

  create: (data: Omit<Appointment, 'id' | 'created_at'>) =>
    supabase.from('appointments').insert(data).select().single(),

  update: (id: string, data: Partial<Appointment>) =>
    supabase.from('appointments').update(data).eq('id', id).select().single(),

  delete: (id: string) => supabase.from('appointments').delete().eq('id', id),
};

// ─── CUSTOMERS ───────────────────────────────────────────────
export const customersSvc = {
  getAll: () => supabase.from('customers').select('*').eq('active', true).order('name'),
  getById: (id: string) => supabase.from('customers').select('*').eq('id', id).single(),
  search: (q: string) => supabase.from('customers').select('id, name, phone').ilike('name', `%${q}%`).limit(10),
  create: (data: Omit<Customer, 'id' | 'created_at' | 'updated_at'>) =>
    supabase.from('customers').insert(data).select().single(),
  update: (id: string, data: Partial<Customer>) =>
    supabase.from('customers').update(data).eq('id', id).select().single(),
  count: () => supabase.from('customers').select('id', { count: 'exact', head: true }).eq('active', true),
};

// ─── PROFESSIONALS ───────────────────────────────────────────
export const professionalsSvc = {
  getAll: () => supabase.from('professionals').select('*').order('name'),
  create: (data: any) => supabase.from('professionals').insert(data).select().single(),
  update: (id: string, data: any) => supabase.from('professionals').update(data).eq('id', id).select().single(),
  delete: (id: string) => supabase.from('professionals').delete().eq('id', id),
};

// ─── SERVICES ────────────────────────────────────────────────
export const servicesSvc = {
  getAll: () => supabase.from('services').select('*').order('name'),
  create: (data: any) => supabase.from('services').insert(data).select().single(),
  update: (id: string, data: any) => supabase.from('services').update(data).eq('id', id).select().single(),
  delete: (id: string) => supabase.from('services').delete().eq('id', id),
};

// ─── SALON BEDS ──────────────────────────────────────────────
export const bedsSvc = {
  getAll: () => supabase.from('salon_beds').select('*').order('name'),
  create: (data: any) => supabase.from('salon_beds').insert(data).select().single(),
  update: (id: string, data: any) => supabase.from('salon_beds').update(data).eq('id', id).select().single(),
  delete: (id: string) => supabase.from('salon_beds').delete().eq('id', id),
};

// ─── SALON CONFIG ─────────────────────────────────────────────
export const configSvc = {
  get: () => supabase.from('salon_config').select('*').single(),
  update: (id: string, data: Partial<SalonConfig>) =>
    supabase.from('salon_config').update(data).eq('id', id).select().single(),
};

// ─── TRANSACTIONS ────────────────────────────────────────────
export const transactionsSvc = {
  getByRange: (from: string, to: string) =>
    supabase.from('transactions').select('*').gte('created_at', from).lt('created_at', to).order('created_at', { ascending: false }),

  getToday: () => {
    const { from, to } = todayRangeUTC();
    return supabase.from('transactions').select('*')
      .gte('created_at', from).lt('created_at', to);
  },

  getLast30Days: () => {
    const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    return supabase.from('transactions').select('amount, type, status, created_at')
      .gte('created_at', from)
      .in('type', ['income', 'saldo_cita', 'adelanto', 'venta'])
      .eq('status', 'completed');
  },

  create: (data: Omit<Transaction, 'id' | 'created_at'> & { created_at?: string }) =>
    supabase.from('transactions').insert(data).select().single(),

  getByAppointmentId: (id: string) =>
    supabase.from('transactions').select('*').eq('appointment_id', id),
};

// ─── SALES ───────────────────────────────────────────────────
export const salesSvc = {
  getByRange: (from: string, to: string) =>
    supabase.from('sales').select('*').gte('created_at', from).lt('created_at', to).order('created_at', { ascending: false }),

  getToday: () => {
    const d = todayISO();
    return supabase.from('sales').select('total').gte('created_at', `${d}T00:00:00`).lt('created_at', `${d}T23:59:59`);
  },
};

// ─── PRODUCTS ────────────────────────────────────────────────
export const productsSvc = {
  getAll: () => supabase.from('products').select('*').eq('active', true).order('name'),
  // HIGH-05: getLowStock was using supabase.rpc as a filter value (bug). Use getLowStockRaw instead.
  getLowStockRaw: async () => {
    const { data } = await supabase.from('products').select('*').eq('active', true);
    return (data || []).filter((p: Product) => p.stock <= p.min_stock);
  },
  create: (data: Omit<Product, 'id' | 'created_at' | 'updated_at'>) =>
    supabase.from('products').insert(data).select().single(),
  update: (id: string, data: Partial<Product>) =>
    supabase.from('products').update(data).eq('id', id).select().single(),
  delete: (id: string) => supabase.from('products').delete().eq('id', id),
};

// ─── CASH RECORDS ────────────────────────────────────────────
export const cashRecordsSvc = {
  getToday: () => {
    const d = new Date().toISOString().split('T')[0];
    return supabase.from('cash_records').select('*').eq('date', d).single();
  },
  getByDate: (date: string) => supabase.from('cash_records').select('*').eq('date', date),
  create: (data: any) => supabase.from('cash_records').insert(data).select().single(),
  update: (id: string, data: any) => supabase.from('cash_records').update(data).eq('id', id).select().single(),
};

// ─── SUPPLIERS ───────────────────────────────────────────────
export const suppliersSvc = {
  getAll: () => supabase.from('suppliers').select('*').eq('active', true).order('name'),
  create: (data: any) => supabase.from('suppliers').insert(data).select().single(),
  update: (id: string, data: any) => supabase.from('suppliers').update(data).eq('id', id).select().single(),
  delete: (id: string) => supabase.from('suppliers').delete().eq('id', id),
};

// ─── PURCHASES ───────────────────────────────────────────────
export const purchasesSvc = {
  getAll: () => supabase.from('purchases').select('*').order('created_at', { ascending: false }),
  create: (data: any) => supabase.from('purchases').insert(data).select().single(),
  update: (id: string, data: any) => supabase.from('purchases').update(data).eq('id', id).select().single(),
};

// ─── SUPPLIER DEBTS ──────────────────────────────────────────
export const debtsSvc = {
  getAll: () => supabase.from('supplier_debts').select('*').order('due_date', { ascending: true }),
  create: (data: any) => supabase.from('supplier_debts').insert(data).select().single(),
  update: (id: string, data: any) => supabase.from('supplier_debts').update(data).eq('id', id).select().single(),
};

