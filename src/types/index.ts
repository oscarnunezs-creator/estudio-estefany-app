// ============================================================
// ESTEFANY BY LASHES — TypeScript Types
// ============================================================

export type UserRole = 'admin' | 'staff' | 'client';

export interface UserProfile {
  uid: string;
  email: string;
  display_name: string | null;
  role: UserRole;
  photo_url: string | null;
  active: boolean;
  created_at: string;
}

export interface SalonConfig {
  id: string;
  name: string;
  logo?: string;
  phone?: string;
  address?: string;
  currency: string;
  tax_rate: number;
  schedule: { [key: string]: { open: string; close: string; isClosed: boolean } };
  lunch_break: { enabled: boolean; start: string; end: string };
  deposit_config: {
    enabled: boolean;
    type: 'fixed' | 'percentage';
    value: number;
    percentageLongDuration?: number;
    minAmountLongDuration?: number;
    percentageCourses?: number;
    percentageHomeService?: number;
    refundPolicy: string;
    paymentDeadlineHours: number;
    hoursToConfirmRegular: number;
    hoursToConfirmLong: number;
  };
  home_service: {
    enabled: boolean;
    baseFee: number;
    zones: { name: string; fee: number; time?: number }[];
    bufferTime: number;
  };
  policies: {
    cancellationLimitHours: number;
    noShowPenaltyRate: number;
    reprogrammingCost: number;
    tardinessToleranceMinutes: number;
    defaultCommissionRate: number;
    discountVIP: number;
    discountFrequent: number;
    discountNewClient: number;
    discountBirthday: number;
    discountBirthdayWeek: number;
    discountPackage: number;
    maxDiscountWithoutAuth: number;
    enableNewClientDiscount?: boolean;
    sundaySurchargeEnabled?: boolean;
    sundaySurchargeRate?: number;
  };
  loyalty_messages?: {
    welcome: string;
    promoBirthday: string;
    birthday: string;
    maintenance: string;
    detractors: string;
    scheduling?: string;
  };
  updated_at: string;
}

export interface Professional {
  id: string;
  name: string;
  specialties: string[];
  active: boolean;
  commission_rate?: number;
  salary_config?: {
    paymentType: 'fixed' | 'hourly' | 'daily' | 'commission_only';
    baseSalary: number;
    rateValue: number;
    frequency: 'biweekly' | 'monthly';
    bonuses: { name: string; amount: number }[];
  };
  offers_home_service?: boolean;
  birth_date?: string;
  created_at: string;
}

export interface SalonBed {
  id: string;
  name: string;
  notes?: string;
  active: boolean;
  created_at: string;
}

export interface Service {
  id: string;
  name: string;
  description: string;
  duration: number;
  buffer_time: number;
  price: number;
  category: string;
  commission_rate?: number;
  commission_amount?: number;
  active: boolean;
  created_at: string;
}

export interface CustomerMetrics {
  totalAppointments: number;
  attendedAppointments: number;
  noShows: number;
  noShowRate: number;
  lastVisit?: string;
  totalSpent: number;
  averageTicket: number;
  frequencyScore?: number;
}

export interface CustomerHistoryItem {
  id: string;
  customer_id: string;
  appointment_id?: string;
  date: string;
  service_id?: string;
  service_name: string;
  professional_id?: string;
  professional_name: string;
  price_paid: number;
  photos_before?: string[];
  photos_after?: string[];
  technical_notes: string;
  recommendations: string;
  created_at: string;
}

export interface Customer {
  id: string;
  first_name: string;
  last_name: string;
  name: string;
  phone: string;
  whatsapp?: string;
  email?: string;
  birth_date?: string;
  allergies: string;
  favorite_service?: string;
  preferred_technique?: string;
  internal_notes?: string;
  acquisition_channel?: 'Facebook' | 'Instagram' | 'TikTok' | 'Presencial' | 'Recomendación' | 'Otros';
  metrics: CustomerMetrics;
  is_recurring: boolean;
  frequency?: 'Semanal' | 'Quincenal' | 'Mensual' | 'Esporádico' | 'Primera vez';
  consent_signed?: boolean;
  consent_date?: string;
  active: boolean;
  last_modified_by?: string;
  created_at: string;
  updated_at: string;
}

