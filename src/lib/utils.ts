import { format, parseISO, startOfWeek, addDays } from 'date-fns';
import { es } from 'date-fns/locale';

export let currentSalonCurrency = 'PEN';

export const setSalonCurrency = (c: string) => {
  if (c) currentSalonCurrency = c;
};

export const formatCurrency = (n: number) => {
  try {
    // Si es un código ISO válido (3 letras mayúsculas), intentamos usar Intl
    if (currentSalonCurrency.length === 3 && /^[A-Z]{3}$/.test(currentSalonCurrency)) {
      return new Intl.NumberFormat('es-PE', { style: 'currency', currency: currentSalonCurrency }).format(n);
    }
  } catch (e) {
    // Fallback si el código no es soportado
  }

  // Formato manual para símbolos personalizados (S/., $, €, etc.)
  const num = new Intl.NumberFormat('es-PE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(n || 0);

  return `${currentSalonCurrency} ${num}`;
};

export const parseLocalISO = (d: string): Date => {
  if (!d) return new Date();
  // Strip timezone offsets (+00, Z, etc.) to treat as local-naive date/time
  const naive = d.substring(0, 19).replace(' ', 'T');
  return parseISO(naive);
};

export const formatDate = (d: string | Date, f = 'dd MMM yyyy') => {
  try {
    const date = typeof d === 'string' ? parseLocalISO(d) : d;
    if (!date || isNaN(date.getTime())) return '-';
    return format(date, f, { locale: es });
  } catch (e) { return '-'; }
};

export const formatTime = (d: string | Date) => {
  try {
    const date = typeof d === 'string' ? parseLocalISO(d) : d;
    if (!date || isNaN(date.getTime())) return '--:--';
    return format(date, 'HH:mm');
  } catch (e) { return '--:--'; }
};

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Obtiene los 7 días de la semana que contiene la fecha dada */
export const getWeekDays = (date: Date): Date[] => {
  const start = startOfWeek(date, { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
};

export const STATUS_COLORS: Record<string, string> = {
  scheduled:  'bg-amber-50 text-amber-700 border-amber-200',
  confirmed:  'bg-amber-100 text-amber-800 border-amber-300',
  atendido:   'bg-green-50 text-green-700 border-green-200',
  completed:  'bg-green-100 text-green-800 border-green-300',
  cancelled:  'bg-gray-50 text-gray-500 border-gray-200',
  'no-show':  'bg-red-50 text-red-600 border-red-200',
};

export const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Agendada',
  confirmed: 'Confirmada',
  atendido:  'En atención',
  completed: 'Completada',
  cancelled: 'Cancelada',
  'no-show': 'No asistió',
};

export const CALENDAR_BAR: Record<string, string> = {
  scheduled:  'bg-amber-400',
  confirmed:  'bg-amber-500',
  atendido:   'bg-green-400',
  completed:  'bg-green-600',
  cancelled:  'bg-gray-300',
  'no-show':  'bg-red-400',
};

export const PAYMENT_LABELS: Record<string, string> = {
  unpaid:  'Sin pagar',
  partial: 'Anticipo pagado',
  paid:    'Pagado',
};

export const getWhatsAppLink = (phone: string, text: string): string => {
  let cleanPhone = (phone || '').replace(/\D/g, '');
  // If it's a Peruvian 9-digit mobile number starting with 9, auto-prepend '51'
  if (cleanPhone.length === 9 && cleanPhone.startsWith('9')) {
    cleanPhone = '51' + cleanPhone;
  }
  return `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(text)}`;
};
