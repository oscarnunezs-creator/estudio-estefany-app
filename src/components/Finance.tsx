import React, { useState, useEffect, useCallback } from 'react';
import { startOfWeek, startOfMonth, addDays, format as dateFnsFormat, getYear, getMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { Button, Modal, Badge, Spinner, EmptyState, StatCard, Input, Select, Pagination, ErrorState } from './ui';
import { transactionsSvc, cashRecordsSvc, salesSvc, appointmentsSvc, professionalsSvc } from '../services/salon';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency, formatTime, formatDate } from '../lib/utils';
import type { Transaction, CashRecord } from '../types';

type PeriodMode = 'day' | 'week' | 'month' | 'year';

const PERU_OFFSET_MS = 5 * 60 * 60 * 1000; // UTC-5

const toUTC = (localDate: Date): Date => new Date(localDate.getTime() + PERU_OFFSET_MS);

const MONTH_NAMES_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

interface DateRange { from: string; to: string; label: string; }

const getFinanceDateRange = (opts: {
  mode: PeriodMode;
  selectedDate: string;      // 'yyyy-MM-dd' — used in day mode
  selectedWeekDate: string;  // 'yyyy-MM-dd' — any date inside desired week
  selectedMonth: number;     // 0-11
  selectedYear: number;
}): DateRange => {
  const { mode, selectedDate, selectedWeekDate, selectedMonth, selectedYear } = opts;

  if (mode === 'day') {
    const d = new Date(selectedDate + 'T00:00:00');
    const from = toUTC(d);
    const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
    const label = dateFnsFormat(d, "d 'de' MMMM yyyy", { locale: es });
    return { from: from.toISOString(), to: to.toISOString(), label };
  }

  if (mode === 'week') {
    const base = new Date(selectedWeekDate + 'T00:00:00');
    const weekStart = startOfWeek(base, { weekStartsOn: 1 });
    const weekEnd = addDays(weekStart, 7);
    const from = toUTC(weekStart);
    const to = toUTC(weekEnd);
    const label = `${dateFnsFormat(weekStart, 'd MMM', { locale: es })} — ${dateFnsFormat(addDays(weekEnd, -1), 'd MMM yyyy', { locale: es })}`;
    return { from: from.toISOString(), to: to.toISOString(), label };
  }

  if (mode === 'month') {
    const base = new Date(selectedYear, selectedMonth, 1);
    const monthStart = startOfMonth(base);
    const monthEnd = startOfMonth(new Date(selectedYear, selectedMonth + 1, 1));
    const from = toUTC(monthStart);
    const to = toUTC(monthEnd);
    const label = `${MONTH_NAMES_ES[selectedMonth]} ${selectedYear}`;
    return { from: from.toISOString(), to: to.toISOString(), label };
  }

  // year
  const yearStart = new Date(selectedYear, 0, 1);
  const yearEnd = new Date(selectedYear + 1, 0, 1);
  const from = toUTC(yearStart);
  const to = toUTC(yearEnd);
  const label = String(selectedYear);
  return { from: from.toISOString(), to: to.toISOString(), label };
};

const todayStr = () => new Date().toISOString().split('T')[0];

