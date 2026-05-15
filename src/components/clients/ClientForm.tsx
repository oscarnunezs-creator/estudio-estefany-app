import React, { useState, useEffect } from 'react';
import { Modal, Button, Input, Select } from '../ui';
import { customersSvc } from '../../services/salon';
import type { Customer } from '../../types';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  customer?: Customer | null;
}

const CHANNELS = [
  { value: '', label: '— Selecciona —' },
  { value: 'Instagram', label: 'Instagram' },
  { value: 'Facebook', label: 'Facebook' },
  { value: 'TikTok', label: 'TikTok' },
  { value: 'Presencial', label: 'Presencial' },
  { value: 'Recomendación', label: 'Recomendación' },
  { value: 'Otros', label: 'Otros' },
];

const FREQUENCIES = [
  { value: '', label: '— Selecciona —' },
  { value: 'Primera vez', label: 'Primera vez' },
  { value: 'Esporádico', label: 'Esporádico' },
  { value: 'Mensual', label: 'Mensual' },
  { value: 'Quincenal', label: 'Quincenal' },
  { value: 'Semanal', label: 'Semanal' },
];

function normalizeDateToISO(dateStr: string | undefined | null): string | undefined {
  if (!dateStr) return undefined;
  const clean = dateStr.trim();
  if (!clean) return undefined;

  // If already in YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    return clean;
  }

  // If in DD/MM/YYYY or DD-MM-YYYY format
  const dmyMatch = clean.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmyMatch) {
    const [_, day, month, year] = dmyMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // If in DD/MM/YY or DD-MM-YY format
  const dmyShortMatch = clean.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/);
  if (dmyShortMatch) {
    const [_, day, month, yearShort] = dmyShortMatch;
    const year = parseInt(yearShort, 10) > 50 ? `19${yearShort}` : `20${yearShort}`;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // If it's ISO string, extract date
  if (clean.includes('T')) {
    return clean.split('T')[0];
  }

  return undefined;
}

const EMPTY = {
  first_name: '', last_name: '', phone: '', whatsapp: '', email: '',
  birth_date: '', allergies: '', internal_notes: '',
  preferred_technique: '', acquisition_channel: '' as any, frequency: '' as any,
};

export default function ClientForm({ open, onClose, onSaved, customer }: Props) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const isEdit = !!customer;

  useEffect(() => {
    if (!open) return;
    if (customer) {
      const [first_name, ...rest] = (customer.name || '').split(' ');
      setForm({
        first_name, last_name: rest.join(' '),
        phone: customer.phone || '',
        whatsapp: customer.whatsapp || '',
        email: customer.email || '',
        birth_date: customer.birth_date || '',
        allergies: customer.allergies || '',
        internal_notes: customer.internal_notes || '',
        preferred_technique: customer.preferred_technique || '',
        acquisition_channel: customer.acquisition_channel || '' as any,
        frequency: customer.frequency || '' as any,
      });
    } else {
      setForm(EMPTY);
    }
    setError('');
  }, [open, customer]);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.first_name.trim() || !form.phone.trim()) {
      setError('El nombre y el teléfono son obligatorios.');
      return;
    }
    setSaving(true);
    try {
      const name = `${form.first_name.trim()} ${form.last_name.trim()}`.trim();
      const payload = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        name,
        phone: form.phone.trim(),
        whatsapp: form.whatsapp.trim() || undefined,
        email: form.email.trim() || undefined,
        birth_date: normalizeDateToISO(form.birth_date),
        allergies: form.allergies.trim(),
        internal_notes: form.internal_notes.trim() || undefined,
        preferred_technique: form.preferred_technique.trim() || undefined,
        acquisition_channel: form.acquisition_channel || undefined,
        frequency: form.frequency || undefined,
        metrics: customer?.metrics ?? {
          totalAppointments: 0, attendedAppointments: 0,
          noShows: 0, noShowRate: 0, totalSpent: 0, averageTicket: 0,
        },
        is_recurring: false,
        active: true,
      };

      const { error: err } = isEdit
        ? await customersSvc.update(customer!.id, payload)
        : await customersSvc.create(payload as any);

      if (err) { 
        setError(err.message || 'Error al guardar. Intenta de nuevo.'); 
        return; 
      }
      onSaved();
      onClose();
    } catch (err: any) {
      console.error('Error saving customer:', err);
      setError(err?.message || 'Error de conexión. Verifica tu internet e intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Editar Cliente' : 'Nuevo Cliente'} size="lg"
      footer={<>
        <Button variant="ghost" onClick={onClose} type="button">Cancelar</Button>
        <Button loading={saving} onClick={handleSubmit as any}>{isEdit ? 'Guardar cambios' : 'Registrar cliente'}</Button>
      </>}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl text-xs font-semibold text-rose-600 animate-fade-in">{error}</div>}

        <div className="grid grid-cols-2 gap-4">
          <Input label="Nombre *" value={form.first_name} onChange={e => set('first_name', e.target.value)} placeholder="Nombres" id="cf-fn" />
          <Input label="Apellido" value={form.last_name} onChange={e => set('last_name', e.target.value)} placeholder="Apellidos" id="cf-ln" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Teléfono *" type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+51 999 999 999" id="cf-ph" />
          <Input label="WhatsApp" type="tel" value={form.whatsapp} onChange={e => set('whatsapp', e.target.value)} placeholder="+51 999 999 999" id="cf-wa" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Correo electrónico" type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="correo@ejemplo.com" id="cf-em" />
          <Input label="Fecha de nacimiento" type="date" value={form.birth_date} onChange={e => set('birth_date', e.target.value)} id="cf-bd" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Select label="Canal de Captación" value={form.acquisition_channel} onChange={e => set('acquisition_channel', e.target.value)} options={CHANNELS} id="cf-ch" />
          <Select label="Frecuencia de visita" value={form.frequency} onChange={e => set('frequency', e.target.value)} options={FREQUENCIES} id="cf-fr" />
        </div>
        <Input label="Técnica preferida" value={form.preferred_technique} onChange={e => set('preferred_technique', e.target.value)} placeholder="Ej: Lifting, extensiones volumen" id="cf-tc" />
        <div>
          <label className="text-[10px] font-semibold text-stone-500 uppercase tracking-[0.2em] block mb-1.5">Alergias / Sensibilidades</label>
          <textarea value={form.allergies} onChange={e => set('allergies', e.target.value)}
            className="w-full border-b border-stone-200 bg-transparent text-sm text-[#1c1917] py-2.5 focus:outline-none focus:border-[#d97706] transition-colors resize-none placeholder:text-stone-400"
            rows={2} placeholder="Indicar alergias conocidas o 'Ninguna'..." />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-stone-500 uppercase tracking-[0.2em] block mb-1.5">Notas internas</label>
          <textarea value={form.internal_notes} onChange={e => set('internal_notes', e.target.value)}
            className="w-full border-b border-stone-200 bg-transparent text-sm text-[#1c1917] py-2.5 focus:outline-none focus:border-[#d97706] transition-colors resize-none placeholder:text-stone-400"
            rows={2} placeholder="Observaciones privadas del equipo..." />
        </div>
      </form>
    </Modal>
  );
}
