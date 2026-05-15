import React, { useState, useEffect } from 'react';
import { format, addMinutes } from 'date-fns';
import { Modal, Button, Input, Select } from '../ui';
import { formatCurrency, parseLocalISO } from '../../lib/utils';
import { professionalsSvc, servicesSvc, bedsSvc, customersSvc, appointmentsSvc, configSvc } from '../../services/salon';
import type { Professional, Service, SalonBed, Appointment, SalonConfig } from '../../types';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  userId: string;
  defaultDate?: string; // YYYY-MM-DD
  defaultTime?: string; // HH:MM
  appointment?: Appointment | null; // if editing
}

const PAYMENT_METHODS = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'billetera', label: 'Billetera (Yape/Plin)' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'otros', label: 'Otros' },
];

export default function AppointmentModal({ open, onClose, onSaved, userId: _userId, defaultDate, defaultTime, appointment }: Props) {
  const isEdit = !!appointment;

  const [form, setForm] = useState({
    customerId: '', customerName: '',
    serviceId: '', serviceName: '',
    service2Id: '', service2Name: '',
    professionalId: '', professionalName: '',
    bedId: '', bedName: '',
    date: defaultDate || format(new Date(), 'yyyy-MM-dd'),
    startTime: defaultTime || '09:00',
    paymentMethod: 'efectivo',
    notes: '',
    depositAmount: 0,
    totalAmount: 0,
    endTime: '',
  });

  const [customerSearch, setCustomerSearch] = useState('');
  const [customers, setCustomers] = useState<{ id: string; name: string; phone: string }[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [beds, setBeds] = useState<SalonBed[]>([]);
  const [config, setConfig] = useState<SalonConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Load reference data
  useEffect(() => {
    if (!open) return;
    Promise.all([
      professionalsSvc.getAll(),
      servicesSvc.getAll(),
      bedsSvc.getAll(),
      configSvc.get(),
    ]).then(([p, s, b, c]) => {
      setProfessionals(p.data || []);
      setServices(s.data || []);
      setBeds(b.data || []);
      setConfig(c.data);
    });
    if (appointment) {
      setForm({
        customerId: appointment.customer_id,
        customerName: appointment.customer_name,
        serviceId: appointment.service_id,
        serviceName: appointment.service_name,
        service2Id: '',
        service2Name: '',
        professionalId: appointment.professional_id,
        professionalName: appointment.professional_name,
        bedId: appointment.bed_id || '',
        bedName: appointment.bed_name || '',
        date: format(parseLocalISO(appointment.start_time), 'yyyy-MM-dd'),
        startTime: format(parseLocalISO(appointment.start_time), 'HH:mm'),
        paymentMethod: appointment.payment_method || 'efectivo',
        notes: appointment.notes || '',
        depositAmount: appointment.deposit_amount,
        totalAmount: appointment.total_amount,
        endTime: format(parseLocalISO(appointment.end_time), 'HH:mm'),
      });
      setCustomerSearch(appointment.customer_name);
    } else {
      setForm({
        customerId: '', customerName: '',
        serviceId: '', serviceName: '',
        service2Id: '', service2Name: '',
        professionalId: '', professionalName: '',
        bedId: '', bedName: '',
        date: defaultDate || format(new Date(), 'yyyy-MM-dd'),
        startTime: defaultTime || '09:00',
        paymentMethod: 'efectivo',
        notes: '',
        depositAmount: 0,
        totalAmount: 0,
        endTime: '',
      });
      setCustomerSearch('');
    }
  }, [open, appointment]);

  // Customer search
  useEffect(() => {
    if (customerSearch.length < 2) { setCustomers([]); return; }
    const t = setTimeout(async () => {
      const { data } = await customersSvc.search(customerSearch);
      setCustomers(data || []);
    }, 300);
    return () => clearTimeout(t);
  }, [customerSearch]);

  const selectedService = services.find(s => s.id === form.serviceId);
  const selectedService2 = services.find(s => s.id === form.service2Id);

  // Auto-calculate endTime and deposit when services change
  useEffect(() => {
    if (!selectedService || !form.startTime) return;
    const [h, m] = form.startTime.split(':').map(Number);
    const start = new Date(2000, 0, 1, h, m);
    
    // First service duration + buffer
    const end1 = addMinutes(start, selectedService.duration + selectedService.buffer_time);
    const endTime1 = format(end1, 'HH:mm');
    
    let finalEndTime = endTime1;
    let price = selectedService.price;
    let deposit = config?.deposit_config?.enabled
       ? config.deposit_config.type === 'percentage'
         ? price * config.deposit_config.value
         : config.deposit_config.value
       : 0;

    if (selectedService2) {
      // Second service starts right after first ends
      const end2 = addMinutes(end1, selectedService2.duration + selectedService2.buffer_time);
      finalEndTime = format(end2, 'HH:mm');
      price += selectedService2.price;
      
      const deposit2 = config?.deposit_config?.enabled
         ? config.deposit_config.type === 'percentage'
           ? selectedService2.price * config.deposit_config.value
           : config.deposit_config.value
         : 0;
      deposit += deposit2;
    }

    setForm(f => ({ 
      ...f, 
      endTime: finalEndTime, 
      totalAmount: price, 
      depositAmount: Math.round(deposit * 100) / 100 
    }));
  }, [form.serviceId, form.service2Id, form.startTime, selectedService, selectedService2, config]);

  const set = (k: string, v: string | number) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.customerId || !form.serviceId || !form.professionalId) {
      setError('Completa cliente, servicio y profesional.');
      return;
    }
    setSaving(true);
    try {
      const startISO = `${form.date}T${form.startTime}:00`;
      
      const [h, m] = form.startTime.split(':').map(Number);
      const startD = new Date(2000, 0, 1, h, m);
      const end1D = addMinutes(startD, selectedService!.duration + selectedService!.buffer_time);
      const endTime1Str = format(end1D, 'HH:mm');
      const endISO   = `${form.date}T${endTime1Str}:00`;

      const payload = {
        customer_id: form.customerId, customer_name: form.customerName,
        service_id: form.serviceId,   service_name: form.serviceName,
        professional_id: form.professionalId, professional_name: form.professionalName,
        bed_id: form.bedId || undefined, bed_name: form.bedName || undefined,
        start_time: startISO, end_time: endISO,
        buffer_time: selectedService?.buffer_time || 0,
        status: 'scheduled' as const,
        deposit_amount: form.service2Id 
          ? Math.round((config?.deposit_config?.enabled
              ? config.deposit_config.type === 'percentage'
                ? selectedService!.price * config.deposit_config.value
                : config.deposit_config.value
              : 0) * 100) / 100
          : form.depositAmount,
        total_amount: form.service2Id ? selectedService!.price : form.totalAmount,
        payment_status: 'unpaid' as const,
        payment_method: form.paymentMethod as any,
        notes: form.notes || undefined,
      };

      const { error: err } = isEdit
        ? await appointmentsSvc.update(appointment!.id, payload)
        : await appointmentsSvc.create(payload);

      if (err) { setError('Error al guardar. Intenta de nuevo.'); return; }

      // Schedule second service consecutively (only for new appointments)
      if (!isEdit && form.service2Id && selectedService2) {
        const startISO2 = endISO;
        const end2D = addMinutes(end1D, selectedService2.duration + selectedService2.buffer_time);
        const endTime2Str = format(end2D, 'HH:mm');
        const endISO2   = `${form.date}T${endTime2Str}:00`;

        const payload2 = {
          customer_id: form.customerId, customer_name: form.customerName,
          service_id: form.service2Id,   service_name: form.service2Name,
          professional_id: form.professionalId, professional_name: form.professionalName,
          bed_id: form.bedId || undefined, bed_name: form.bedName || undefined,
          start_time: startISO2, end_time: endISO2,
          buffer_time: selectedService2.buffer_time || 0,
          status: 'scheduled' as const,
          deposit_amount: Math.round((config?.deposit_config?.enabled
            ? config.deposit_config.type === 'percentage'
              ? selectedService2.price * config.deposit_config.value
              : config.deposit_config.value
            : 0) * 100) / 100,
          total_amount: selectedService2.price,
          payment_status: 'unpaid' as const,
          payment_method: form.paymentMethod as any,
          notes: form.notes ? `${form.notes} (Servicio 2)` : undefined,
        };

        const { error: err2 } = await appointmentsSvc.create(payload2);
        if (err2) { 
          setError('Se guardó el primer servicio, pero falló el agendamiento del segundo.'); 
          return; 
        }
      }

      onSaved();
      onClose();
    } catch (err: any) {
      console.error('Error saving appointment:', err);
      setError(err?.message || 'Error de conexión. Verifica tu internet e intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Editar Cita' : 'Nueva Cita'} size="lg"
      footer={<>
        <Button variant="ghost" onClick={onClose} type="button">Cancelar</Button>
        <Button loading={saving} onClick={handleSubmit as any}>
          {isEdit ? 'Guardar cambios' : 'Agendar cita'}
        </Button>
      </>}
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl text-xs font-semibold text-rose-600 animate-fade-in">{error}</div>
        )}

        {/* Cliente */}
        <div className="relative">
          <Input label="Cliente" value={customerSearch}
            onChange={e => { setCustomerSearch(e.target.value); set('customerId', ''); set('customerName', ''); }}
            placeholder="Buscar por nombre..." id="appt-customer" />
          {customers.length > 0 && !form.customerId && (
            <div className="absolute z-10 w-full mt-1 bg-white border border-stone-100 rounded-2xl shadow-lg max-h-48 overflow-y-auto overflow-x-hidden p-1 animate-fade-in">
              {customers.map(c => (
                <button key={c.id} type="button"
                  className="w-full px-4 py-3 text-left hover:bg-stone-50 rounded-xl transition-all duration-200 cursor-pointer"
                  onClick={() => { set('customerId', c.id); set('customerName', c.name); setCustomerSearch(c.name); setCustomers([]); }}>
                  <p className="text-sm font-semibold text-[#1c1917]">{c.name}</p>
                  <p className="text-xs text-stone-400 font-semibold mt-0.5">{c.phone}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Servicio 1 */}
        <Select label={isEdit ? "Servicio" : "Servicio 1"} value={form.serviceId} id="appt-service"
          onChange={e => {
            const s = services.find(x => x.id === e.target.value);
            set('serviceId', e.target.value); set('serviceName', s?.name || '');
          }}
          options={[{ value: '', label: '— Selecciona un servicio —' }, ...services.map(s => ({
            value: s.id, label: `${s.name} — ${formatCurrency(s.price)} (${s.duration}min)`
          }))]}
        />

        {/* Servicio 2 (Opcional - solo nueva cita) */}
        {!isEdit && (
          <Select label="Servicio 2 (Opcional)" value={form.service2Id} id="appt-service-2"
            onChange={e => {
              const s = services.find(x => x.id === e.target.value);
              set('service2Id', e.target.value); set('service2Name', s?.name || '');
            }}
            options={[{ value: '', label: '— Ninguno —' }, ...services.filter(s => s.id !== form.serviceId).map(s => ({
              value: s.id, label: `${s.name} — ${formatCurrency(s.price)} (${s.duration}min)`
            }))]}
          />
        )}

        {/* Profesional + Cama */}
        <div className="grid grid-cols-2 gap-4">
          <Select label="Profesional" value={form.professionalId} id="appt-professional"
            onChange={e => {
              const p = professionals.find(x => x.id === e.target.value);
              set('professionalId', e.target.value); set('professionalName', p?.name || '');
            }}
            options={[{ value: '', label: '— Selecciona —' }, ...professionals.map(p => ({ value: p.id, label: p.name }))]}
          />
          <Select label="Cama / Cabina" value={form.bedId} id="appt-bed"
            onChange={e => {
              const b = beds.find(x => x.id === e.target.value);
              set('bedId', e.target.value); set('bedName', b?.name || '');
            }}
            options={[{ value: '', label: '— Opcional —' }, ...beds.map(b => ({ value: b.id, label: b.name }))]}
          />
        </div>

        {/* Fecha + Hora */}
        <div className="grid grid-cols-2 gap-4">
          <Input label="Fecha" type="date" value={form.date} onChange={e => set('date', e.target.value)} id="appt-date" />
          <Input label="Hora inicio" type="time" value={form.startTime} onChange={e => set('startTime', e.target.value)} id="appt-time" />
        </div>

        {/* Resumen económico */}
        {form.totalAmount > 0 && (
          <div className="bg-stone-50 rounded-2xl p-4 grid grid-cols-3 gap-3 text-center border border-stone-100/50">
            <div>
              <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Total</p>
              <p className="text-sm font-bold text-[#1c1917] mt-1">{formatCurrency(form.totalAmount)}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Anticipo</p>
              <p className="text-sm font-bold text-[#d97706] mt-1">{formatCurrency(form.depositAmount)}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Hora fin</p>
              <p className="text-sm font-bold text-[#1c1917] mt-1">{form.endTime || '—'}</p>
            </div>
          </div>
        )}

        {/* Método de pago y notas */}
        <Select label="Método de pago" value={form.paymentMethod} id="appt-payment"
          onChange={e => set('paymentMethod', e.target.value)} options={PAYMENT_METHODS} />
        <Input label="Notas (opcional)" value={form.notes}
          onChange={e => set('notes', e.target.value)} placeholder="Observaciones internas..." id="appt-notes" />
      </form>
    </Modal>
  );
}