export default function Finance() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [professionals, setProfessionals] = useState<any[]>([]);
  const [cashRecord, setCashRecord] = useState<CashRecord | null>(null);
  
  // ─── Period filter state ───────────────────────────────────────────
  const [periodMode, setPeriodMode] = useState<PeriodMode>('day');
  const [selectedDate, setSelectedDate] = useState<string>(todayStr());
  const [selectedWeekDate, setSelectedWeekDate] = useState<string>(todayStr());
  const [selectedMonth, setSelectedMonth] = useState<number>(getMonth(new Date()));
  const [selectedYear, setSelectedYear] = useState<number>(getYear(new Date()));
  // For year mode: sub-filter by a specific month (or 'all')
  const [selectedYearMonth, setSelectedYearMonth] = useState<number | 'all'>('all');

  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all');
  const [activeTab, setActiveTab] = useState<'dashboard' | 'cash' | 'methods' | 'vip' | 'staff'>('dashboard');
  
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;
  const [isCashModalOpen, setIsCashModalOpen] = useState(false);
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [txForm, setTxForm] = useState({
    type: 'income' as 'income' | 'expense',
    amount: 0,
    category: 'Servicios en Salón',
    subcategory: '',
    method: 'efectivo',
    description: '',
    date: new Date().toISOString().split('T')[0],
    cash_record_id: ''
  });
  const [isClosingModalOpen, setIsClosingModalOpen] = useState(false);
  const [closingNotes, setClosingNotes] = useState('');
  const [physicalCash, setPhysicalCash] = useState(0);

  // Derived range — recomputed on every render (cheap)
  const dateRange = getFinanceDateRange({ mode: periodMode, selectedDate, selectedWeekDate, selectedMonth, selectedYear });
  const periodLabel = dateRange.label;

  useEffect(() => {
    setCurrentPage(1);
    setSelectedYearMonth('all'); // reset sub-month filter when period changes
  }, [periodMode, selectedDate, selectedWeekDate, selectedMonth, selectedYear, activeTab]);

  const filteredTransactions = transactions.filter(tx => {
    if (filterType !== 'all') {
      const isIncome = ['income', 'saldo_cita', 'adelanto', 'venta'].includes(tx.type);
      if (filterType === 'income' && !isIncome) return false;
      if (filterType === 'expense' && isIncome) return false;
    }
    // In year mode, allow sub-filtering by a specific month
    if (periodMode === 'year' && selectedYearMonth !== 'all') {
      const txMonth = new Date(tx.created_at).getMonth();
      if (txMonth !== selectedYearMonth) return false;
    }
    return true;
  });

  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedTransactions = filteredTransactions.slice(startIndex, endIndex);

  const loadData = useCallback(async () => {
    setLoadError(null);
    const timeoutId = setTimeout(() => {
      setLoading(false);
      setLoadError('La carga tomó demasiado tiempo. Verifica tu conexión.');
    }, 12000);

    try {
      setLoading(true);
      const { data: cashData } = await cashRecordsSvc.getToday();
      setCashRecord(cashData || null);

      const { data: profData } = await professionalsSvc.getAll();
      setProfessionals(profData || []);

      const { from, to } = getFinanceDateRange({ mode: periodMode, selectedDate, selectedWeekDate, selectedMonth, selectedYear });

      const [txRes, salesRes, apptRes] = await Promise.all([
        transactionsSvc.getByRange(from, to),
        salesSvc.getByRange(from, to),
        appointmentsSvc.getByRange(from, to),
      ]);

      const rawTx = (txRes.data || []) as unknown as Transaction[];
      const sortedTx = rawTx.sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setTransactions(sortedTx);
      setSales((salesRes.data || []) as any[]);
      setAppointments((apptRes.data || []) as any[]);
    } catch (err) {
      console.error('Error loading finance data:', err);
      setLoadError('No se pudo cargar la información financiera. Intenta de nuevo.');
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  }, [periodMode, selectedDate, selectedWeekDate, selectedMonth, selectedYear]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ─── CALCULATIONS & KPIS ───────────────────────────────────────────
  // CRIT-01: incomes = service transactions only (no 'venta' — POS sales are in sales table)
  const incomes = transactions
    .filter(t => ['income', 'saldo_cita', 'adelanto'].includes(t.type) && t.status === 'completed')
    .reduce((acc, t) => acc + t.amount, 0);

  const expenses = transactions
    .filter(t => ['expense', 'gasto', 'devolucion_adelanto', 'devolucion_venta'].includes(t.type) && t.status === 'completed')
    .reduce((acc, t) => acc + t.amount, 0);

  // cashIncomes includes 'venta' because POS cash DID enter the register
  const cashIncomes = transactions
    .filter(t => t.method === 'efectivo' && ['income', 'saldo_cita', 'adelanto', 'venta'].includes(t.type) && t.status === 'completed')
    .reduce((acc, t) => acc + t.amount, 0);

  const cashExpenses = transactions
    .filter(t => t.method === 'efectivo' && ['expense', 'gasto', 'devolucion_adelanto', 'devolucion_venta'].includes(t.type) && t.status === 'completed')
    .reduce((acc, t) => acc + t.amount, 0);

  // CRIT-01: productSalesTotal from sales table (source of truth for POS)
  const productSalesTotal = sales.reduce((acc, s) => acc + (Number(s.total) || 0), 0);
  // Total incomes for KPI = service transactions + POS sales (no overlap)
  const totalIncomes = incomes + productSalesTotal;
  // serviceIncomesTotal is already service-only (no subtraction needed)
  const serviceIncomesTotal = incomes;

  const netFlow = totalIncomes - expenses;
  // CRIT-02: For extended periods, show net cash flow
  const isDay = periodMode === 'day';
  const currentBalance = isDay
    ? (cashRecord?.opening_balance || 0) + cashIncomes - cashExpenses
    : cashIncomes - cashExpenses;
  const currentBalanceLabel = isDay ? 'Efectivo Estimado en Caja' : 'Flujo Neto de Efectivo';

  // Breakdown by method for incomes (transactions is correct source \u2014 has payment method detail)
  const getMethodAmount = (m: string) => transactions
    .filter(t => t.method === m && ['income', 'saldo_cita', 'adelanto', 'venta'].includes(t.type) && t.status === 'completed')
    .reduce((acc, t) => acc + t.amount, 0);

  const efectivoAmount = getMethodAmount('efectivo');
  const billeteraAmount = getMethodAmount('billetera') + getMethodAmount('yape') + getMethodAmount('plin');
  const transfAmount = getMethodAmount('transferencia');
  const tarjetaAmount = getMethodAmount('tarjeta');

  // Averages
  const completedAppts = appointments.filter(a => a.status === 'completed');
  const avgServiceTicket = completedAppts.length > 0 
    ? completedAppts.reduce((acc, a) => acc + (Number(a.total_amount) || 0), 0) / completedAppts.length 
    : 0;

  const avgProductTicket = sales.length > 0 
    ? productSalesTotal / sales.length 
    : 0;

  // Service Profitability Ranking (MED-02: using actual income from transactions where possible)
  const serviceStatsMap: { [key: string]: { count: number; revenue: number } } = {};
  
  // Map transactions to appointments for accurate revenue
  const apptRevenueMap: { [key: string]: number } = {};
  transactions.filter(t => t.appointment_id && t.status === 'completed' && ['income', 'saldo_cita', 'adelanto'].includes(t.type))
    .forEach(t => {
      apptRevenueMap[t.appointment_id!] = (apptRevenueMap[t.appointment_id!] || 0) + t.amount;
    });

  completedAppts.forEach(a => {
    const name = a.service_name || 'Servicio General';
    if (!serviceStatsMap[name]) serviceStatsMap[name] = { count: 0, revenue: 0 };
    serviceStatsMap[name].count += 1;
    // Use transaction sum if available, else fallback to total_amount (which might include unpaid parts)
    const realRevenue = apptRevenueMap[a.id] !== undefined ? apptRevenueMap[a.id] : (Number(a.total_amount) || 0);
    serviceStatsMap[name].revenue += realRevenue;
  });
  const serviceRanking = Object.entries(serviceStatsMap)
    .map(([name, stats]) => ({ name, ...stats }))
    .sort((a, b) => b.revenue - a.revenue);

  // VIP Clients Ranking (Top Consumo) - MED-01: group by ID to avoid duplicates
  const clientStatsMap: { [key: string]: { name: string; spent: number; visits: number } } = {};
  
  completedAppts.forEach(a => {
    const id = a.customer_id || a.customer_name || 'anon';
    const name = a.customer_name || 'Cliente Anónimo';
    if (!clientStatsMap[id]) clientStatsMap[id] = { name, spent: 0, visits: 0 };
    clientStatsMap[id].visits += 1;
    const realRevenue = apptRevenueMap[a.id] !== undefined ? apptRevenueMap[a.id] : (Number(a.total_amount) || 0);
    clientStatsMap[id].spent += realRevenue;
  });
  
  sales.forEach(s => {
    const id = s.customer_id || s.client_name || 'anon';
    const name = s.client_name || 'Cliente Anónimo';
    if (!clientStatsMap[id]) clientStatsMap[id] = { name, spent: 0, visits: 1 };
    clientStatsMap[id].spent += Number(s.total) || 0;
  });

  const vipClients = Object.values(clientStatsMap)
    .sort((a, b) => b.spent - a.spent)
    .slice(0, 10);

  // HIGH-02: Staff Performance & Commissions (Services + Products)
  const staffStats = professionals.map(prof => {
    const profAppts = completedAppts.filter(a => a.professional_id === prof.id);
    const apptsAttended = profAppts.length;

    // Service commissions from completed appointments
    const serviceCommissionTotal = profAppts.reduce((acc, a) => acc + (Number(a.commission_amount) || 0), 0);

    // Product commissions from sales items
    let prodCommissionTotal = 0;
    let prodImpulseCount = 0;
    sales.forEach(s => {
      if (s.items && Array.isArray(s.items)) {
        s.items.forEach((item: any) => {
          if (item.impulsed_by === prof.id) {
            prodImpulseCount += Number(item.qty) || 1;
            prodCommissionTotal += Number(item.commission_amount) || 0;
          }
        });
      }
    });

    return {
      ...prof,
      apptsAttended,
      prodImpulseCount,
      prodCommissionTotal,
      serviceCommissionTotal,
      totalCommission: serviceCommissionTotal + prodCommissionTotal
    };
  });

  // periodLabel is derived above from dateRange

  // Cash Operations Handlers
  const handleOpenCash = async () => {
    if (!user) return;
    try {
      const payload = {
        date: new Date().toISOString().split('T')[0],
        opening_balance: openingBalance,
        status: 'open',
        opened_by: user.uid,
        opened_at: new Date().toISOString()
      };
      await cashRecordsSvc.create(payload);
      setIsCashModalOpen(false);
      loadData();
    } catch (err) {
      console.error(err);
      alert('Error abriendo caja.');
    }
  };

  const handleCloseCash = async () => {
    if (!cashRecord || !user) return;
    
    try {
      const difference = physicalCash - currentBalance;
      
      await cashRecordsSvc.update(cashRecord.id, {
        status: 'closed',
        closing_balance: currentBalance,
        closing_difference: difference,
        notes: closingNotes,
        closed_by: user.uid,
        closed_at: new Date().toISOString()
      });
      
      setIsClosingModalOpen(false);
      setClosingNotes('');
      setPhysicalCash(0);
      loadData();
    } catch (err) {
      console.error(err);
      alert('Error cerrando caja.');
    }
  };

  const handleCreateTx = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (txForm.amount <= 0) {
      alert('Por favor ingresa un monto válido mayor a 0.');
      return;
    }
    if (txForm.type === 'expense' && !txForm.subcategory) {
      alert('Por favor selecciona una subcategoría para el gasto.');
      return;
    }

    // CRIT-03: use local variable — never mutate txForm directly
    let cashRecordId: string | null = null;
    if (txForm.method === 'efectivo') {
      const { data: records } = await cashRecordsSvc.getByDate(txForm.date);
      const targetRecord = records && records[0];
      if (!targetRecord || targetRecord.status === 'closed') {
        alert(`No hay una caja abierta para la fecha ${txForm.date}. Debes abrir la caja de ese día para registrar movimientos en efectivo.`);
        return;
      }
      cashRecordId = targetRecord.id; // local var, not state mutation
    }

    try {
      const payload = {
        cash_record_id: cashRecordId,
        type: txForm.type,
        status: 'completed',
        category: txForm.category,
        subcategory: txForm.subcategory,
        amount: Number(txForm.amount),
        method: txForm.method,
        description: txForm.description,
        user_id: user.uid,
        created_at: new Date(`${txForm.date}T${new Date().toLocaleTimeString('en-GB', { hour12: false })}`).toISOString()
      };
      // SEC-01: removed console.log with financial payload
      const { error } = await transactionsSvc.create(payload as any);
      if (error) throw error;
      setIsTxModalOpen(false);
      setTxForm({ ...txForm, amount: 0, description: '', subcategory: '', date: new Date().toISOString().split('T')[0] });
      loadData();
    } catch (err: any) {
      console.error('Error in handleCreateTx:', err);
      alert(`Error registrando transacción: ${err.message || 'Error desconocido'}`);
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-8 animate-fade-in bg-background h-full overflow-y-auto font-sans">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-4xl font-serif text-on-surface tracking-tight font-normal">
            Centro Financiero y Decisiones
          </h1>
          <p className="text-on-surface-variant mt-2 max-w-xl text-sm">
            Módulo gerencial integrado para el control de liquidez, rentabilidad de servicios, ranking VIP de clientes y comisiones del staff.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* ── Dynamic Period Filter ──────────────────── */}
          <div className="flex flex-wrap items-center gap-2 p-1.5 bg-surface-container-low rounded-2xl border border-outline-variant/20">
            {/* Mode selector */}
            <div className="w-32">
              <Select
                value={periodMode}
                onChange={e => setPeriodMode(e.target.value as PeriodMode)}
                options={[
                  { value: 'day',   label: 'Día' },
                  { value: 'week',  label: 'Semana' },
                  { value: 'month', label: 'Mes' },
                  { value: 'year',  label: 'Año' },
                ]}
                id="period-mode"
              />
            </div>

            {/* Day picker */}
            {periodMode === 'day' && (
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="h-12 px-3 rounded-full bg-surface border border-outline-variant/30 text-on-surface text-sm focus:outline-none focus:border-primary transition-all"
              />
            )}

            {/* Week picker — pick any date, we derive the week */}
            {periodMode === 'week' && (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={selectedWeekDate}
                  onChange={e => setSelectedWeekDate(e.target.value)}
                  className="h-12 px-3 rounded-full bg-surface border border-outline-variant/30 text-on-surface text-sm focus:outline-none focus:border-primary transition-all"
                />
                <span className="text-xs text-on-surface-variant font-medium whitespace-nowrap">{periodLabel}</span>
              </div>
            )}

            {/* Month + Year pickers */}
            {periodMode === 'month' && (
              <div className="flex items-center gap-2">
                <select
                  value={selectedMonth}
                  onChange={e => setSelectedMonth(Number(e.target.value))}
                  className="h-12 px-3 rounded-full bg-surface border border-outline-variant/30 text-on-surface text-sm focus:outline-none focus:border-primary transition-all"
                >
                  {MONTH_NAMES_ES.map((m, i) => (
                    <option key={i} value={i}>{m}</option>
                  ))}
                </select>
                <select
                  value={selectedYear}
                  onChange={e => setSelectedYear(Number(e.target.value))}
                  className="h-12 px-3 rounded-full bg-surface border border-outline-variant/30 text-on-surface text-sm focus:outline-none focus:border-primary transition-all"
                >
                  {Array.from({ length: 5 }, (_, i) => getYear(new Date()) - 2 + i).map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Year picker */}
            {periodMode === 'year' && (
              <div className="flex items-center gap-2">
                <select
                  value={selectedYear}
                  onChange={e => { setSelectedYear(Number(e.target.value)); setSelectedYearMonth('all'); }}
                  className="h-12 px-3 rounded-full bg-surface border border-outline-variant/30 text-on-surface text-sm focus:outline-none focus:border-primary transition-all"
                >
                  {Array.from({ length: 5 }, (_, i) => getYear(new Date()) - 2 + i).map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
                <select
                  value={selectedYearMonth}
                  onChange={e => setSelectedYearMonth(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                  className="h-12 px-3 rounded-full bg-surface border border-outline-variant/30 text-on-surface text-sm focus:outline-none focus:border-primary transition-all"
                >
                  <option value="all">Todos los meses</option>
                  {MONTH_NAMES_ES.map((m, i) => (
                    <option key={i} value={i}>{m}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <Button variant="ghost" onClick={() => setIsTxModalOpen(true)}>
            <span className="material-symbols-outlined mr-2">receipt_long</span>
            Nuevo Movimiento
          </Button>
          {!cashRecord ? (
            <Button variant="primary" onClick={() => setIsCashModalOpen(true)} className="shadow-lg shadow-primary/20">
              <span className="material-symbols-outlined mr-2">lock_open</span>
              Abrir Caja
            </Button>
          ) : cashRecord.status === 'open' ? (
            <Button variant="danger" onClick={() => {
              setPhysicalCash(currentBalance);
              setIsClosingModalOpen(true);
            }}>
              <span className="material-symbols-outlined mr-2">lock</span>
              Cerrar Caja
            </Button>
          ) : (
            <Badge variant="success" className="px-6 py-3 text-sm">
              Caja Cerrada
            </Badge>
          )}
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-outline-variant/30 gap-2 overflow-x-auto pb-1">
        {[
          { id: 'dashboard', label: 'Dashboard Gerencial', icon: 'donut_large' },
          { id: 'cash', label: 'Caja Diaria & Movimientos', icon: 'point_of_sale' },
          { id: 'methods', label: 'Métodos de Pago & Origen', icon: 'account_balance_wallet' },
          { id: 'vip', label: 'Rentabilidad & Clientes VIP', icon: 'workspace_premium' },
          { id: 'staff', label: 'Staff & Comisiones', icon: 'groups' }
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as any)}
            className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-medium transition-all whitespace-nowrap ${
              activeTab === t.id
                ? 'bg-primary text-white shadow-md shadow-primary/20'
                : 'text-on-surface-variant hover:bg-surface-container-high'
            }`}
          >
            <span className="material-symbols-outlined text-lg">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Spinner size="lg" />
        </div>
      ) : loadError ? (
        <div className="py-8">
          <ErrorState message={loadError} onRetry={loadData} />
        </div>
      ) : (
        <>
          {/* TAB 1: DASHBOARD GERENCIAL */}
          {activeTab === 'dashboard' && (
            <div className="space-y-8 animate-fade-in">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <StatCard
                  title={`Ingresos (${periodLabel})`}
                  value={formatCurrency(totalIncomes)}
                  icon={<span className="material-symbols-outlined text-secondary">payments</span>}
                  className="bg-secondary/5 border-secondary/20"
                />
                <StatCard
                  title={`Egresos (${periodLabel})`}
                  value={formatCurrency(expenses)}
                  icon={<span className="material-symbols-outlined text-error">money_off</span>}
                  className="bg-error/5 border-error/20"
                />
                <StatCard
                  title="Flujo Neto (Ganancia)"
                  value={formatCurrency(netFlow)}
                  subtitle="Ingresos menos Egresos"
                  icon={<span className="material-symbols-outlined text-primary">trending_up</span>}
                  className="bg-primary/5 border-primary/20"
                />
                <StatCard
                  title={currentBalanceLabel}
                  value={formatCurrency(currentBalance)}
                  subtitle={isDay ? `Apertura: ${formatCurrency(cashRecord?.opening_balance || 0)}` : 'Ingresos - Egresos en efectivo'}
                  icon={<span className="material-symbols-outlined text-amber-600">point_of_sale</span>}
                />
              </div>

              {/* Liquidez y Ticket Promedio */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 bg-surface-container-lowest rounded-[2rem] p-6 md:p-8 border border-outline-variant/30 shadow-sm space-y-6">
                  <h3 className="text-xl font-serif text-on-surface flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">account_balance_wallet</span>
                    Cobros por Método de Pago ({periodLabel})
                  </h3>
                  <p className="text-[10px] text-on-surface-variant/70 font-bold uppercase tracking-wider -mt-4">
                    Distribución de ingresos cobrados. No descuenta egresos ni gastos.
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-2">
                    <div className="p-4 bg-surface-container-low rounded-2xl border border-outline-variant/20">
                      <span className="text-xs text-on-surface-variant block mb-1">Efectivo</span>
                      <span className="text-xl font-bold text-on-surface">{formatCurrency(efectivoAmount)}</span>
                    </div>
                    <div className="p-4 bg-surface-container-low rounded-2xl border border-outline-variant/20">
                      <span className="text-xs text-on-surface-variant block mb-1">Billetera (Yape/Plin)</span>
                      <span className="text-xl font-bold text-secondary">{formatCurrency(billeteraAmount)}</span>
                    </div>
                    <div className="p-4 bg-surface-container-low rounded-2xl border border-outline-variant/20">
                      <span className="text-xs text-on-surface-variant block mb-1">Transferencia</span>
                      <span className="text-xl font-bold text-on-surface">{formatCurrency(transfAmount)}</span>
                    </div>
                    <div className="p-4 bg-surface-container-low rounded-2xl border border-outline-variant/20">
                      <span className="text-xs text-on-surface-variant block mb-1">Tarjeta / POS</span>
                      <span className="text-xl font-bold text-on-surface">{formatCurrency(tarjetaAmount)}</span>
                    </div>
                    <div className="p-4 bg-primary/10 rounded-2xl border border-primary/20 sm:col-span-2">
                      <span className="text-xs text-primary font-bold block mb-1">Total Digital</span>
                      <span className="text-xl font-bold text-primary">{formatCurrency(billeteraAmount + transfAmount + tarjetaAmount)}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-surface-container-lowest rounded-[2rem] p-6 md:p-8 border border-outline-variant/30 shadow-sm space-y-6">
                  <h3 className="text-xl font-serif text-on-surface flex items-center gap-2">
                    <span className="material-symbols-outlined text-secondary">insights</span>
                    Métricas de Decisión
                  </h3>
                  <div className="space-y-4 pt-2">
                    <div className="p-4 bg-surface-container-low rounded-2xl flex justify-between items-center">
                      <div>
                        <span className="text-xs text-on-surface-variant block">Ticket Promedio Servicios</span>
                        <span className="text-sm text-on-surface-variant">Por cita atendida</span>
                      </div>
                      <span className="text-lg font-bold text-secondary">{formatCurrency(avgServiceTicket)}</span>
                    </div>
                    <div className="p-4 bg-surface-container-low rounded-2xl flex justify-between items-center">
                      <div>
                        <span className="text-xs text-on-surface-variant block">Ticket Promedio Productos</span>
                        <span className="text-sm text-on-surface-variant">Por venta en POS</span>
                      </div>
                      <span className="text-lg font-bold text-primary">{formatCurrency(avgProductTicket)}</span>
                    </div>
                    <div className="p-4 bg-surface-container-low rounded-2xl flex justify-between items-center">
                      <div>
                        <span className="text-xs text-on-surface-variant block">Citas Atendidas</span>
                        <span className="text-sm text-on-surface-variant">Estado completado</span>
                      </div>
                      <span className="text-lg font-bold text-on-surface">{completedAppts.length}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: CAJA DIARIA & MOVIMIENTOS */}
          {activeTab === 'cash' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fade-in">
              <div className="lg:col-span-2 bg-surface-container-lowest rounded-[2rem] p-6 md:p-8 border border-outline-variant/30 shadow-sm space-y-6">
                <h3 className="text-xl font-serif text-on-surface flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">list_alt</span>
                  Historial de Movimientos ({periodLabel})
                </h3>

                {transactions.length === 0 ? (
                  <EmptyState
                    icon={<span className="material-symbols-outlined text-[48px] text-outline/50 select-none">receipt_long</span>}
                    title="Sin movimientos"
                    description={`No hay transacciones registradas en ${periodLabel.toLowerCase()}.`}
                  />
                ) : (
                  <>
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                  <div className="flex items-center gap-2 bg-surface-container-low p-1 rounded-xl w-fit">
                    <button
                      onClick={() => setFilterType('all')}
                      className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                        filterType === 'all' 
                        ? 'bg-primary text-on-primary shadow-md' 
                        : 'text-on-surface-variant hover:bg-surface-container-high'
                      }`}
                    >
                      Todos
                    </button>
                    <button
                      onClick={() => setFilterType('income')}
                      className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                        filterType === 'income' 
                        ? 'bg-success text-white shadow-md' 
                        : 'text-on-surface-variant hover:bg-surface-container-high'
                      }`}
                    >
                      Ingresos
                    </button>
                    <button
                      onClick={() => setFilterType('expense')}
                      className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                        filterType === 'expense' 
                        ? 'bg-danger text-white shadow-md' 
                        : 'text-on-surface-variant hover:bg-surface-container-high'
                      }`}
                    >
                      Egresos
                    </button>
                  </div>
                  <div className="flex items-center gap-2 text-on-surface-variant text-sm font-medium">
                    <span className="opacity-70">Mostrando:</span>
                    <Badge variant="default" className="px-3">
                      {filteredTransactions.length} movimientos
                    </Badge>
                  </div>
                </div>

                {periodMode === 'year' && (
                  <div className="mb-6 animate-fade-in">
                    <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-3 opacity-70">
                      Explorar por Mes
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => setSelectedYearMonth('all')}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${
                          selectedYearMonth === 'all'
                            ? 'bg-primary/10 border-primary text-primary shadow-sm'
                            : 'border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-high'
                        }`}
                      >
                        Todo el Año
                      </button>
                      {MONTH_NAMES_ES.map((monthName, i) => {
                        const hasActivity = transactions.some(tx => new Date(tx.created_at).getMonth() === i);
                        if (!hasActivity) return null;
                        return (
                          <button
                            key={i}
                            onClick={() => setSelectedYearMonth(i)}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all border capitalize ${
                              selectedYearMonth === i
                                ? 'bg-primary/10 border-primary text-primary shadow-sm'
                                : 'border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-high'
                            }`}
                          >
                            {monthName}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-outline-variant/30 text-[11px] uppercase tracking-wider text-on-surface-variant font-semibold">
                          <th className="pb-3 px-4">{isDay ? 'Hora' : 'Fecha'}</th>
                          <th className="pb-3 px-4">Categoría</th>
                          <th className="pb-3 px-4">Descripción</th>
                          <th className="pb-3 px-4">Método</th>
                          <th className="pb-3 px-4 text-right">Monto</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant/10">
                        {paginatedTransactions.map(tx => {
                          const isIncome = ['income', 'saldo_cita', 'adelanto', 'venta'].includes(tx.type);
                          return (
                            <tr key={tx.id} className="hover:bg-surface-container-low/50 transition-colors">
                              <td className="py-4 px-4 text-sm text-on-surface-variant whitespace-nowrap">
                                {isDay ? formatTime(tx.created_at) : formatDate(tx.created_at, 'dd/MM HH:mm')}
                              </td>
                              <td className="py-4 px-4">
                                <div className="flex flex-col gap-1">
                                  <Badge variant={isIncome ? 'success' : 'danger'}>
                                    {tx.category}
                                  </Badge>
                                  {tx.subcategory && (
                                    <span className="text-[10px] text-on-surface-variant font-medium ml-1">
                                      ↳ {tx.subcategory}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-4 px-4 text-sm font-medium text-on-surface">
                                {tx.description || tx.type}
                              </td>
                              <td className="py-4 px-4 text-sm text-on-surface-variant capitalize">
                                {tx.method}
                              </td>
                              <td className={`py-4 px-4 text-right font-semibold ${isIncome ? 'text-secondary' : 'text-error'}`}>
                                {isIncome ? '+' : '-'}{formatCurrency(tx.amount)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    {totalPages > 1 && (
                      <Pagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        onPageChange={setCurrentPage}
                      />
                    )}
                  </div>
                  </>
                )}
              </div>

              <div className="space-y-6">
                <div className="bg-surface-container-low rounded-[2rem] p-6 border border-outline-variant/30 space-y-4">
                  <h4 className="font-serif text-lg text-on-surface">Estado de Caja de Hoy</h4>
                  {cashRecord ? (
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-on-surface-variant">Estado</span>
                        <Badge variant={cashRecord.status === 'open' ? 'success' : 'default'}>
                          {cashRecord.status === 'open' ? 'Abierta' : 'Cerrada'}
                        </Badge>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-on-surface-variant">Apertura</span>
                        <span className="text-sm font-medium">{formatTime(cashRecord.opened_at)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-on-surface-variant">Monto Inicial</span>
                        <span className="text-sm font-medium">{formatCurrency(cashRecord.opening_balance)}</span>
                      </div>
                      {cashRecord.closed_at && (
                        <div className="flex justify-between items-center border-t border-outline-variant/20 pt-2">
                          <span className="text-sm text-on-surface-variant">Cierre</span>
                          <span className="text-sm font-medium">{formatTime(cashRecord.closed_at)}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-6 text-on-surface-variant/70 text-sm">
                      La caja no ha sido abierta hoy. Utiliza el botón superior para iniciar el turno.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: MÉTODOS DE PAGO & ORIGEN */}
          {activeTab === 'methods' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-fade-in">
              <div className="bg-surface-container-lowest rounded-[2rem] p-6 md:p-8 border border-outline-variant/30 shadow-sm space-y-6">
                <h3 className="text-xl font-serif text-on-surface flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">pie_chart</span>
                  Ingresos por Método de Pago ({periodLabel})
                </h3>
                <div className="space-y-5 pt-2">
                  {[
                    { label: 'Billetera (Yape/Plin)', amount: billeteraAmount, color: 'bg-secondary' },
                    { label: 'Efectivo', amount: efectivoAmount, color: 'bg-amber-600' },
                    { label: 'Transferencia', amount: transfAmount, color: 'bg-emerald-600' },
                    { label: 'Tarjeta / POS', amount: tarjetaAmount, color: 'bg-blue-600' }
                  ].map(m => {
                    const pct = totalIncomes > 0 ? Math.round((m.amount / totalIncomes) * 100) : 0;
                    return (
                      <div key={m.label} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="font-medium text-on-surface">{m.label}</span>
                          <span className="text-on-surface-variant">{formatCurrency(m.amount)} ({pct}%)</span>
                        </div>
                        <div className="h-2 w-full bg-surface-container-high rounded-full overflow-hidden">
                          <div className={`h-full ${m.color}`} style={{ width: `${pct}%` }}></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-surface-container-lowest rounded-[2rem] p-6 md:p-8 border border-outline-variant/30 shadow-sm space-y-6">
                <h3 className="text-xl font-serif text-on-surface flex items-center gap-2">
                  <span className="material-symbols-outlined text-secondary">donut_small</span>
                  Origen de Ingresos: Servicios vs Productos
                </h3>
                <div className="space-y-6 pt-4">
                  <div className="p-5 bg-surface-container-low rounded-2xl flex justify-between items-center border border-outline-variant/20">
                    <div>
                      <span className="font-serif text-lg text-on-surface block">Servicios en Salón</span>
                      <span className="text-xs text-on-surface-variant">Citas y tratamientos</span>
                    </div>
                    <span className="text-2xl font-bold text-secondary">{formatCurrency(serviceIncomesTotal)}</span>
                  </div>

                  <div className="p-5 bg-surface-container-low rounded-2xl flex justify-between items-center border border-outline-variant/20">
                    <div>
                      <span className="font-serif text-lg text-on-surface block">Venta de Productos</span>
                      <span className="text-xs text-on-surface-variant">POS e impulso de ventas</span>
                    </div>
                    <span className="text-2xl font-bold text-primary">{formatCurrency(productSalesTotal)}</span>
                  </div>

                  <div className="pt-4 border-t border-outline-variant/20">
                    <div className="flex justify-between text-sm mb-2">
                      <span className="font-semibold text-on-surface">Proporción de Venta de Productos</span>
                      <span className="font-bold text-primary">
                        {totalIncomes > 0 ? Math.round((productSalesTotal / totalIncomes) * 100) : 0}%
                      </span>
                    </div>
                    <div className="h-3 w-full bg-secondary/20 rounded-full overflow-hidden flex">
                      <div className="h-full bg-secondary" style={{ width: `${totalIncomes > 0 ? (serviceIncomesTotal / totalIncomes) * 100 : 0}%` }}></div>
                      <div className="h-full bg-primary" style={{ width: `${totalIncomes > 0 ? (productSalesTotal / totalIncomes) * 100 : 0}%` }}></div>
                    </div>
                    <div className="flex justify-between text-xs text-on-surface-variant mt-2">
                      <span>Servicios</span>
                      <span>Productos (Meta: 15-20%)</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: RENTABILIDAD & CLIENTES VIP */}
          {activeTab === 'vip' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-fade-in">
              <div className="bg-surface-container-lowest rounded-[2rem] p-6 md:p-8 border border-outline-variant/30 shadow-sm space-y-6">
                <h3 className="text-xl font-serif text-on-surface flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">auto_graph</span>
                  Servicios Más Rentables ({periodLabel})
                </h3>
                {serviceRanking.length === 0 ? (
                  <EmptyState title="Sin datos" description="No se han registrado servicios completados en este periodo." icon={<span className="material-symbols-outlined text-3xl opacity-50">spa</span>} />
                ) : (
                  <div className="space-y-4 pt-2">
                    {serviceRanking.map((srv, idx) => (
                      <div key={srv.name} className="p-4 bg-surface-container-low rounded-2xl flex justify-between items-center border border-outline-variant/20">
                        <div className="flex items-center gap-3">
                          <span className="w-8 h-8 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-xs">
                            {idx + 1}
                          </span>
                          <div>
                            <span className="font-medium text-on-surface block text-sm">{srv.name}</span>
                            <span className="text-xs text-on-surface-variant">{srv.count} atenciones</span>
                          </div>
                        </div>
                        <span className="font-bold text-secondary">{formatCurrency(srv.revenue)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-surface-container-lowest rounded-[2rem] p-6 md:p-8 border border-outline-variant/30 shadow-sm space-y-6">
                <h3 className="text-xl font-serif text-on-surface flex items-center gap-2">
                  <span className="material-symbols-outlined text-amber-600">workspace_premium</span>
                  Top 10 Clientes VIP (Consumo)
                </h3>
                {vipClients.length === 0 ? (
                  <EmptyState title="Sin clientes VIP" description="No hay registros de consumo en este periodo." icon={<span className="material-symbols-outlined text-3xl opacity-50">group</span>} />
                ) : (
                  <div className="space-y-4 pt-2">
                    {vipClients.map((cli, idx) => (
                      <div key={cli.name} className="p-4 bg-surface-container-low rounded-2xl flex justify-between items-center border border-outline-variant/20">
                        <div className="flex items-center gap-3">
                          <span className={`w-8 h-8 rounded-full font-bold flex items-center justify-center text-xs ${
                            idx === 0 ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                            idx === 1 ? 'bg-stone-200 text-stone-800' :
                            idx === 2 ? 'bg-amber-900/10 text-amber-900' : 'bg-surface-container-high text-on-surface-variant'
                          }`}>
                            {idx + 1}
                          </span>
                          <div>
                            <span className="font-medium text-on-surface block text-sm">{cli.name}</span>
                            <span className="text-xs text-on-surface-variant">{cli.visits} visitas registradas</span>
                          </div>
                        </div>
                        <span className="font-bold text-primary">{formatCurrency(cli.spent)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 5: STAFF & COMISIONES */}
          {activeTab === 'staff' && (
            <div className="bg-surface-container-lowest rounded-[2rem] p-6 md:p-8 border border-outline-variant/30 shadow-sm space-y-6 animate-fade-in">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-serif text-on-surface flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">groups</span>
                  Desempeño y Comisiones de Staff ({periodLabel})
                </h3>
                <span className="text-xs text-on-surface-variant bg-surface-container-low px-3 py-1.5 rounded-full font-medium">
                  Comisión aplica a venta de productos
                </span>
              </div>

              {staffStats.length === 0 ? (
                <EmptyState title="Sin profesionales" description="No hay profesionales registrados en el sistema." icon={<span className="material-symbols-outlined text-3xl opacity-50">badge</span>} />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-2">
                  {staffStats.map(member => (
                    <div key={member.id} className="bg-surface-container-low rounded-2xl p-6 border border-outline-variant/20 flex flex-col justify-between space-y-6">
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xl uppercase border border-primary/20">
                          {member.name.slice(0, 2)}
                        </div>
                        <div>
                          <h4 className="font-bold text-on-surface text-base">{member.name}</h4>
                          <span className="text-xs text-on-surface-variant block">{member.specialties || 'Especialista'}</span>
                        </div>
                      </div>

                      <div className="space-y-3 pt-4 border-t border-outline-variant/20">
                        <div className="flex justify-between text-sm">
                          <span className="text-on-surface-variant">Citas Atendidas</span>
                          <span className="font-bold text-on-surface">{member.apptsAttended}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-on-surface-variant">Comisión Servicios</span>
                          <span className="font-bold text-secondary">{formatCurrency(member.serviceCommissionTotal)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-on-surface-variant">Productos Impulsados</span>
                          <span className="font-bold text-on-surface">{member.prodImpulseCount} uds</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-on-surface-variant">Comisión Productos</span>
                          <span className="font-bold text-on-surface">{formatCurrency(member.prodCommissionTotal)}</span>
                        </div>
                        <div className="flex justify-between text-sm p-3 bg-white rounded-xl border border-outline-variant/30">
                          <span className="font-bold text-primary">Total Comisiones</span>
                          <span className="font-bold text-secondary">{formatCurrency(member.totalCommission)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Modal Apertura Caja */}
      <Modal
        open={isCashModalOpen}
        onClose={() => setIsCashModalOpen(false)}
        title="Apertura de Caja"
      >
        <div className="space-y-6">
          <p className="text-on-surface-variant text-sm">
            Ingresa el monto inicial (sencillo) con el que se abre la caja del local hoy.
          </p>
          <div>
            <label htmlFor="open_balance_input" className="block text-sm font-medium text-on-surface-variant mb-1 ml-1">Monto de Apertura ($)</label>
            <Input
              id="open_balance_input"
              type="number"
              step="0.01"
              min="0"
              value={openingBalance}
              onChange={(e) => setOpeningBalance(parseFloat(e.target.value) || 0)}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-outline-variant/20">
            <Button variant="ghost" onClick={() => setIsCashModalOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={handleOpenCash}>Abrir Caja</Button>
          </div>
        </div>
      </Modal>

      {/* Modal Nuevo Movimiento */}
      <Modal
        open={isTxModalOpen}
        onClose={() => setIsTxModalOpen(false)}
        title="Nuevo Movimiento Manual"
      >
        <form onSubmit={handleCreateTx} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Select
                label="Tipo de Movimiento"
                value={txForm.type}
                onChange={e => setTxForm({ ...txForm, type: e.target.value as any })}
                options={[
                  { value: 'income', label: 'Ingreso (Entrada)' },
                  { value: 'expense', label: 'Egreso (Salida)' }
                ]}
              />
            </div>
            <div>
              <Select
                label="Categoría"
                value={txForm.category}
                onChange={e => setTxForm({ ...txForm, category: e.target.value, subcategory: '' })}
                options={
                  txForm.type === 'income' 
                    ? [
                        { value: 'Servicios en Salón', label: 'Servicios en Salón' }, 
                        { value: 'Venta de Productos', label: 'Venta de Productos' },
                        { value: 'Otros Ingresos', label: 'Otros Ingresos' },
                        { value: 'Inversión', label: 'Inversión' }
                      ]
                    : [
                        { value: 'Operativos Directos', label: 'Operativos Directos' },
                        { value: 'Operativos Indirectos', label: 'Operativos Indirectos' },
                        { value: 'Personal', label: 'Gastos de Personal' },
                        { value: 'Marketing', label: 'Marketing y Publicidad' },
                        { value: 'Administrativos', label: 'Gastos Administrativos' },
                        { value: 'Otros', label: 'Otros Gastos' }
                      ]
                }
              />
            </div>
            {txForm.type === 'expense' && (
              <div>
                <Select
                  label="Subcategoría"
                  value={txForm.subcategory}
                  onChange={e => setTxForm({ ...txForm, subcategory: e.target.value })}
                  options={[
                    { value: '', label: 'Seleccionar subcategoría...' },
                    ...(txForm.category === 'Operativos Directos' ? [
                      { value: 'Insumos', label: 'Insumos y Materiales' },
                      { value: 'Productos para venta', label: 'Productos para Venta' },
                      { value: 'Equipos', label: 'Equipos y Herramientas' }
                    ] : []),
                    ...(txForm.category === 'Operativos Indirectos' ? [
                      { value: 'Alquiler', label: 'Alquiler de Local' },
                      { value: 'Servicios públicos', label: 'Luz, Agua, Internet' },
                      { value: 'Mantenimiento', label: 'Reparaciones y Mantenimiento' },
                      { value: 'Limpieza', label: 'Productos de Limpieza' }
                    ] : []),
                    ...(txForm.category === 'Personal' ? [
                      { value: 'Comisiones servicios', label: 'Comisiones por Servicios' },
                      { value: 'Comisiones ventas', label: 'Comisiones por Ventas' },
                      { value: 'Sueldo fijo', label: 'Sueldo Fijo / Recepción' },
                      { value: 'Bonos', label: 'Bonos e Incentivos' }
                    ] : []),
                    ...(txForm.category === 'Marketing' ? [
                      { value: 'Publicidad digital', label: 'Instagram / Facebook Ads' },
                      { value: 'Material impreso', label: 'Flyers / Tarjetas' },
                      { value: 'Promociones', label: 'Descuentos / Ofertas' },
                      { value: 'Fotografía', label: 'Contenido y Fotos' }
                    ] : []),
                    ...(txForm.category === 'Administrativos' ? [
                      { value: 'Software', label: 'App de Gestión / Sistemas' },
                      { value: 'Papelería', label: 'Útiles de Oficina / Facturas' },
                      { value: 'Gastos bancarios', label: 'Comisiones / Bancos' },
                      { value: 'Consultoría', label: 'Contador / Asesoría' }
                    ] : []),
                    ...(txForm.category === 'Otros' ? [
                      { value: 'Imprevistos', label: 'Gastos no Planificados' },
                      { value: 'Capacitación', label: 'Cursos y Formación' },
                      { value: 'Mermas', label: 'Productos Dañados / Vencidos' },
                      { value: 'Otros', label: 'Otros no Clasificados' }
                    ] : [])
                  ]}
                  required
                />
              </div>
            )}
            <div>
              <Input
                label="Monto ($)"
                type="number"
                step="0.01"
                min="0.01"
                required
                value={txForm.amount || ''}
                onChange={e => setTxForm({ ...txForm, amount: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div>
              <Input
                label="Fecha de Movimiento"
                type="date"
                required
                value={txForm.date}
                onChange={e => setTxForm({ ...txForm, date: e.target.value })}
              />
            </div>
            <div>
              <Select
                label="Método de Pago"
                value={txForm.method}
                onChange={e => setTxForm({ ...txForm, method: e.target.value })}
                options={[
                  { value: 'efectivo', label: 'Efectivo' },
                  { value: 'transferencia', label: 'Transferencia' },
                  { value: 'billetera', label: 'Billetera (Yape/Plin)' },
                  { value: 'tarjeta', label: 'Tarjeta' }
                ]}
              />
            </div>
            <div className="col-span-1 md:col-span-2">
              <Input
                label="Descripción / Razón"
                required
                placeholder="Ej. Compra de papel toalla"
                value={txForm.description}
                onChange={e => setTxForm({ ...txForm, description: e.target.value })}
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-outline-variant/20">
            <Button type="button" variant="ghost" onClick={() => setIsTxModalOpen(false)}>Cancelar</Button>
            <Button type="submit" variant="primary">Registrar Movimiento</Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={isClosingModalOpen}
        onClose={() => setIsClosingModalOpen(false)}
        title="Cerrar Caja de Hoy"
      >
        <div className="space-y-6">
          <div className="p-4 bg-surface-container-low rounded-2xl space-y-2 border border-outline-variant/20">
            <div className="flex justify-between text-sm">
              <span className="text-on-surface-variant">Efectivo Esperado (Sistema):</span>
              <span className="font-bold text-on-surface">{formatCurrency(currentBalance)}</span>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-on-surface-variant mb-1 ml-1">Efectivo Real en Caja ($)</label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={physicalCash}
                onChange={e => setPhysicalCash(parseFloat(e.target.value) || 0)}
                placeholder="Ingresa el monto contado"
              />
            </div>

            <div className={`p-4 rounded-2xl flex justify-between items-center ${physicalCash === currentBalance ? 'bg-success/10 text-success' : 'bg-error/10 text-error'}`}>
              <span className="text-sm font-medium">Diferencia:</span>
              <span className="text-lg font-bold">
                {formatCurrency(physicalCash - currentBalance)}
              </span>
            </div>

            <div>
              <label className="block text-sm font-medium text-on-surface-variant mb-1 ml-1">Observaciones / Notas</label>
              <Input
                placeholder="Ej. Faltan 2 soles por cambio, o todo conforme."
                value={closingNotes}
                onChange={e => setClosingNotes(e.target.value)}
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="ghost" onClick={() => setIsClosingModalOpen(false)} className="flex-1">
              Cancelar
            </Button>
            <Button variant="danger" onClick={handleCloseCash} className="flex-1">
              Confirmar Cierre
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
