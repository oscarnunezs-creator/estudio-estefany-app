import { useState, useEffect } from 'react';
import { Modal, Badge, Button, Spinner, EmptyState } from '../ui';
import { formatCurrency, formatDate, formatTime, STATUS_COLORS, STATUS_LABELS, getWhatsAppLink } from '../../lib/utils';
import type { Customer, Appointment, SalonConfig } from '../../types';
import { Calendar, Phone, Mail, Heart, Edit2, MessageCircle, AlertTriangle, Send } from 'lucide-react';
import ClientForm from './ClientForm';

interface Props {
  customer: Customer | null;
  onClose: () => void;
  onUpdated: () => void;
  config?: SalonConfig | null;
}

function MetricBox({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="text-center p-4 bg-stone-50 rounded-2xl border border-stone-100/60 shadow-sm hover:scale-[1.02] transition-transform duration-300">
      <p className="text-xl font-bold text-[#1c1917]">{value}</p>
      <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-widest mt-1.5">{label}</p>
      {sub && <p className="text-[10px] text-stone-400 font-semibold mt-0.5">{sub}</p>}
    </div>
  );
}

export default function ClientDetail({ customer, onClose, onUpdated, config }: Props) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!customer) return;
    setLoading(true);
    // Fetch ALL appointments for this client
    import('../../lib/supabase').then(({ supabase }) => {
      supabase.from('appointments').select('*')
        .eq('customer_id', customer.id)
        .order('start_time', { ascending: false })
        .limit(20)
        .then(({ data }) => {
          setAppointments(data || []);
          setLoading(false);
        });
    });
  }, [customer]);

  if (!customer) return null;

  const m = customer.metrics;
  const noShowRate = m?.noShowRate ? `${(m.noShowRate * 100).toFixed(0)}%` : '0%';
  const birthLabel = customer.birth_date ? formatDate(customer.birth_date, 'dd MMM') : null;
  const isBirthdayThisMonth = customer.birth_date
    ? new Date(customer.birth_date).getMonth() === new Date().getMonth()
    : false;

  const lastVisitDate = m?.lastVisit ? new Date(m.lastVisit) : null;
  const daysSinceLastVisit = lastVisitDate
    ? Math.floor((new Date().getTime() - lastVisitDate.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const isDetractor = daysSinceLastVisit !== null && daysSinceLastVisit >= 60;
  const isRecentVisit = daysSinceLastVisit !== null && daysSinceLastVisit <= 7;

  const handleSendCRM = (type: 'welcome' | 'detractors' | 'maintenance') => {
    if (!customer.phone) return;
    const templates = config?.loyalty_messages || {
      welcome: '¡Bienvenida a Estudio Estefany! 🌸',
      detractors: 'Queremos mejorar tu experiencia. ¿Podemos conversar?',
      maintenance: 'Hola, ya es momento de retocar tus pestañas. ✨'
    };
    
    let templateText = templates[type] || '';
    if (!templateText) {
      if (type === 'welcome') templateText = '¡Bienvenida a Estudio Estefany! 🌸';
      if (type === 'detractors') templateText = 'Queremos mejorar tu experiencia. ¿Podemos conversar?';
      if (type === 'maintenance') templateText = 'Hola, ya es momento de retocar tus pestañas. ✨';
    }

    let text = templateText
      .replace(/{cliente}/g, customer.name)
      .replace(/{telefono}/g, customer.phone);
    
    const lastAppt = appointments[0];
    if (lastAppt) {
      const formattedDate = formatDate(lastAppt.start_time, 'dd/MM/yyyy');
      const formattedTime = formatTime(lastAppt.start_time);
      
      text = text
        .replace(/{servicio}/g, lastAppt.service_name)
        .replace(/{fecha}/g, formattedDate)
        .replace(/{hora}/g, formattedTime)
        .replace(/{profesional}/g, lastAppt.professional_name);
    } else {
      text = text
        .replace(/{servicio}/g, customer.favorite_service || 'tu servicio preferido')
        .replace(/{fecha}/g, m?.lastVisit ? formatDate(m.lastVisit, 'dd/MM/yyyy') : 'pronto')
        .replace(/{hora}/g, '')
        .replace(/{profesional}/g, 'nuestra especialista');
    }

    const url = getWhatsAppLink(customer.phone, text);
    window.open(url, '_blank');
  };

  return (
    <>
      <Modal open={!!customer} onClose={onClose} title="Ficha del Cliente" size="xl"
        footer={
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} type="button">Cerrar</Button>
            <Button onClick={() => setEditing(true)} type="button">
              <Edit2 size={14} /> Editar
            </Button>
          </div>
        }
      >
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-full bg-amber-50 text-[#d97706] flex items-center justify-center flex-shrink-0 font-bold text-xl shadow-inner">
              {customer.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-serif text-[#1c1917] font-normal tracking-wide">{customer.name}</h2>
                {isBirthdayThisMonth && <span title="Cumpleaños este mes" className="text-sm">🎂</span>}
                {customer.frequency && (
                  <Badge variant={customer.frequency === 'Semanal' || customer.frequency === 'Quincenal' ? 'success' : 'peach'}>
                    {customer.frequency}
                  </Badge>
                )}
                {m?.totalSpent > 500 && <Badge variant="peach">VIP</Badge>}
                {isDetractor && (
                  <Badge variant="peach" className="bg-rose-50 text-rose-600 border border-rose-100 font-bold flex items-center gap-1 select-none text-[10px]">
                    <AlertTriangle size={10} /> Inactivo &gt; 2 meses
                  </Badge>
                )}
              </div>
              <div className="flex flex-wrap gap-4 mt-3.5">
                {customer.phone && (
                  <a href={`tel:${customer.phone}`} className="flex items-center gap-1.5 text-xs text-stone-500 hover:text-[#d97706] font-semibold transition-colors">
                    <Phone size={11} className="text-stone-400" />{customer.phone}
                  </a>
                )}
                {customer.whatsapp && (
                  <a href={getWhatsAppLink(customer.whatsapp, '')} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1.5 text-xs text-[#d97706] hover:text-amber-700 font-bold transition-colors">
                    <MessageCircle size={11} className="text-[#d97706]/75" />WhatsApp
                  </a>
                )}
                {customer.email && (
                  <a href={`mailto:${customer.email}`} className="flex items-center gap-1.5 text-xs text-stone-500 hover:text-[#d97706] font-semibold transition-colors">
                    <Mail size={11} className="text-stone-400" />{customer.email}
                  </a>
                )}
                {birthLabel && (
                  <span className="flex items-center gap-1.5 text-xs text-stone-500 font-semibold">
                    <Heart size={11} className="text-rose-400" />{birthLabel}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <MetricBox label="Citas totales" value={m?.totalAppointments ?? 0} />
            <MetricBox label="Total gastado" value={formatCurrency(m?.totalSpent ?? 0)} />
            <MetricBox label="Ticket prom." value={formatCurrency(m?.averageTicket ?? 0)} />
            <MetricBox label="No-shows" value={m?.noShows ?? 0} sub={noShowRate} />
          </div>

          {/* CRM Alerts / Interactive Recovery Section */}
          {(isDetractor || isRecentVisit || (m && m.totalAppointments === 0)) && (
            <div className={`p-5 rounded-3xl border ${
              isDetractor 
                ? 'bg-rose-50/50 border-rose-100 text-rose-900' 
                : isRecentVisit 
                  ? 'bg-amber-50/40 border-amber-100 text-amber-900' 
                  : 'bg-stone-50 border-stone-100 text-stone-900'
            } flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-fade-in`}>
              <div className="flex gap-3">
                <div className={`p-2.5 rounded-2xl ${
                  isDetractor 
                    ? 'bg-rose-100 text-rose-600' 
                    : isRecentVisit 
                      ? 'bg-amber-100 text-amber-700' 
                      : 'bg-stone-100 text-stone-600'
                } flex items-center justify-center flex-shrink-0`}>
                  {isDetractor ? <AlertTriangle size={20} /> : <MessageCircle size={20} />}
                </div>
                <div>
                  <h4 className="text-sm font-bold font-sans">
                    {isDetractor 
                      ? `Cliente Detractor / Inactivo (${daysSinceLastVisit} días sin servicios)` 
                      : isRecentVisit 
                        ? `Seguimiento Post-Servicio (${daysSinceLastVisit} días de su visita)` 
                        : 'Nuevo Cliente — Sin servicios aún'}
                  </h4>
                  <p className="text-xs text-stone-500 font-semibold mt-1 leading-relaxed">
                    {isDetractor 
                      ? 'Este cliente tiene más de 2 meses de inactividad. Utiliza la plantilla interactiva para recuperarlo.' 
                      : isRecentVisit 
                        ? 'Fue atendido recientemente. Envíale un mensaje de control de calidad o sugerencia de retoque.' 
                        : 'Dale una bienvenida premium al estudio y ofrécele fidelización.'}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 w-full md:w-auto flex-shrink-0">
                {isDetractor && (
                  <Button 
                    variant="primary" 
                    size="sm"
                    className="bg-rose-600 hover:bg-rose-700 text-white border-0 shadow-sm flex items-center gap-2 text-xs font-bold w-full md:w-auto py-2.5 px-4"
                    onClick={() => handleSendCRM('detractors')}
                  >
                    <Send size={12} /> Recuperar Cliente
                  </Button>
                )}
                {isRecentVisit && (
                  <Button 
                    variant="primary" 
                    size="sm"
                    className="bg-amber-600 hover:bg-amber-700 text-white border-0 shadow-sm flex items-center gap-2 text-xs font-bold w-full md:w-auto py-2.5 px-4"
                    onClick={() => handleSendCRM('maintenance')}
                  >
                    <Send size={12} /> Enviar Seguimiento
                  </Button>
                )}
                {(!m || m.totalAppointments === 0) && (
                  <Button 
                    variant="primary" 
                    size="sm"
                    className="flex items-center gap-2 text-xs font-bold w-full md:w-auto py-2.5 px-4"
                    onClick={() => handleSendCRM('welcome')}
                  >
                    <Send size={12} /> Enviar Bienvenida
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Info grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <InfoCard title="Preferencias">
              <Row label="Canal de Captación" value={customer.acquisition_channel || '—'} />
              <Row label="Técnica preferida" value={customer.preferred_technique || '—'} />
              <Row label="Servicio favorito" value={customer.favorite_service || '—'} />
              {m?.lastVisit && <Row label="Última visita" value={formatDate(m.lastVisit)} />}
            </InfoCard>
            <InfoCard title="Salud y notas">
              <div>
                <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-widest mb-1">Alergias</p>
                <p className="text-xs font-semibold text-[#1c1917]">{customer.allergies || 'Sin alergias registradas'}</p>
              </div>
              {customer.internal_notes && (
                <div className="mt-3 pt-3 border-t border-stone-100">
                  <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-widest mb-1">Notas internas</p>
                  <p className="text-xs font-medium text-stone-600 leading-normal">{customer.internal_notes}</p>
                </div>
              )}
            </InfoCard>
          </div>

          {/* Appointment history */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-stone-400 uppercase tracking-[0.15em] flex items-center gap-2">
              <Calendar size={13} className="text-[#d97706]" />
              Historial de citas ({appointments.length})
            </h3>
            {loading ? (
              <div className="flex justify-center py-6"><Spinner /></div>
            ) : appointments.length === 0 ? (
              <EmptyState icon={<Calendar size={32} />} title="Sin historial" description="Las citas aparecerán aquí." />
            ) : (
              <div className="divide-y divide-stone-100 max-h-56 overflow-y-auto pr-1">
                {appointments.map(a => (
                  <div key={a.id} className="flex items-center gap-3 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-[#1c1917]">{a.service_name}</p>
                      <p className="text-[10px] text-stone-400 font-medium mt-0.5">{formatDate(a.start_time, 'dd/MM/yyyy HH:mm')} · {a.professional_name}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${STATUS_COLORS[a.status]}`}>
                        {STATUS_LABELS[a.status]}
                      </span>
                      <span className="text-xs font-bold text-[#1c1917]">{formatCurrency(a.total_amount)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* Edit modal */}
      <ClientForm open={editing} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); onUpdated(); }} customer={customer} />
    </>
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-stone-50 rounded-2xl p-4.5 space-y-2.5 border border-stone-100/50">
      <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 border-b border-stone-100/40 pb-1.5 last:border-0 last:pb-0">
      <span className="text-[10px] font-semibold text-stone-400">{label}</span>
      <span className="text-[10px] text-right font-semibold text-[#1c1917] max-w-[60%] truncate">{value}</span>
    </div>
  );
}
