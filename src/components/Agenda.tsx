import { useState, useEffect, useCallback } from 'react';
import { format, addWeeks, subWeeks, isSameDay, isToday, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isSameMonth, addDays, subMonths, addMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import Papa from 'papaparse';
import { Button, Badge, Spinner, EmptyState } from './ui';
import { getWeekDays, formatCurrency, STATUS_LABELS, parseLocalISO } from '../lib/utils';
import { appointmentsSvc, professionalsSvc, transactionsSvc } from '../services/salon';
import { useAuth } from '../contexts/AuthContext';
import AppointmentModal from './agenda/AppointmentModal';
import AppointmentDetailModal from './agenda/AppointmentDetailModal';
import type { Appointment, Professional } from '../types';

const BAR_COLORS: Record<string, string> = {
  scheduled: 'bg-primary',      // Gold/Amber
  confirmed: 'bg-primary/80',   // Gold/Amber (Confirmada)
  atendido:  'bg-secondary',    // Emerald/Green
  completed: 'bg-secondary/85', // Emerald/Green (Completada)
  cancelled: 'bg-outline',      // Stone grey
  'no-show': 'bg-error',        // Soft red
};

const BADGE_VARIANTS: Record<string, 'default' | 'peach' | 'success' | 'warning' | 'danger' | 'info'> = {
  scheduled: 'warning',         // Soft warning yellow/amber
  confirmed: 'peach',           // Soft peach/amber
  atendido:  'success',         // Soft success green
  completed: 'success',         // Soft success green
  cancelled: 'default',
  'no-show': 'danger',
};

// ─── Calendar constants ───────────────────────────────────────
const START_HOUR = 7;
const END_HOUR   = 21;
const SLOT_H     = 56; // px per 30-min slot
const SLOTS      = (END_HOUR - START_HOUR) * 2;

const timeLabels = Array.from({ length: SLOTS }, (_, i) => {
  const h = START_HOUR + Math.floor(i / 2);
  const m = i % 2 === 0 ? '00' : '30';
  return `${String(h).padStart(2, '0')}:${m}`;
});

const apptStyle = (appt: Appointment) => {
  const start = parseLocalISO(appt.start_time);
  const end   = parseLocalISO(appt.end_time);
  const topSlots = (start.getHours() - START_HOUR) * 2 + start.getMinutes() / 30;
  const heightSlots = Math.max((end.getTime() - start.getTime()) / 1800000, 1);
  return {
    top:    `${topSlots * SLOT_H}px`,
    height: `${heightSlots * SLOT_H - 2}px`,
  };
};

// ─── Sub-component: Appointment Card in Calendar ─────────────
function ApptCard({ appt, onClick, onQuickComplete }: { appt: Appointment; onClick: () => void; onQuickComplete?: (a: Appointment) => void }) {
  const barColor = BAR_COLORS[appt.status] || 'bg-outline';
  
  return (
    <div
      className="absolute left-1 right-1 rounded-2xl border border-outline-variant/15 cursor-pointer hover:z-10 hover:shadow-lg transition-all duration-300 overflow-hidden flex bg-white/90 backdrop-blur-md shadow-sm active:scale-[0.98] select-none group"
      style={apptStyle(appt)}
      onClick={e => { e.stopPropagation(); onClick(); }}
    >
      <div className={`w-1.5 flex-shrink-0 ${barColor}`} />
      <div className="flex-1 px-3.5 py-2.5 min-w-0 flex flex-col justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold text-on-surface leading-tight truncate group-hover:text-primary transition-colors">
            {appt.customer_name}
          </p>
          <p className="text-[10px] text-on-surface-variant/70 font-medium leading-tight truncate mt-1">
            {appt.service_name}
          </p>
        </div>
        <div className="flex items-center justify-between mt-1">
          <p className="text-[10px] text-primary font-bold leading-none">
            {format(parseLocalISO(appt.start_time), 'HH:mm')}
          </p>
          <div className="flex gap-1 items-center">
            {onQuickComplete && (appt.status === 'confirmed' || appt.status === 'atendido') && (
              <button 
                onClick={(e) => { e.stopPropagation(); onQuickComplete(appt); }} 
                className="text-[9px] bg-primary text-white font-bold px-2 py-0.5 rounded-full hover:bg-primary/90 transition-colors shadow-sm"
                title="Cobrar y Completar"
              >
                Cobrar
              </button>
            )}
            <span className="text-[9px] font-bold text-on-surface-variant/40 px-1.5 py-0.5 rounded-md bg-surface-container-low uppercase tracking-wider">
              {appt.professional_name.split(' ')[0]}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────
export default function Agenda() {
  const { user } = useAuth();
  const [weekBase, setWeekBase] = useState(new Date());
  const [monthBase, setMonthBase] = useState(new Date());
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [filterProfId, setFilterProfId] = useState('');
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'month' | 'week' | 'list'>('month');
  const [showCreate, setShowCreate] = useState(false);
  const [detailAppt, setDetailAppt] = useState<Appointment | null>(null);
  const [clickedSlot, setClickedSlot] = useState<{ date: string; time: string } | null>(null);

  const weekDays = getWeekDays(weekBase);

  const loadAppointments = useCallback(async () => {
    try {
      setLoading(true);
      let from, to;
      if (view === 'month') {
        const start = startOfWeek(startOfMonth(monthBase));
        const end = endOfWeek(endOfMonth(monthBase));
        from = start.toISOString();
        to = new Date(end.getTime() + 86400000).toISOString();
      } else {
        from = weekDays[0].toISOString();
        to = new Date(weekDays[6].getTime() + 86400000).toISOString();
      }
      const { data } = await appointmentsSvc.getByRange(from, to);
      setAppointments(data || []);
    } catch (error) {
      console.error('Error loading appointments:', error);
    } finally {
      setLoading(false);
    }
  }, [weekBase, monthBase, view]);

  useEffect(() => { loadAppointments(); }, [loadAppointments]);
  useEffect(() => {
    professionalsSvc.getAll().then(({ data }) => setProfessionals(data || []));
  }, []);

  const filtered = filterProfId
    ? appointments.filter(a => a.professional_id === filterProfId)
    : appointments;

  const apptsByDay = (day: Date) =>
    filtered.filter(a => isSameDay(parseLocalISO(a.start_time), day));

  const handleSlotClick = (day: Date, timeLabel: string) => {
    setClickedSlot({ date: format(day, 'yyyy-MM-dd'), time: timeLabel });
    setShowCreate(true);
  };

  const handleQuickComplete = async (appt: Appointment) => {
    if (!user) return;
    try {
      const transactionTime = appt.end_time || appt.start_time;
      const updates = {
        status: 'completed' as const,
        completed_at: transactionTime,
        payment_status: 'paid' as const
      };
      
      if (appt.payment_status !== 'paid') {
        const remaining = appt.total_amount - appt.deposit_amount;
        if (remaining > 0) {
          await transactionsSvc.create({
            type: 'saldo_cita', status: 'completed',
            category: 'Servicios en Salón', amount: remaining,
            method: appt.payment_method || 'efectivo',
            description: `Saldo cita: ${appt.service_name} — ${appt.customer_name}`,
            appointment_id: appt.id, user_id: user.uid,
            created_at: transactionTime
          });
        }
      }
      
      await appointmentsSvc.update(appt.id, updates);
      loadAppointments();
    } catch (err) {
      console.error(err);
      alert('Error al completar cita');
    }
  };

  const handleExport = () => {
    const rows = filtered.map(a => ({
      fecha: format(parseLocalISO(a.start_time), 'yyyy-MM-dd'),
      hora_inicio: format(parseLocalISO(a.start_time), 'HH:mm'),
      hora_fin: format(parseLocalISO(a.end_time), 'HH:mm'),
      cliente: a.customer_name,
      servicio: a.service_name,
      profesional: a.professional_name,
      total: a.total_amount,
      estado: a.status,
      metodo_pago: a.payment_method || ''
    }));
    if (rows.length === 0) return alert('No hay citas para exportar en este filtro.');
    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `agenda_${format(weekDays[0], 'yyyy-MM-dd')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // ─── Header labels ────────────────────────────────────
  const weekLabel = `${format(weekDays[0], 'd MMM', { locale: es })} — ${format(weekDays[6], 'd MMM yyyy', { locale: es })}`;
  const monthLabel = format(monthBase, 'MMMM yyyy', { locale: es });

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-background select-none">
      {/* ── Toolbar ─────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-4 px-8 py-6 border-b border-outline-variant/20 bg-surface-container-low/40 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <h1 className="text-4xl font-headline-md text-on-surface tracking-tight font-normal">Agenda</h1>
          <Badge variant="peach" className="capitalize text-xs font-semibold px-4 py-1.5">
            {view === 'month' ? monthLabel : weekLabel}
          </Badge>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Professional filter */}
          <div className="relative">
            <select
              value={filterProfId}
              onChange={e => setFilterProfId(e.target.value)}
              className="text-xs font-bold border border-outline-variant/30 rounded-full pl-6 pr-10 py-3 bg-white text-on-surface focus:outline-none focus:border-primary cursor-pointer transition-all duration-300 appearance-none font-sans"
            >
              <option value="">Todos los profesionales</option>
              {professionals.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-on-surface-variant">
              <span className="material-symbols-outlined text-[16px] leading-none select-none">unfold_more</span>
            </div>
          </div>

          {/* Navigation */}
          <div className="flex items-center gap-1 bg-surface-container-low/60 p-1.5 rounded-full border border-outline-variant/20 shadow-sm">
            <button 
              onClick={() => {
                if (view === 'month') setMonthBase(subMonths(monthBase, 1));
                else setWeekBase(subWeeks(weekBase, 1));
              }}
              className="p-2 hover:bg-white rounded-full transition-all duration-300 cursor-pointer text-on-surface-variant hover:text-primary active:scale-90" aria-label="Anterior">
              <span className="material-symbols-outlined text-[18px] leading-none select-none">chevron_left</span>
            </button>
            <button 
              onClick={() => {
                if (view === 'month') setMonthBase(new Date());
                else setWeekBase(new Date());
              }}
              className="text-xs px-4 py-2 bg-white rounded-full hover:shadow-sm transition-all duration-300 font-bold text-on-surface-variant hover:text-primary cursor-pointer">
              Hoy
            </button>
            <button 
              onClick={() => {
                if (view === 'month') setMonthBase(addMonths(monthBase, 1));
                else setWeekBase(addWeeks(weekBase, 1));
              }}
              className="p-2 hover:bg-white rounded-full transition-all duration-300 cursor-pointer text-on-surface-variant hover:text-primary active:scale-90" aria-label="Siguiente">
              <span className="material-symbols-outlined text-[18px] leading-none select-none">chevron_right</span>
            </button>
          </div>

          {/* View toggle */}
          <div className="flex bg-surface-container-low/60 p-1.5 rounded-full border border-outline-variant/20 shadow-sm">
            <button onClick={() => setView('month')}
              className={`p-2 rounded-full transition-all duration-300 cursor-pointer active:scale-90 ${view === 'month' ? 'bg-white text-primary shadow-sm' : 'text-outline hover:text-on-surface'}`}
              aria-label="Vista mensual">
              <span className="material-symbols-outlined text-[18px] leading-none select-none" style={view === 'month' ? { fontVariationSettings: "'FILL' 1" } : {}}>calendar_view_month</span>
            </button>
            <button onClick={() => setView('week')}
              className={`p-2 rounded-full transition-all duration-300 cursor-pointer active:scale-90 ${view === 'week' ? 'bg-white text-primary shadow-sm' : 'text-outline hover:text-on-surface'}`}
              aria-label="Vista semanal">
              <span className="material-symbols-outlined text-[18px] leading-none select-none" style={view === 'week' ? { fontVariationSettings: "'FILL' 1" } : {}}>calendar_month</span>
            </button>
            <button onClick={() => setView('list')}
              className={`p-2 rounded-full transition-all duration-300 cursor-pointer active:scale-90 ${view === 'list' ? 'bg-white text-primary shadow-sm' : 'text-outline hover:text-on-surface'}`}
              aria-label="Vista lista">
              <span className="material-symbols-outlined text-[18px] leading-none select-none" style={view === 'list' ? { fontVariationSettings: "'FILL' 1" } : {}}>format_list_bulleted</span>
            </button>
          </div>

          <Button variant="ghost" size="sm" onClick={handleExport} title="Exportar a CSV" className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider px-4">
            <span className="material-symbols-outlined text-[16px]">download</span>
            <span className="hidden md:inline">Exportar</span>
          </Button>

          <Button size="sm" onClick={() => { setClickedSlot(null); setShowCreate(true); }} id="new-appt-btn" className="flex items-center gap-2 font-bold px-6 py-3 text-xs uppercase tracking-wider">
            <span className="material-symbols-outlined text-[16px] leading-none">add</span>
            <span>Nueva cita</span>
          </Button>
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center flex-1">
          <Spinner size="lg" />
        </div>
      ) : view === 'list' ? (
        <ListView appointments={filtered} weekDays={weekDays} onSelect={setDetailAppt} onQuickComplete={handleQuickComplete} />
      ) : view === 'week' ? (
        <WeekView
          weekDays={weekDays}
          apptsByDay={apptsByDay}
          timeLabels={timeLabels}
          slotH={SLOT_H}
          slots={SLOTS}
          onSlotClick={handleSlotClick}
          onApptClick={setDetailAppt}
          onQuickComplete={handleQuickComplete}
        />
      ) : (
        <MonthView 
          monthBase={monthBase}
          appointments={filtered}
          onDayClick={(day) => { setWeekBase(day); setView('week'); }}
          onApptClick={setDetailAppt}
        />
      )}

      {/* ── Modals ──────────────────────────────────────── */}
      <AppointmentModal
        open={showCreate}
        onClose={() => { setShowCreate(false); setClickedSlot(null); }}
        onSaved={loadAppointments}
        userId={user?.uid || ''}
        defaultDate={clickedSlot?.date}
        defaultTime={clickedSlot?.time}
      />
      <AppointmentDetailModal
        appointment={detailAppt}
        onClose={() => setDetailAppt(null)}
        onUpdated={loadAppointments}
        userId={user?.uid || ''}
      />
    </div>
  );
}

// ─── Week View ────────────────────────────────────────────────
function WeekView({ weekDays, apptsByDay, timeLabels, slotH, slots, onSlotClick, onApptClick, onQuickComplete }: {
  weekDays: Date[];
  apptsByDay: (d: Date) => Appointment[];
  timeLabels: string[];
  slotH: number;
  slots: number;
  onSlotClick: (day: Date, time: string) => void;
  onApptClick: (a: Appointment) => void;
  onQuickComplete: (a: Appointment) => void;
}) {
  const DAY_LABELS = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'];

  return (
    <div className="flex-1 overflow-auto p-6 bg-background">
      <div className="min-w-[900px] bg-white rounded-[3rem] border border-outline-variant/30 shadow-sm overflow-hidden flex flex-col">
        {/* Day headers */}
        <div className="flex sticky top-0 z-10 bg-surface-container-low/95 backdrop-blur-md border-b border-outline-variant/30">
          <div className="w-20 flex-shrink-0" />
          {weekDays.map((day, i) => (
            <div key={i} className={`flex-1 text-center py-5 border-l border-outline-variant/20 ${isToday(day) ? 'bg-primary-fixed/20' : ''}`}>
              <p className="text-[10px] font-bold text-on-surface-variant/60 tracking-[0.15em] uppercase font-sans">{DAY_LABELS[i]}</p>
              <div className="flex justify-center mt-2">
                <p className={`w-9 h-9 flex items-center justify-center text-base font-bold rounded-full ${isToday(day) ? 'bg-primary text-white shadow-md shadow-primary/10' : 'text-on-surface'}`}>
                  {format(day, 'd')}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="flex flex-1 overflow-y-visible">
          {/* Time labels */}
          <div className="w-20 flex-shrink-0 border-r border-outline-variant/20 bg-surface-container-low/20">
            {timeLabels.map((t, i) => (
              <div key={i} style={{ height: slotH }}
                className={`flex items-start justify-end pr-4 pt-1 select-none ${i % 2 === 0 ? 'border-t border-outline-variant/10' : ''}`}>
                {i % 2 === 0 && <span className="text-[10px] font-bold text-on-surface-variant/60 font-sans">{t}</span>}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {weekDays.map((day, di) => {
            const dayAppts = apptsByDay(day);
            return (
              <div key={di} className={`flex-1 relative border-l border-outline-variant/20 ${isToday(day) ? 'bg-primary-fixed/5' : ''}`}
                style={{ height: slots * slotH }}>
                {/* Hour/slot lines */}
                {timeLabels.map((_, i) => (
                  <div key={i}
                    className={`absolute w-full ${i % 2 === 0 ? 'border-t border-outline-variant/10' : 'border-t border-outline-variant/5'} cursor-pointer hover:bg-primary-fixed/10 transition-colors duration-150`}
                    style={{ top: i * slotH, height: slotH }}
                    onClick={() => onSlotClick(day, timeLabels[i])}
                  />
                ))}

                {/* Appointments */}
                {dayAppts.map(appt => (
                  <ApptCard key={appt.id} appt={appt} onClick={() => onApptClick(appt)} onQuickComplete={onQuickComplete} />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── List View ────────────────────────────────────────────────
function ListView({ appointments, weekDays, onSelect, onQuickComplete }: {
  appointments: Appointment[];
  weekDays: Date[];
  onSelect: (a: Appointment) => void;
  onQuickComplete: (a: Appointment) => void;
}) {
  if (appointments.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <EmptyState icon={<span className="material-symbols-outlined text-[48px] text-outline/50">calendar_month</span>} title="Sin citas esta semana"
          description="Haz clic en 'Nueva cita' para agendar." />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-background">
      {weekDays.map(day => {
        const dayAppts = appointments.filter(a => isSameDay(parseLocalISO(a.start_time), day));
        if (dayAppts.length === 0) return null;
        return (
          <div key={day.toISOString()} className="space-y-4 animate-fade-in">
            <div className="flex items-center gap-3.5 px-2">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${isToday(day) ? 'bg-primary text-white shadow-md shadow-primary/10' : 'bg-surface-container border border-outline-variant/30 text-on-surface'}`}>
                {format(day, 'd')}
              </div>
              <span className="text-base font-headline-sm text-on-surface capitalize tracking-wide">
                {format(day, "EEEE d 'de' MMMM", { locale: es })}
              </span>
              <Badge variant="peach" className="px-2.5 py-1 rounded-full text-xs font-bold">{dayAppts.length} {dayAppts.length === 1 ? 'cita' : 'citas'}</Badge>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {dayAppts.map(appt => (
                <div key={appt.id}
                  onClick={() => onSelect(appt)}
                  className="flex items-center gap-4 p-5 bg-white border border-outline-variant/20 rounded-[2rem] cursor-pointer shadow-[0_8px_30px_-6px_rgba(35,26,19,0.02)] hover:shadow-lg hover:border-primary active:scale-[0.99] transition-all duration-300 group select-none">
                  <div className={`w-1.5 h-12 rounded-full flex-shrink-0 ${BAR_COLORS[appt.status] || 'bg-outline'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-on-surface group-hover:text-primary transition-colors">{appt.customer_name}</p>
                      <Badge variant={BADGE_VARIANTS[appt.status]} className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full scale-90">
                        {STATUS_LABELS[appt.status]}
                      </Badge>
                    </div>
                    <p className="text-xs text-on-surface-variant/70 font-medium mt-1 truncate">{appt.service_name} • Por <span className="text-primary font-bold">{appt.professional_name.split(' ')[0]}</span></p>
                  </div>
                  <div className="text-right flex-shrink-0 flex flex-col items-end gap-2">
                    <div>
                      <p className="text-sm font-bold text-on-surface tracking-tight">{format(parseLocalISO(appt.start_time), 'HH:mm')}</p>
                      <p className="text-xs text-primary font-bold mt-1 tracking-wide">{formatCurrency(appt.total_amount)}</p>
                    </div>
                    {(appt.status === 'confirmed' || appt.status === 'atendido') && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); onQuickComplete(appt); }}
                        className="text-[10px] bg-primary text-white font-bold px-3 py-1 rounded-full hover:bg-primary/90 transition-colors shadow-sm"
                      >
                        Cobrar
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Month View ────────────────────────────────────────────────
function MonthView({ monthBase, appointments, onDayClick, onApptClick }: {
  monthBase: Date;
  appointments: Appointment[];
  onDayClick: (d: Date) => void;
  onApptClick: (a: Appointment) => void;
}) {
  const monthStart = startOfMonth(monthBase);
  const monthEnd = endOfMonth(monthStart);
  // Get calendar grid bounds
  let startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
  let endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const dateFormat = "d";
  const rows = [];
  let days = [];
  let day = startDate;
  let formattedDate = "";

  const DAY_LABELS = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'];

  while (day <= endDate) {
      for (let i = 0; i < 7; i++) {
        formattedDate = format(day, dateFormat);
        const cloneDay = day;
        const dayApts = appointments.filter(apt => isSameDay(parseLocalISO(apt.start_time), cloneDay));
        
        days.push(
          <div
            key={day.toString()}
            className={`min-h-[120px] bg-white p-2 border-r border-b border-outline-variant/20 hover:bg-surface-container-low transition-colors cursor-pointer flex flex-col ${!isSameMonth(day, monthStart) ? 'opacity-40 bg-surface-container-lowest' : ''}`}
            onClick={() => onDayClick(cloneDay)}
          >
            <div className="flex justify-between items-center mb-2">
              <span className={`text-sm font-bold w-8 h-8 flex items-center justify-center rounded-full ${isToday(day) ? 'bg-primary text-white shadow-md' : 'text-on-surface'}`}>
                {formattedDate}
              </span>
            </div>
            <div className="space-y-1.5 flex-1 overflow-y-auto pr-1">
              {dayApts.slice(0, 4).map(apt => (
                <div 
                  key={apt.id} 
                  onClick={(e) => { e.stopPropagation(); onApptClick(apt); }}
                  className={`text-[10px] py-1 px-1.5 rounded truncate font-bold border-l-2 transition-transform hover:scale-[1.02] ${BAR_COLORS[apt.status]?.replace('bg-', 'border-') || 'border-outline'} bg-surface-container-lowest hover:shadow-sm`}
                  title={`${format(parseLocalISO(apt.start_time), 'HH:mm')} - ${apt.customer_name} (${apt.service_name})`}
                >
                  {format(parseLocalISO(apt.start_time), 'HH:mm')} | {apt.customer_name} — {apt.service_name}
                </div>
            ))}
            {dayApts.length > 4 && (
              <div className="text-[9px] text-on-surface-variant font-bold text-center pt-1">
                + {dayApts.length - 4} más
              </div>
            )}
          </div>
        </div>
      );
      day = addDays(day, 1);
    }
    rows.push(
      <div className="grid grid-cols-7" key={day.toString()}>
        {days}
      </div>
    );
    days = [];
  }

  return (
    <div className="flex-1 overflow-auto p-6 bg-background">
      <div className="bg-white rounded-[2rem] border border-outline-variant/30 shadow-sm overflow-hidden flex flex-col min-w-[700px]">
        <div className="grid grid-cols-7 bg-surface-container-low border-b border-outline-variant/30">
          {DAY_LABELS.map((day) => (
            <div key={day} className="py-4 text-center border-r border-outline-variant/20 last:border-r-0">
              <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">{day}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-col">
          {rows}
        </div>
      </div>
    </div>
  );
}
