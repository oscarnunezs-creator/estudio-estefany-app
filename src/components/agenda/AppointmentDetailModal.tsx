import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Modal, Button } from '../ui';
import { formatCurrency, formatTime, parseLocalISO, STATUS_LABELS, STATUS_COLORS, PAYMENT_LABELS, getWhatsAppLink } from '../../lib/utils';
import { appointmentsSvc, transactionsSvc } from '../../services/salon';
import type { Appointment, Transaction, SalonConfig } from '../../types';

interface Props {
  appointment: Appointment | null;
  onClose: () => void;
  onUpdated: () => void;
  userId: string;
}

const STATUS_FLOW: Record<string, string> = {
  scheduled: 'confirmed',
  confirmed: 'atendido',
  atendido:  'completed',
};

const STATUS_BTN_LABEL: Record<string, string> = {
  scheduled: '✓ Confirmar',
  confirmed: '▶ Iniciar atención',
  atendido:  '✓ Completar',
};

export default function AppointmentDetailModal({ appointment: appt, onClose, onUpdated, userId }: Props) {
  const [loading, setLoading] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [phone, setPhone] = useState<string | null>(null);
  const [config, setConfig] = useState<SalonConfig | null>(null);

  useEffect(() => {
    if (appt) {
      transactionsSvc.getByAppointmentId(appt.id).then(({ data }) => setTransactions(data || []));
      
      import('../../lib/supabase').then(({ supabase }) => {
        supabase.from('customers').select('phone').eq('id', appt.customer_id).single()
          .then(({ data }) => setPhone(data?.phone || null));
        
        supabase.from('salon_config').select('*').single()
          .then(({ data }) => setConfig(data || null));
      });
    }
  }, [appt]);

  if (!appt) return null;

  const handleSendWhatsAppConfirmation = () => {
    if (!phone) return;
    const templateText = config?.loyalty_messages?.scheduling || "Hola {cliente}, te confirmamos tu cita de {servicio} para el {fecha} a las {hora} con {profesional}. ¡Te esperamos! ✨";
    
    const formattedDate = format(parseLocalISO(appt.start_time), "dd/MM/yyyy");
    const formattedTime = formatTime(appt.start_time);

    const text = templateText
      .replace(/{cliente}/g, appt.customer_name)
      .replace(/{servicio}/g, appt.service_name)
      .replace(/{fecha}/g, formattedDate)
      .replace(/{hora}/g, formattedTime)
      .replace(/{profesional}/g, appt.professional_name);

    const url = getWhatsAppLink(phone, text);
    window.open(url, '_blank');
  };

  const nextStatus = STATUS_FLOW[appt.status];

  const advance = async () => {
    if (!nextStatus) return;
    setLoading(true);
    const updates: Partial<Appointment> = { status: nextStatus as any };
    
    // Always use appointment's scheduled time as the timestamp for transaction and completion to ensure correct bookkeeping
    const transactionTime = appt.end_time || appt.start_time;

    // Scheduled -> Confirmed: Register the deposit as Adelanto
    if (nextStatus === 'confirmed') {
      if (appt.deposit_amount > 0) {
        updates.payment_status = 'partial';
        await transactionsSvc.create({
          type: 'adelanto', status: 'completed',
          category: 'Servicios en Salón', amount: appt.deposit_amount,
          method: appt.payment_method || 'efectivo',
          description: `Adelanto cita: ${appt.service_name} — ${appt.customer_name}`,
          appointment_id: appt.id, user_id: userId,
          created_at: transactionTime
        });
      }
    }

    // Atendido -> Completed: Register the balance as Saldo Cita
    if (nextStatus === 'completed') {
      updates.completed_at = transactionTime;
      updates.payment_status = 'paid';
      
      const totalPaid = transactions.filter(t => t.status === 'completed').reduce((sum, t) => sum + t.amount, 0);
      const remaining = appt.total_amount - totalPaid;
      if (remaining > 0) {
        await transactionsSvc.create({
          type: 'saldo_cita', status: 'completed',
          category: 'Servicios en Salón', amount: remaining,
          method: appt.payment_method || 'efectivo',
          description: `Saldo cita: ${appt.service_name} — ${appt.customer_name}`,
          appointment_id: appt.id, user_id: userId,
          created_at: transactionTime
        });
      }
    }
    
    await appointmentsSvc.update(appt.id, updates);
    setLoading(false);
    onUpdated();
    onClose();
  };

  const cancel = async () => {
    setCancelling(true);
    await appointmentsSvc.update(appt.id, { status: 'cancelled' });
    
    const isHistorical = parseLocalISO(appt.end_time || appt.start_time) < new Date();
    const createdAtOverride = isHistorical ? (appt.end_time || appt.start_time) : undefined;

    // Reverse completed transactions
    const { data: trans } = await transactionsSvc.getByAppointmentId(appt.id);
    if (trans) {
      for (const t of trans) {
        if (t.status === 'completed') {
          await transactionsSvc.create({
            type: 'ajuste', status: 'completed',
            category: 'Anulación de Cita', amount: -t.amount,
            method: t.method,
            description: `Anulación cita: ${t.description}`,
            appointment_id: appt.id, user_id: userId,
            ...(createdAtOverride && { created_at: createdAtOverride })
          });
        }
      }
    }
    
    setCancelling(false);
    onUpdated();
    onClose();
  };

  const markNoShow = async () => {
    setCancelling(true);
    await appointmentsSvc.update(appt.id, { status: 'no-show' });
    
    // No-show might forfeit deposit depending on rules, but to be safe and clean financially 
    // without a specific business rule provided for no-show forfeits, we just mark as no-show.
    // If they want to forfeit the deposit, it stays as 'adelanto' income. 
    
    setCancelling(false);
    onUpdated();
    onClose();
  };

  const start = parseLocalISO(appt.start_time);
  const dateStr = format(start, "EEEE d 'de' MMMM", { locale: es });

  return (
    <Modal open={!!appt} onClose={onClose} title="Detalle de Cita" size="md"
      footer={
        <div className="flex items-center gap-2 w-full">
          {appt.status !== 'cancelled' && appt.status !== 'completed' && appt.status !== 'no-show' && (
            <>
              <Button variant="ghost" size="sm" onClick={markNoShow} disabled={cancelling} type="button">
                No asistió
              </Button>
              <Button variant="subtle" size="sm" onClick={cancel} disabled={cancelling} type="button">
                Cancelar cita
              </Button>
            </>
          )}
          {phone && (
            <Button 
              variant="subtle" 
              size="sm" 
              onClick={handleSendWhatsAppConfirmation} 
              className="text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/50 font-bold flex items-center gap-1.5"
              type="button"
            >
              <span className="material-symbols-outlined text-[16px]">sms</span> Enviar Cita
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="ghost" onClick={onClose} type="button">Cerrar</Button>
          {nextStatus && (
            <Button loading={loading} onClick={advance} type="button">
              {STATUS_BTN_LABEL[appt.status]}
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-5">
        {/* Status badge */}
        <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-stone-100">
          <span className={`px-3 py-0.5 text-[10px] font-bold rounded-full border tracking-wide uppercase ${STATUS_COLORS[appt.status]}`}>
            {STATUS_LABELS[appt.status]}
          </span>
          <span className="text-xs text-stone-400 font-semibold capitalize">{dateStr}</span>
        </div>

        {/* Main info */}
        <div className="bg-stone-50 rounded-2xl p-4.5 space-y-3 border border-stone-100/50">
          <Row label="Cliente"      value={appt.customer_name} bold />
          <Row label="Servicio"     value={appt.service_name} />
          <Row label="Profesional"  value={appt.professional_name} />
          {appt.bed_name && <Row label="Cama"      value={appt.bed_name} />}
          <Row label="Horario"      value={`${formatTime(appt.start_time)} — ${formatTime(appt.end_time)}`} />
          {appt.notes && <Row label="Notas"     value={appt.notes} />}
        </div>

        {/* Financial info */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="bg-white border border-stone-100 rounded-2xl p-3.5 shadow-sm">
            <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Total</p>
            <p className="text-base font-bold text-[#1c1917] mt-1">{formatCurrency(appt.total_amount)}</p>
          </div>
          <div className="bg-white border border-stone-100 rounded-2xl p-3.5 shadow-sm">
            <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Pagado</p>
            <p className="text-base font-bold text-[#d97706] mt-1">{formatCurrency(transactions.filter(t => t.status === 'completed').reduce((s, t) => s + t.amount, 0))}</p>
          </div>
          <div className="bg-white border border-stone-100 rounded-2xl p-3.5 shadow-sm">
            <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Pago</p>
            <p className="text-xs font-bold text-stone-600 mt-2 uppercase tracking-wide">{PAYMENT_LABELS[appt.payment_status]}</p>
          </div>
        </div>

        {/* Transactions List */}
        {transactions.length > 0 && (
          <div className="space-y-2 mt-4">
            <h5 className="text-xs font-bold text-stone-900 uppercase tracking-wider mb-2">Transacciones Registradas</h5>
            {transactions.map(t => (
              <div key={t.id} className="flex items-center justify-between p-3 bg-white rounded-xl text-xs border border-stone-100 shadow-sm">
                <div>
                  <p className="font-bold text-stone-900">{t.category}</p>
                  <p className="text-[10px] text-stone-400 capitalize">{t.method} • {t.status}</p>
                </div>
                <p className={`font-bold ${t.amount < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                  {formatCurrency(t.amount)}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Discount */}
        {appt.discount_amount && appt.discount_amount > 0 ? (
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3 animate-fade-in">
            🏷️ Descuento aplicado: {formatCurrency(appt.discount_amount)}
            {appt.discount_reason && ` — ${appt.discount_reason}`}
          </div>
        ) : null}


      </div>
    </Modal>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between gap-4 border-b border-stone-100/50 pb-2 last:border-0 last:pb-0">
      <span className="text-xs font-semibold text-stone-400">{label}</span>
      <span className={`text-xs text-right font-semibold ${bold ? 'text-[#d97706]' : 'text-[#1c1917]'}`}>{value}</span>
    </div>
  );
}
