import { useState, useEffect, useCallback } from 'react';
import {
  AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend
} from 'recharts';
import { format, parseISO, subDays, subYears, startOfYear, endOfYear } from 'date-fns';
import { es } from 'date-fns/locale';
import { StatCard, Card, Badge, EmptyState, Spinner } from './ui';
import { formatCurrency, formatTime, STATUS_LABELS, STATUS_COLORS, getWhatsAppLink } from '../lib/utils';
import { appointmentsSvc, transactionsSvc, customersSvc, salesSvc, productsSvc, configSvc } from '../services/salon';
import type { Appointment, Product, SalonConfig } from '../types';

// ─── Types ───────────────────────────────────────────────────
interface DashboardData {
  todayAppointments: Appointment[];
  todayRevenue: number;
  todaySales: number;
  activeClients: number;
  revenueChart: { date: string; total: number }[];
  lowStock: Product[];
  birthdays: any[];
  loading: boolean;
  yearlyComparison: {
    monthName: string;
    currentYearResult: number;
    prevYearResult: number;
  }[];
  currentYearNetTotal: number;
  prevYearNetTotal: number;
  acquisitionChannels: { name: string; count: number; percentage: number }[];
}

// ─── Helpers ─────────────────────────────────────────────────
const buildRevenueChart = (transactions: any[]) => {
  const map: Record<string, number> = {};
  for (let i = 29; i >= 0; i--) {
    const d = format(subDays(new Date(), i), 'dd/MM');
    map[d] = 0;
  }
  transactions.forEach(t => {
    if (t.created_at && ['income', 'saldo_cita', 'adelanto', 'venta'].includes(t.type) && t.status === 'completed') {
      const txDate = parseISO(t.created_at);
      if (!isNaN(txDate.getTime())) {
        const d = format(txDate, 'dd/MM');
        if (map[d] !== undefined) map[d] += Number(t.amount);
      }
    }
  });
  return Object.entries(map).map(([date, total]) => ({ date, total }));
};

const greetingByHour = () => {
  const h = new Date().getHours();
  if (h < 12) return '¡Buenos días';
  if (h < 19) return '¡Buenas tardes';
  return '¡Buenas noches';
};

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const getUpcomingBirthdays = (customers: any[]) => {
  const now = new Date();
  const currentMonth = now.getMonth(); // 0-11
  const nextMonth = (currentMonth + 1) % 12;

  const currentMonthNum = currentMonth + 1; // 1-12
  const nextMonthNum = nextMonth + 1; // 1-12

  const list: any[] = [];

  customers.forEach(c => {
    if (!c.birth_date || typeof c.birth_date !== 'string') return;
    const parts = c.birth_date.split('-');
    if (parts.length !== 3) return;
    const [_, mStr, dStr] = parts;
    const m = parseInt(mStr, 10);
    const d = parseInt(dStr, 10);

    if (m === currentMonthNum || m === nextMonthNum) {
      list.push({
        ...c,
        birthMonth: m,
        birthDay: d,
        isNextMonth: m === nextMonthNum,
      });
    }
  });

  return list.sort((a, b) => {
    const orderA = a.birthMonth === currentMonthNum ? 0 : 1;
    const orderB = b.birthMonth === currentMonthNum ? 0 : 1;
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    return a.birthDay - b.birthDay;
  });
};