export type AppointmentStatus = 'scheduled' | 'confirmed' | 'atendido' | 'cancelled' | 'no-show' | 'completed';
export type PaymentStatus = 'unpaid' | 'partial' | 'paid';
export type PaymentMethod = 'efectivo' | 'transferencia' | 'billetera' | 'tarjeta' | 'otros';

export interface Appointment {
  id: string;
  customer_id: string;
  customer_name: string;
  service_id: string;
  service_name: string;
  professional_id: string;
  professional_name: string;
  bed_id?: string;
  bed_name?: string;
  start_time: string;
  end_time: string;
  buffer_time: number;
  status: AppointmentStatus;
  deposit_amount: number;
  total_amount: number;
  payment_status: PaymentStatus;
  commission_amount?: number;
  payment_method?: PaymentMethod;
  tip?: number;
  notes?: string;
  finance_record_id?: string;
  completed_at?: string;
  photos_before?: string[];
  photos_after?: string[];
  discount_percentage?: number;
  discount_amount?: number;
  discount_reason?: string;
  created_at: string;
}

export interface Product {
  id: string;
  name: string;
  type: 'sale' | 'consumption' | 'material' | 'equipment';
  category: 'Insumo' | 'Venta' | 'Material' | 'Equipo';
  unit: string;
  location?: string;
  cost_price: number;
  sale_price: number;
  price: number;
  stock: number;
  min_stock: number;
  provider: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CashRecord {
  id: string;
  date: string;
  opening_balance: number;
  closing_balance?: number;
  status: 'open' | 'closed';
  opened_by: string;
  closed_by?: string;
  opened_at: string;
  closed_at?: string;
}

export type TransactionType =
  | 'income' | 'expense' | 'adelanto' | 'saldo_cita'
  | 'venta' | 'compra' | 'devolucion_adelanto'
  | 'devolucion_venta' | 'ajuste' | 'gasto';

export interface Transaction {
  id: string;
  cash_record_id?: string;
  type: TransactionType;
  status: 'pending' | 'completed' | 'cancelled';
  category: string;
  subcategory?: string;
  amount: number;
  method: PaymentMethod | 'pendiente';
  description: string;
  appointment_id?: string;
  user_id: string;
  notes?: string;
  reference_id?: string;
  created_at: string;
}

export interface CartItem {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  sale_price: number;
  commission_amount: number;
  impulsed_by?: string;
}

export interface Sale {
  id: string;
  items: CartItem[];
  subtotal: number;
  total: number;
  payment_method: 'Efectivo' | 'Billetera (Yape/Plin)' | 'Transferencia' | 'Tarjeta' | 'Otros';
  client_name?: string;
  client_id?: string;
  created_by: string;
  total_commissions: number;
  created_at: string;
}

export interface Merma {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  reason: 'Vencido' | 'Dañado' | 'Perdido' | 'Otro';
  notes?: string;
  date: string;
  created_by: string;
  created_at: string;
}

export interface Supplier {
  id: string;
  name: string;
  contact_name?: string;
  phone: string;
  email?: string;
  address?: string;
  category: string;
  delivery_days?: string;
  payment_conditions?: string;
  ruc?: string;
  notes?: string;
  active: boolean;
  created_at: string;
}

export interface PurchaseItem {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
}

export interface Purchase {
  id: string;
  supplier_id: string;
  supplier_name: string;
  date: string;
  items: PurchaseItem[];
  total_amount: number;
  payment_method: string;
  invoice_image_url?: string;
  status: 'paid' | 'pending_payment' | 'partial';
  active: boolean;
  created_at: string;
}

export interface SupplierDebt {
  id: string;
  supplier_id: string;
  supplier_name: string;
  purchase_id?: string;
  total_amount: number;
  remaining_amount: number;
  due_date: string;
  status: 'pending' | 'paid' | 'overdue';
  payments: { date: string; amount: number; method: string }[];
  created_at: string;
}