// ─── Component ───────────────────────────────────────────────
export default function Dashboard() {
  const [data, setData] = useState<DashboardData>({
    todayAppointments: [], todayRevenue: 0, todaySales: 0,
    activeClients: 0, revenueChart: [], lowStock: [], birthdays: [], loading: true,
    yearlyComparison: [], currentYearNetTotal: 0, prevYearNetTotal: 0,
    acquisitionChannels: []
  });
  const [config, setConfig] = useState<SalonConfig | null>(null);

  const load = useCallback(async () => {
    try {
      setData(prev => ({ ...prev, loading: true }));

      const now = new Date();
      const currentYear = now.getFullYear();
      const prevYear = currentYear - 1;

      const startOfPrevYear = startOfYear(subYears(now, 1)).toISOString();
      const endOfCurrentYear = endOfYear(now).toISOString();

      const results = await Promise.allSettled([
        appointmentsSvc.getToday(),
        transactionsSvc.getLast30Days(),
        customersSvc.count(),
        salesSvc.getToday(),
        productsSvc.getLowStockRaw(),
        customersSvc.getAll(),
        transactionsSvc.getByRange(startOfPrevYear, endOfCurrentYear),
        configSvc.get(),
        transactionsSvc.getToday()
      ]);

      // Helper to safely get data from settled promises
      const getRes = <T extends unknown>(idx: number): { data: T | null; error?: any; count?: number | null } => {
        const r = results[idx];
        if (r.status === 'fulfilled') return r.value as any;
        console.error(`Service at index ${idx} failed:`, (r as PromiseRejectedResult).reason);
        return { data: null, error: (r as PromiseRejectedResult).reason };
      };

      const appts = getRes<Appointment[]>(0);
      const txs = getRes<any[]>(1);
      const clientsCount = getRes<any>(2);
      const sales = getRes<any[]>(3);
      const lowStockRes = results[4].status === 'fulfilled' ? results[4].value : [];
      const customersRes = getRes<any[]>(5);
      const yearlyTxsRes = getRes<any[]>(6);
      const configRes = getRes<SalonConfig>(7);
      const todayTxsRes = getRes<any[]>(8);

      // HIGH-01 & HIGH-04: Use backend-filtered todayTxsRes and exclude 'venta' (POS tracked separately)
      const todayRevenue = (todayTxsRes.data || [])
        .filter(t => t && t.status === 'completed' && ['income', 'saldo_cita', 'adelanto'].includes(t.type))
        .reduce((s, t) => s + Number(t.amount || 0), 0);

      const todaySales = (sales.data || []).reduce((s, r) => s + Number(r.total || 0), 0);

      const birthdays = getUpcomingBirthdays(customersRes.data || []);

      // Build yearly comparison
      const monthlyComparison = Array.from({ length: 12 }, (_, i) => ({
        monthName: MONTH_NAMES[i],
        currentYearResult: 0,
        prevYearResult: 0,
      }));

      (yearlyTxsRes.data || []).forEach(t => {
        if (!t || t.status !== 'completed' || !t.created_at) return;
        const txDate = parseISO(t.created_at);
        if (isNaN(txDate.getTime())) return;
        
        const txYear = txDate.getFullYear();
        const txMonth = txDate.getMonth(); // 0-11
        
        const isIncome = ['income', 'saldo_cita', 'adelanto', 'venta'].includes(t.type);
        const isExpense = ['expense', 'gasto', 'devolucion_adelanto', 'devolucion_venta'].includes(t.type);
        
        const amount = Number(t.amount || 0);
        const val = isIncome ? amount : (isExpense ? -amount : 0);
        
        if (txYear === currentYear) {
          monthlyComparison[txMonth].currentYearResult += val;
        } else if (txYear === prevYear) {
          monthlyComparison[txMonth].prevYearResult += val;
        }
      });

      const currentYearNetTotal = monthlyComparison.reduce((sum, m) => sum + m.currentYearResult, 0);
      const prevYearNetTotal = monthlyComparison.reduce((sum, m) => sum + m.prevYearResult, 0);

      // Build Acquisition Channels metrics
      const channelsMap: Record<string, number> = {};
      const customersList = customersRes.data || [];
      customersList.forEach(c => {
        if (!c) return;
        const channel = c.acquisition_channel || 'No especificado';
        channelsMap[channel] = (channelsMap[channel] || 0) + 1;
      });

      const acquisitionChannels = Object.entries(channelsMap)
        .map(([name, count]) => ({
          name,
          count,
          percentage: customersList.length > 0 ? (count / customersList.length) * 100 : 0
        }))
        .sort((a, b) => b.count - a.count);

      if (configRes.data) {
        setConfig(configRes.data);
      }
      
      const dailyChart = buildRevenueChart(txs.data || []);

      setData({
        todayAppointments: appts.data || [],
        todayRevenue,
        todaySales,
        activeClients: clientsCount.count || 0,
        revenueChart: dailyChart,
        lowStock: (lowStockRes as any) || [],
        birthdays,
        yearlyComparison: monthlyComparison,
        currentYearNetTotal,
        prevYearNetTotal,
        acquisitionChannels,
        loading: false,
      });
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      setData(prev => ({ ...prev, loading: false }));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const today = format(new Date(), "EEEE d 'de' MMMM yyyy", { locale: es });

  if (data.loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  const pendingAppts = (data.todayAppointments || []).filter(a =>
    a && ['scheduled', 'confirmed', 'atendido'].includes(a.status)
  );


  return (
    <div className="p-8 space-y-8 animate-fade-in overflow-y-auto flex-1 bg-background select-none">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-4xl font-headline-md text-on-surface tracking-tight font-normal">Dashboard</h1>
          <p className="text-sm text-on-surface-variant/60 font-medium capitalize mt-1.5">{today}</p>
        </div>
        <p className="text-base font-semibold text-primary bg-primary-fixed py-2 px-5 rounded-full shadow-sm">
          {greetingByHour()} 👋
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Ingresos hoy"
          value={formatCurrency(data.todayRevenue)}
          subtitle="Servicios + ventas"
          icon={<span className="material-symbols-outlined text-[22px] leading-none select-none">monetization_on</span>}
        />
        <StatCard
          title="Citas hoy"
          value={data.todayAppointments.length}
          subtitle={`${pendingAppts.length} pendientes`}
          icon={<span className="material-symbols-outlined text-[22px] leading-none select-none">calendar_month</span>}
        />
        <StatCard
          title="Clientes activos"
          value={data.activeClients}
          subtitle="Últimos 90 días"
          icon={<span className="material-symbols-outlined text-[22px] leading-none select-none">group</span>}
        />
        <StatCard
          title="Ventas POS"
          value={formatCurrency(data.todaySales)}
          subtitle="Productos del día"
          icon={<span className="material-symbols-outlined text-[22px] leading-none select-none">point_of_sale</span>}
        />
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* Revenue chart */}
        <div className="lg:col-span-2 space-y-8">
          {/* Today's appointments */}
          <Card className="bg-white border border-outline-variant/30">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-[10px] font-bold text-on-surface-variant/80 uppercase tracking-[0.2em] flex items-center gap-2 font-sans">
                <span className="material-symbols-outlined text-[18px] text-primary select-none">calendar_today</span>
                <span>Citas de Hoy</span>
              </h2>
              <Badge variant="default" className="px-3 py-1 text-xs font-bold font-sans">{data.todayAppointments.length}</Badge>
            </div>
            {data.todayAppointments.length === 0 ? (
              <EmptyState
                icon={<span className="material-symbols-outlined text-[36px] text-outline/40">calendar_month</span>}
                title="Sin citas para hoy"
                description="Ve a la Agenda para agendar nuevas citas."
              />
            ) : (
              <div className="divide-y divide-outline-variant/20 font-sans">
                {data.todayAppointments.map(appt => (
                  <div key={appt.id} className="flex items-center gap-4 py-4 first:pt-0 last:pb-0 hover:bg-surface-container-low/20 transition-colors rounded-2xl px-2">
                    <div className="w-1.5 h-11 rounded-full bg-primary flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-on-surface">{appt.customer_name}</p>
                        <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${STATUS_COLORS[appt.status]}`}>
                          {STATUS_LABELS[appt.status]}
                        </span>
                      </div>
                      <p className="text-xs text-on-surface-variant/70 font-semibold mt-1">
                        {appt.service_name} • <span className="text-primary font-bold">{(appt.professional_name || 'Especialista').split(' ')[0]}</span>
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-on-surface tracking-tight">{formatTime(appt.start_time)}</p>
                      <p className="text-xs text-primary font-semibold mt-1 tracking-wide">{formatCurrency(appt.total_amount)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Revenue chart */}
          <Card className="bg-white border border-outline-variant/30">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-[10px] font-bold text-on-surface-variant/80 uppercase tracking-[0.2em] flex items-center gap-2 font-sans">
                <span className="material-symbols-outlined text-[18px] text-primary select-none">trending_up</span>
                <span>Ingresos — Últimos 30 días</span>
              </h2>
              <Badge variant="peach" className="px-3 py-1 text-xs font-bold font-sans">
                {formatCurrency(data.revenueChart.reduce((s, r) => s + r.total, 0))}
              </Badge>
            </div>
            {data.revenueChart.every(r => r.total === 0) ? (
              <EmptyState
                icon={<span className="material-symbols-outlined text-[36px] text-outline/40">trending_up</span>}
                title="Sin movimientos aún"
                description="Los ingresos registrados aparecerán aquí."
              />
            ) : (
              <div className="pt-2 font-sans">
                <ResponsiveContainer width="100%" height={230}>
                  <AreaChart data={data.revenueChart} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8d4b00" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#8d4b00" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f4" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#8a8580', fontWeight: 'bold' }} tickLine={false} axisLine={false}
                      interval={4} />
                    <YAxis tick={{ fontSize: 10, fill: '#8a8580', fontWeight: 'bold' }} tickLine={false} axisLine={false}
                      tickFormatter={v => `S/${v}`} width={48} />
                    <Tooltip
                      formatter={(v: any) => [formatCurrency(v), 'Ingresos']}
                      contentStyle={{ fontSize: 12, borderRadius: 20, border: '1px solid #e4dfd9', backgroundColor: 'rgba(255, 255, 255, 0.95)', backdropFilter: 'blur(8px)', boxShadow: '0 8px 32px rgba(35,26,19,0.03)' }}
                    />
                    <Area type="monotone" dataKey="total" stroke="#8d4b00" strokeWidth={3}
                      fill="url(#grad)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          {/* Yearly profit comparison chart */}
          <Card className="bg-white border border-outline-variant/30">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <h2 className="text-[10px] font-bold text-on-surface-variant/80 uppercase tracking-[0.2em] flex items-center gap-2 font-sans mb-1">
                  <span className="material-symbols-outlined text-[18px] text-primary select-none font-normal">query_stats</span>
                  <span>Rendimiento Neto Anual Comparativo</span>
                </h2>
                <p className="text-xs text-on-surface-variant font-medium font-sans">
                  Comparativa mensual del resultado final (Ingresos - Egresos) de este año contra el anterior.
                </p>
              </div>

              {/* Compare Indicator Badge */}
              <div className="flex items-center gap-3 self-start sm:self-center font-sans">
                <div className="text-right">
                  <p className="text-[10px] text-on-surface-variant/70 font-semibold uppercase">Resultado {new Date().getFullYear()}</p>
                  <p className="text-base font-bold text-secondary">{formatCurrency(data.currentYearNetTotal)}</p>
                </div>
                {data.prevYearNetTotal !== 0 && (
                  <Badge 
                    variant={data.currentYearNetTotal >= data.prevYearNetTotal ? 'success' : 'danger'} 
                    className="px-2.5 py-1 text-xs font-bold animate-fade-in"
                  >
                    {data.currentYearNetTotal >= data.prevYearNetTotal ? '↑' : '↓'} {Math.abs(((data.currentYearNetTotal - data.prevYearNetTotal) / Math.abs(data.prevYearNetTotal)) * 100).toFixed(1)}%
                  </Badge>
                )}
              </div>
            </div>

            {data.yearlyComparison.length === 0 || data.yearlyComparison.every(m => m.currentYearResult === 0 && m.prevYearResult === 0) ? (
              <EmptyState
                icon={<span className="material-symbols-outlined text-[36px] text-outline/40">query_stats</span>}
                title="Sin datos históricos suficientes"
                description="Se requiere el registro de transacciones en este año o el anterior para construir la comparativa."
              />
            ) : (
              <div className="pt-2 font-sans">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={data.yearlyComparison} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f4" />
                    <XAxis 
                      dataKey="monthName" 
                      tick={{ fontSize: 10, fill: '#8a8580', fontWeight: 'bold' }} 
                      tickLine={false} 
                      axisLine={false} 
                    />
                    <YAxis 
                      tick={{ fontSize: 10, fill: '#8a8580', fontWeight: 'bold' }} 
                      tickLine={false} 
                      axisLine={false} 
                      tickFormatter={v => `S/${v}`} 
                      width={52} 
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const prevYearVal = payload[0].value as number;
                          const currentYearVal = payload[1].value as number;
                          const difference = currentYearVal - prevYearVal;
                          const isGrowth = difference >= 0;

                          return (
                            <div className="p-4 bg-white/95 backdrop-blur-md rounded-2xl border border-outline-variant/30 shadow-lg font-sans text-xs space-y-2">
                              <p className="font-bold text-on-surface text-sm border-b border-outline-variant/10 pb-1">
                                {payload[0].payload.monthName}
                              </p>
                              <div className="flex justify-between gap-6">
                                <span className="text-on-surface-variant flex items-center gap-1.5 font-medium">
                                  <span className="w-2.5 h-2.5 rounded-full bg-outline/50 flex-shrink-0" />
                                  Año Anterior ({new Date().getFullYear() - 1}):
                                </span>
                                <span className="font-bold text-on-surface">{formatCurrency(prevYearVal)}</span>
                              </div>
                              <div className="flex justify-between gap-6">
                                <span className="text-primary flex items-center gap-1.5 font-medium">
                                  <span className="w-2.5 h-2.5 rounded-full bg-primary flex-shrink-0" />
                                  Año Actual ({new Date().getFullYear()}):
                                </span>
                                <span className="font-bold text-on-surface">{formatCurrency(currentYearVal)}</span>
                              </div>
                              <div className="flex justify-between gap-6 border-t border-outline-variant/10 pt-1.5 font-semibold">
                                <span className="text-on-surface-variant">Variación:</span>
                                <span className={isGrowth ? 'text-secondary' : 'text-error'}>
                                  {isGrowth ? '+' : ''}{formatCurrency(difference)}
                                </span>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Legend 
                      verticalAlign="top" 
                      height={36} 
                      iconType="circle"
                      iconSize={8}
                      wrapperStyle={{ fontSize: 11, fontWeight: 'bold', fontFamily: 'sans-serif', fill: '#8a8580' }}
                    />
                    <Bar 
                      name={`Año Anterior (${new Date().getFullYear() - 1})`} 
                      dataKey="prevYearResult" 
                      fill="#e4dfd9" 
                      radius={[6, 6, 0, 0]} 
                    />
                    <Bar 
                      name={`Año Actual (${new Date().getFullYear()})`} 
                      dataKey="currentYearResult" 
                      fill="#8d4b00" 
                      radius={[6, 6, 0, 0]} 
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-8">

          {/* Summary today */}
          <Card variant="cream" className="border border-outline-variant/30 select-none bg-surface-container-low">
            <h2 className="text-[10px] font-bold text-on-surface-variant/80 uppercase tracking-[0.2em] mb-4 font-sans">
              Resumen del día
            </h2>
            <div className="space-y-3 font-sans">
              {[
                { label: 'Completadas', count: data.todayAppointments.filter(a => a.status === 'completed').length },
                { label: 'Confirmadas', count: data.todayAppointments.filter(a => a.status === 'confirmed').length },
                { label: 'Agendadas',   count: data.todayAppointments.filter(a => a.status === 'scheduled').length },
                { label: 'No asistió',  count: data.todayAppointments.filter(a => a.status === 'no-show').length },
                { label: 'Canceladas',  count: data.todayAppointments.filter(a => a.status === 'cancelled').length },
              ].map(row => (
                <div key={row.label} className="flex justify-between text-xs py-1 border-b border-outline-variant/10 last:border-b-0">
                  <span className="text-on-surface-variant font-medium">{row.label}</span>
                  <span className="font-bold text-on-surface">{row.count}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Acquisition Channels Breakdown */}
          <Card className="bg-white border border-outline-variant/30 select-none">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[10px] font-bold text-on-surface-variant/80 uppercase tracking-[0.2em] flex items-center gap-1.5 font-sans">
                <span className="material-symbols-outlined text-[18px] text-primary select-none font-normal">campaign</span>
                <span>Canales de Captación</span>
              </h2>
              <Badge variant="peach" className="px-2 py-0.5 text-[10px] font-bold font-sans">
                {data.acquisitionChannels.length} Canales
              </Badge>
            </div>
            {data.acquisitionChannels.length === 0 ? (
              <p className="text-xs text-on-surface-variant/60 font-bold uppercase tracking-wider text-center py-6 bg-surface-container-low/50 rounded-2xl border border-dashed border-outline-variant/40">
                📢 Sin datos de canales aún
              </p>
            ) : (
              <div className="space-y-4 font-sans">
                {data.acquisitionChannels.map((ch, idx) => {
                  const rankColors = [
                    'bg-[#8d4b00]', // rank 1
                    'bg-amber-600',  // rank 2
                    'bg-amber-400',  // rank 3
                    'bg-stone-400',  // rank 4
                    'bg-stone-300',  // rank 5
                  ];
                  const barColor = rankColors[idx] || 'bg-stone-200';

                  return (
                    <div key={ch.name} className="space-y-1.5 hover:bg-surface-container-low/25 p-1.5 rounded-xl transition-all duration-300">
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <span className="text-on-surface font-bold capitalize">{ch.name}</span>
                        <span className="text-on-surface-variant text-[11px] font-medium">
                          {ch.count} {ch.count === 1 ? 'cliente' : 'clientes'} ({ch.percentage.toFixed(1)}%)
                        </span>
                      </div>
                      <div className="w-full h-2.5 bg-stone-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${barColor} transition-all duration-500`}
                          style={{ width: `${ch.percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Upcoming Birthdays Alert */}
          <Card className="bg-white border border-outline-variant/30 select-none">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[10px] font-bold text-on-surface-variant/80 uppercase tracking-[0.2em] flex items-center gap-1.5 font-sans">
                <span className="material-symbols-outlined text-[18px] text-primary select-none animate-pulse">cake</span>
                <span>Cumpleaños (Mes / Siguiente)</span>
              </h2>
              {data.birthdays.length > 0 && (
                <Badge variant="peach" className="px-2 py-0.5 text-[10px] font-bold font-sans">
                  {data.birthdays.length}
                </Badge>
              )}
            </div>
            {data.birthdays.length === 0 ? (
              <p className="text-xs text-on-surface-variant/60 font-bold uppercase tracking-wider text-center py-6 bg-surface-container-low/50 rounded-2xl border border-dashed border-outline-variant/40">
                🎂 Sin cumpleaños este mes
              </p>
            ) : (
              <div className="space-y-4 font-sans max-h-72 overflow-y-auto pr-1">
                {data.birthdays.map(c => {
                  const isToday = new Date().getMonth() + 1 === c.birthMonth && new Date().getDate() === c.birthDay;
                  
                  // Use specific birthday (today) or promoBirthday (upcoming) templates from the config
                  const templateText = isToday
                    ? (config?.loyalty_messages?.birthday || "¡Hola {cliente}! 🥳 Feliz cumpleaños de parte de todo nuestro equipo. ✨")
                    : (config?.loyalty_messages?.promoBirthday || "¡Hola {cliente}! 🥳 Se acerca tu cumpleaños y tenemos una súper promoción para consentirte. ✨");
                  
                  const messageText = templateText
                    .replace(/{cliente}/g, c.first_name || c.name || 'Cliente')
                    .replace(/{telefono}/g, c.phone || '');
                  
                  const greetingLink = getWhatsAppLink(c.phone || '', messageText);
                  const firstChar = (c.first_name || c.name || 'C')[0];
                  return (
                    <div key={c.id} className="flex items-center justify-between py-2 border-b border-outline-variant/10 last:border-b-0 hover:bg-surface-container-low/20 px-2 rounded-xl transition-all duration-300">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${isToday ? 'bg-primary text-white animate-bounce' : 'bg-surface-container-highest text-on-surface-variant'}`}>
                          {isToday ? '🎉' : firstChar}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-on-surface truncate flex items-center gap-1.5">
                            <span className="truncate">{c.name}</span>
                            {isToday && (
                              <span className="text-[9px] font-extrabold uppercase tracking-wider bg-error text-white px-1.5 py-0.5 rounded-full animate-pulse">¡Hoy!</span>
                            )}
                          </p>
                          <p className="text-[10px] text-on-surface-variant/70 font-semibold mt-0.5">
                            {c.birthDay} de {MONTH_NAMES[c.birthMonth - 1]}
                            {c.isNextMonth && <span className="text-primary font-bold ml-1.5">• Próx. mes</span>}
                          </p>
                        </div>
                      </div>
                      
                      <a
                        href={greetingLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center w-8 h-8 rounded-full bg-surface-container-low border border-outline-variant/20 hover:bg-primary/10 hover:border-primary/40 text-primary transition-all duration-300 cursor-pointer group"
                        title="Enviar felicitación por WhatsApp"
                      >
                        <span className="material-symbols-outlined text-[16px] leading-none group-hover:scale-110 transition-transform">sms</span>
                      </a>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Low stock alert */}
          <Card className="bg-white border border-outline-variant/30 select-none">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[10px] font-bold text-on-surface-variant/80 uppercase tracking-[0.2em] flex items-center gap-1.5 font-sans">
                <span className="material-symbols-outlined text-[18px] text-error select-none">warning</span>
                <span>Stock Bajo</span>
              </h2>
              {data.lowStock.length > 0 && (
                <Badge variant="warning" className="px-2 py-0.5 text-[10px] font-bold font-sans">{data.lowStock.length}</Badge>
              )}
            </div>
            {data.lowStock.length === 0 ? (
              <p className="text-xs text-on-surface-variant/60 font-bold uppercase tracking-wider text-center py-4 bg-surface-container-low/50 rounded-2xl border border-dashed border-outline-variant/40">✅ Inventario en orden</p>
            ) : (
              <div className="space-y-3 font-sans">
                {data.lowStock.slice(0, 5).map(p => (
                  <div key={p.id} className="flex items-center justify-between py-1 border-b border-outline-variant/10 last:border-b-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="material-symbols-outlined text-[16px] text-primary flex-shrink-0 select-none">package</span>
                      <span className="text-xs font-bold text-on-surface truncate max-w-[130px]">{p.name}</span>
                    </div>
                    <span className="text-xs font-bold text-error">
                      {p.stock} / {p.min_stock} {p.unit}
                    </span>
                  </div>
                ))}
                {data.lowStock.length > 5 && (
                  <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/40 text-center pt-1">+{data.lowStock.length - 5} más</p>
                )}
              </div>
            )}
          </Card>

          {/* Quick links */}
          <Card variant="cream" className="border border-outline-variant/30 select-none bg-surface-container-low">
            <h2 className="text-[10px] font-bold text-on-surface-variant/80 uppercase tracking-[0.2em] mb-4 font-sans">
              Accesos rápidos
            </h2>
            <div className="grid grid-cols-2 gap-3.5 font-sans">
              {[
                { label: 'Nueva cita', href: '/agenda', icon: 'calendar_month' },
                { label: 'Nuevo cliente', href: '/clients', icon: 'person_add' },
                { label: 'Cobrar POS', href: '/pos', icon: 'payments' },
                { label: 'Inventario', href: '/inventory', icon: 'inventory_2' },
              ].map(item => (
                <a
                  key={item.label}
                  href={item.href}
                  className="flex flex-col items-center gap-2 p-4 bg-white rounded-[1.5rem] border border-outline-variant/20 hover:border-primary hover:shadow-md active:scale-95 transition-all duration-300 text-center cursor-pointer group"
                >
                  <span className="material-symbols-outlined text-[20px] text-primary group-hover:scale-110 transition-transform select-none">{item.icon}</span>
                  <span className="text-[10px] font-bold text-on-surface-variant/80 group-hover:text-primary tracking-wide uppercase">{item.label}</span>
                </a>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
