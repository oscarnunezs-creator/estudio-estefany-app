import React, { useState, useEffect, useCallback } from 'react';
import { Button, Modal, Badge, Spinner, EmptyState, Input, Select, Card, ErrorState } from './ui';
import { configSvc, professionalsSvc, servicesSvc, bedsSvc, usersSvc } from '../services/salon';
import { setSalonCurrency } from '../lib/utils';
import Papa from 'papaparse';
import type { SalonConfig, Professional, Service, SalonBed, UserProfile } from '../types';

export default function AdminSettings() {
  const [activeTab, setActiveTab] = useState<'catalog' | 'staff' | 'beds' | 'policies' | 'messages' | 'users'>('catalog');
  
  const [config, setConfig] = useState<SalonConfig | null>(null);
  const [staff, setStaff] = useState<Professional[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [beds, setBeds] = useState<SalonBed[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Modals
  const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  const [isBedModalOpen, setIsBedModalOpen] = useState(false);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);

  const [editingService, setEditingService] = useState<Service | null>(null);
  const [editingStaff, setEditingStaff] = useState<Professional | null>(null);
  const [editingBed, setEditingBed] = useState<SalonBed | null>(null);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);

  // Forms
  const [serviceForm, setServiceForm] = useState({
    name: '', description: '', duration: 60, buffer_time: 15, price: 0, category: 'Pestañas', commission_rate: 0.3, commission_amount: 0
  });

  const [staffForm, setStaffForm] = useState({
    name: '', specialties: '', commission_rate: 0.3, offers_home_service: false,
    paymentType: 'commission_only' as 'fixed'|'hourly'|'daily'|'commission_only', baseSalary: 0, rateValue: 0, frequency: 'monthly' as 'biweekly'|'monthly',
    birth_date: ''
  });

  const [bedForm, setBedForm] = useState({ name: '', notes: '' });
  const [userForm, setUserForm] = useState({ display_name: '', role: 'staff' as 'admin'|'staff', active: true });

  const loadData = useCallback(async () => {
    setLoadError(null);
    const timeoutId = setTimeout(() => {
      setLoading(false);
      setLoadError('La carga tomó demasiado tiempo. Verifica tu conexión.');
    }, 12000);
    try {
      setLoading(true);
      const [confRes, staffRes, servRes, bedsRes, usersRes] = await Promise.all([
        configSvc.get(),
        professionalsSvc.getAll(),
        servicesSvc.getAll(),
        bedsSvc.getAll(),
        usersSvc.getAll()
      ]);
      if (confRes.data) {
        setConfig(confRes.data);
        if (confRes.data.currency) setSalonCurrency(confRes.data.currency);
      }
      if (staffRes.data) setStaff(staffRes.data);
      if (servRes.data) setServices(servRes.data);
      if (bedsRes.data) setBeds(bedsRes.data);
      if (usersRes.data) setUsers(usersRes.data);
    } catch (err) {
      console.error(err);
      setLoadError('No se pudo cargar la configuración. Intenta de nuevo.');
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // --- CATALOG LOGIC ---
  const handleOpenServiceModal = (s?: Service) => {
    if (s) {
      setEditingService(s);
      setServiceForm({
        name: s.name, description: s.description || '', duration: s.duration || 60, buffer_time: s.buffer_time || 15,
        price: s.price || 0, category: s.category || 'Pestañas', commission_rate: s.commission_rate || 0, commission_amount: s.commission_amount || 0
      });
    } else {
      setEditingService(null);
      setServiceForm({ name: '', description: '', duration: 60, buffer_time: 15, price: 0, category: 'Pestañas', commission_rate: 0.3, commission_amount: 0 });
    }
    setIsServiceModalOpen(true);
  };

  const handleSaveService = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      if (editingService) {
        await servicesSvc.update(editingService.id, { ...serviceForm, active: true });
      } else {
        await servicesSvc.create({ ...serviceForm, active: true });
      }
      setIsServiceModalOpen(false);
      loadData();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleService = async (s: Service) => {
    try {
      await servicesSvc.update(s.id, { active: !s.active });
      loadData();
    } catch (err) { console.error(err); }
  };

  const handleExportServices = () => {
    const rows = services.map(s => ({
      nombre: s.name,
      descripcion: s.description || '',
      duracion_minutos: s.duration,
      buffer_minutos: s.buffer_time,
      precio: s.price,
      categoria: s.category,
      comision_porcentaje: (s.commission_rate || 0) * 100,
      comision_monto_fijo: s.commission_amount || 0,
      estado: s.active ? 'Activo' : 'Inactivo'
    }));
    if (rows.length === 0) return alert('No hay servicios para exportar.');
    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `servicios.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportServices = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        setIsSaving(true);
        let count = 0;
        try {
          for (const row of results.data as any[]) {
            const name = row['nombre'] || row['Nombre'];
            if (!name) continue;
            await servicesSvc.create({
              name: name,
              description: row['descripcion'] || row['Descripción'] || '',
              duration: Number(row['duracion_minutos'] || row['Duración']) || 60,
              buffer_time: Number(row['buffer_minutos'] || row['Buffer']) || 15,
              price: Number(row['precio'] || row['Precio']) || 0,
              category: row['categoria'] || row['Categoría'] || 'General',
              commission_rate: (Number(row['comision_porcentaje'] || row['Comisión %']) || 0) / 100,
              commission_amount: Number(row['comision_monto_fijo'] || row['Comisión Fija']) || 0,
              active: (row['estado'] || row['Estado']) !== 'Inactivo',
            });
            count++;
          }
          alert(`¡Se importaron ${count} servicios exitosamente!`);
          loadData();
        } catch (err) {
          console.error(err);
          alert('Error al importar servicios.');
        } finally {
          setIsSaving(false);
          e.target.value = '';
        }
      }
    });
  };

  // --- STAFF LOGIC ---
  const handleOpenStaffModal = (p?: Professional) => {
    if (p) {
      setEditingStaff(p);
      setStaffForm({
        name: p.name, specialties: (p.specialties || []).join(', '),
        commission_rate: p.commission_rate || 0.3, offers_home_service: p.offers_home_service || false,
        paymentType: p.salary_config?.paymentType || 'commission_only',
        baseSalary: p.salary_config?.baseSalary || 0,
        rateValue: p.salary_config?.rateValue || 0,
        frequency: p.salary_config?.frequency || 'monthly',
        birth_date: p.birth_date || ''
      });
    } else {
      setEditingStaff(null);
      setStaffForm({
        name: '', specialties: '', commission_rate: 0.3, offers_home_service: false,
        paymentType: 'commission_only', baseSalary: 0, rateValue: 0, frequency: 'monthly', birth_date: ''
      });
    }
    setIsStaffModalOpen(true);
  };

  const handleSaveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const payload = {
        name: staffForm.name,
        specialties: staffForm.specialties.split(',').map(s => s.trim()),
        commission_rate: staffForm.commission_rate,
        offers_home_service: staffForm.offers_home_service,
        birth_date: staffForm.birth_date,
        salary_config: {
          paymentType: staffForm.paymentType,
          baseSalary: staffForm.baseSalary,
          rateValue: staffForm.rateValue,
          frequency: staffForm.frequency,
          bonuses: []
        },
        active: true
      };

      if (editingStaff) await professionalsSvc.update(editingStaff.id, payload);
      else await professionalsSvc.create(payload);
      
      setIsStaffModalOpen(false);
      loadData();
    } catch (err) { console.error(err); } finally { setIsSaving(false); }
  };

  const handleToggleStaff = async (p: Professional) => {
    try { await professionalsSvc.update(p.id, { active: !p.active }); loadData(); } catch (err) { console.error(err); }
  };

  // --- BEDS LOGIC ---
  const handleOpenBedModal = (b?: SalonBed) => {
    if (b) { setEditingBed(b); setBedForm({ name: b.name, notes: b.notes || '' }); }
    else { setEditingBed(null); setBedForm({ name: '', notes: '' }); }
    setIsBedModalOpen(true);
  };

  const handleSaveBed = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      if (editingBed) await bedsSvc.update(editingBed.id, { ...bedForm, active: true });
      else await bedsSvc.create({ ...bedForm, active: true });
      setIsBedModalOpen(false);
      loadData();
    } catch (err) { console.error(err); } finally { setIsSaving(false); }
  };

  const handleToggleBed = async (b: SalonBed) => {
    try { await bedsSvc.update(b.id, { active: !b.active }); loadData(); } catch (err) { console.error(err); }
  };
  
  // --- USERS LOGIC ---
  const handleOpenUserModal = (u: UserProfile) => {
    setEditingUser(u);
    setUserForm({
      display_name: u.display_name || '',
      role: u.role as 'admin'|'staff',
      active: u.active
    });
    setIsUserModalOpen(true);
  };
  
  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setIsSaving(true);
    try {
      await usersSvc.update(editingUser.uid, userForm);
      setIsUserModalOpen(false);
      loadData();
    } catch (err) {
      console.error(err);
      alert('Error actualizando usuario.');
    } finally {
      setIsSaving(false);
    }
  };

  // --- POLICIES LOGIC ---
  const handleSaveConfig = async () => {
    if (!config) return;
    setIsSaving(true);
    try {
      await configSvc.update(config.id, config);
      if (config.currency) setSalonCurrency(config.currency);
      alert('Ajustes del salón guardados exitosamente.');
    } catch (err) {
      console.error(err);
      alert('Error guardando ajustes.');
    } finally {
      setIsSaving(false);
    }
  };

  if (loading && !config) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  if (loadError) return <div className="flex justify-center py-20 px-8"><ErrorState message={loadError} onRetry={loadData} /></div>;

  const groupedServices = services.reduce((acc, service) => {
    const category = service.category || 'Otros';
    if (!acc[category]) acc[category] = [];
    acc[category].push(service);
    return acc;
  }, {} as Record<string, Service[]>);

  return (
    <div className="p-4 md:p-8 space-y-8 animate-fade-in bg-background flex-1 overflow-y-auto pb-24">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-4xl font-headline-md text-on-surface tracking-tight font-normal">
            Ajustes del Sistema
          </h1>
          <p className="text-on-surface-variant mt-2 max-w-xl">
            Catálogo de servicios, personal, ubicaciones y políticas de la empresa.
          </p>
        </div>
        {(activeTab === 'policies' || activeTab === 'messages') && (
          <Button variant="primary" onClick={handleSaveConfig} disabled={isSaving} className="shadow-lg shadow-primary/20">
            {isSaving ? <Spinner size="sm" /> : <><span className="material-symbols-outlined mr-2">save</span>Guardar Ajustes</>}
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-outline-variant/30 pb-4 overflow-x-auto">
        <button onClick={() => setActiveTab('catalog')} className={`px-6 py-2 rounded-full font-medium transition-all flex items-center gap-2 ${activeTab === 'catalog' ? 'bg-primary text-white' : 'bg-surface-container hover:bg-surface-container-high'}`}>
          <span className="material-symbols-outlined text-sm">auto_awesome</span> Catálogo
        </button>
        <button onClick={() => setActiveTab('staff')} className={`px-6 py-2 rounded-full font-medium transition-all flex items-center gap-2 ${activeTab === 'staff' ? 'bg-primary text-white' : 'bg-surface-container hover:bg-surface-container-high'}`}>
          <span className="material-symbols-outlined text-sm">groups</span> Personal
        </button>
        <button onClick={() => setActiveTab('beds')} className={`px-6 py-2 rounded-full font-medium transition-all flex items-center gap-2 ${activeTab === 'beds' ? 'bg-primary text-white' : 'bg-surface-container hover:bg-surface-container-high'}`}>
          <span className="material-symbols-outlined text-sm">bed</span> Camillas
        </button>
        <button onClick={() => setActiveTab('policies')} className={`px-6 py-2 rounded-full font-medium transition-all flex items-center gap-2 ${activeTab === 'policies' ? 'bg-primary text-white' : 'bg-surface-container hover:bg-surface-container-high'}`}>
          <span className="material-symbols-outlined text-sm">policy</span> Políticas
        </button>
        <button onClick={() => setActiveTab('messages')} className={`px-6 py-2 rounded-full font-medium transition-all flex items-center gap-2 ${activeTab === 'messages' ? 'bg-primary text-white' : 'bg-surface-container hover:bg-surface-container-high'}`}>
          <span className="material-symbols-outlined text-sm">sms</span> Mensajes CRM
        </button>
        <button onClick={() => setActiveTab('users')} className={`px-6 py-2 rounded-full font-medium transition-all flex items-center gap-2 ${activeTab === 'users' ? 'bg-primary text-white' : 'bg-surface-container hover:bg-surface-container-high'}`}>
          <span className="material-symbols-outlined text-sm">admin_panel_settings</span> Usuarios
        </button>
      </div>

      {/* TAB: CATALOG */}
      {activeTab === 'catalog' && (
        <div className="space-y-8 animate-fade-in">
          <div className="flex justify-end gap-2 items-center flex-wrap">
            <input type="file" id="import-services" className="hidden" accept=".csv" onChange={handleImportServices} disabled={isSaving} />
            <Button variant="ghost" onClick={() => document.getElementById('import-services')?.click()} disabled={isSaving}>
              {isSaving ? <Spinner size="sm" /> : <><span className="material-symbols-outlined mr-2">upload</span>Importar</>}
            </Button>
            <Button variant="ghost" onClick={handleExportServices} disabled={isSaving}>
              <span className="material-symbols-outlined mr-2">download</span>Exportar
            </Button>
            <Button variant="primary" onClick={() => handleOpenServiceModal()} disabled={isSaving}>
              <span className="material-symbols-outlined mr-2">add</span> Nuevo Servicio
            </Button>
          </div>
          {Object.entries(groupedServices).map(([category, srvs]) => (
            <div key={category} className="space-y-4">
              <h3 className="font-serif text-2xl text-on-surface border-b border-outline-variant/20 pb-2">{category}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {srvs.map(srv => (
                  <Card key={srv.id} className={`flex flex-col gap-2 ${!srv.active ? 'opacity-50 grayscale' : ''}`}>
                    <div className="flex justify-between items-start">
                      <h4 className="font-serif text-lg font-bold text-on-surface">{srv.name}</h4>
                      <Badge variant={srv.active ? 'success' : 'default'}>{srv.active ? 'Activo' : 'Inactivo'}</Badge>
                    </div>
                    <p className="text-sm text-on-surface-variant flex items-center gap-1">
                      <span className="material-symbols-outlined text-[16px]">schedule</span> {srv.duration} min (+{srv.buffer_time}m buffer)
                    </p>
                    <p className="text-2xl font-bold text-primary mt-2">S/ {srv.price.toFixed(2)}</p>
                    <div className="mt-4 pt-4 border-t border-outline-variant/20 flex justify-between">
                      <Button variant="ghost" onClick={() => handleToggleService(srv)} className="text-xs p-2">
                        {srv.active ? 'Desactivar' : 'Activar'}
                      </Button>
                      <Button variant="subtle" onClick={() => handleOpenServiceModal(srv)} className="text-xs p-2">Editar</Button>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ))}
          {services.length === 0 && <EmptyState icon={<span className="material-symbols-outlined text-[48px]">auto_awesome</span>} title="Catálogo Vacío" description="Registra los servicios que ofrece tu estudio." />}
        </div>
      )}

      {/* TAB: STAFF */}
      {activeTab === 'staff' && (
        <div className="space-y-6 animate-fade-in">
          <div className="flex justify-end">
            <Button variant="primary" onClick={() => handleOpenStaffModal()}><span className="material-symbols-outlined mr-2">person_add</span> Añadir Staff</Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {staff.map(person => (
              <Card key={person.id} className={`flex flex-col gap-4 ${!person.active ? 'opacity-50 grayscale' : ''}`}>
                <div className="flex justify-between items-start">
                  <h4 className="font-serif text-xl font-bold text-on-surface">{person.name}</h4>
                  <Badge variant={person.active ? 'success' : 'default'}>{person.active ? 'Activo' : 'Inactivo'}</Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(person.specialties || []).map((s, i) => <Badge key={i} variant="default" className="text-xs">{s}</Badge>)}
                </div>
                <div className="p-3 bg-surface-container rounded-xl mt-2">
                  <p className="text-xs text-on-surface-variant uppercase tracking-wider font-bold mb-1">Estructura Salarial</p>
                  <p className="text-sm font-medium">Tipo: <span className="capitalize">{person.salary_config?.paymentType.replace('_', ' ')}</span></p>
                  {person.salary_config?.paymentType !== 'commission_only' && <p className="text-sm">Sueldo Base: S/ {person.salary_config?.baseSalary}</p>}
                  <p className="text-sm font-bold text-secondary">Comisión: {(person.commission_rate || 0) * 100}%</p>
                </div>
                <div className="mt-auto flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => handleToggleStaff(person)} className="text-xs">
                    {person.active ? 'Desactivar' : 'Activar'}
                  </Button>
                  <Button variant="subtle" onClick={() => handleOpenStaffModal(person)} className="text-xs">Editar</Button>
                </div>
              </Card>
            ))}
          </div>
          {staff.length === 0 && <EmptyState icon={<span className="material-symbols-outlined text-[48px]">groups</span>} title="Sin Personal" description="Agrega miembros a tu equipo para empezar a agendar." />}
        </div>
      )}

      {/* TAB: BEDS */}
      {activeTab === 'beds' && (
        <div className="space-y-6 animate-fade-in max-w-4xl">
          <div className="flex justify-end">
            <Button variant="primary" onClick={() => handleOpenBedModal()}><span className="material-symbols-outlined mr-2">add</span> Nueva Camilla / Espacio</Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {beds.map(bed => (
              <Card key={bed.id} className={`flex flex-col gap-2 ${!bed.active ? 'opacity-50 grayscale' : ''}`}>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-primary bg-primary/10 p-2 rounded-xl">bed</span>
                    <h4 className="font-serif text-lg font-bold text-on-surface">{bed.name}</h4>
                  </div>
                  <Badge variant={bed.active ? 'success' : 'default'}>{bed.active ? 'Activo' : 'Inactivo'}</Badge>
                </div>
                {bed.notes && <p className="text-sm text-on-surface-variant italic mt-2">"{bed.notes}"</p>}
                <div className="mt-4 pt-4 border-t border-outline-variant/20 flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => handleToggleBed(bed)} className="text-xs">{bed.active ? 'Desactivar' : 'Activar'}</Button>
                  <Button variant="subtle" onClick={() => handleOpenBedModal(bed)} className="text-xs">Editar</Button>
                </div>
              </Card>
            ))}
          </div>
          {beds.length === 0 && <EmptyState icon={<span className="material-symbols-outlined text-[48px]">bed</span>} title="Sin Espacios" description="Configura tus camillas o cabinas para controlar la disponibilidad." />}
        </div>
      )}

      {/* TAB: POLICIES */}
      {activeTab === 'policies' && config && (
        <div className="space-y-8 animate-fade-in max-w-5xl">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="space-y-4">
              <h3 className="font-serif text-xl text-on-surface flex items-center gap-2 border-b border-outline-variant/20 pb-2">
                <span className="material-symbols-outlined">storefront</span> Perfil del Estudio
              </h3>
              <Input label="Nombre Comercial" value={config.name} onChange={e => setConfig({...config, name: e.target.value})} />
              <Input label="Moneda" value={config.currency} onChange={e => setConfig({...config, currency: e.target.value})} />
              <Input type="number" label="Tasa de Impuesto (%)" value={config.tax_rate} onChange={e => setConfig({...config, tax_rate: Number(e.target.value)})} />
            </Card>

            <Card className="space-y-4">
              <h3 className="font-serif text-xl text-on-surface flex items-center gap-2 border-b border-outline-variant/20 pb-2">
                <span className="material-symbols-outlined">payments</span> Reglas de Anticipo (Depósito)
              </h3>
              <Select 
                label="Tipo de Cálculo" 
                value={config.deposit_config?.type || 'percentage'} 
                onChange={e => setConfig({...config, deposit_config: {...config.deposit_config, type: e.target.value as any}})}
                options={[ { value: 'percentage', label: 'Porcentaje del total (%)' }, { value: 'fixed', label: 'Monto Fijo' } ]}
              />
              <Input type="number" label="Valor Base del Anticipo" value={config.deposit_config?.value || 0} onChange={e => setConfig({...config, deposit_config: {...config.deposit_config, value: Number(e.target.value)}})} />
              <Input type="number" label="Límite para Pago (Horas)" value={config.deposit_config?.paymentDeadlineHours || 0} onChange={e => setConfig({...config, deposit_config: {...config.deposit_config, paymentDeadlineHours: Number(e.target.value)}})} />
            </Card>

            <Card className="space-y-4 md:col-span-2">
              <h3 className="font-serif text-xl text-on-surface flex items-center gap-2 border-b border-outline-variant/20 pb-2">
                <span className="material-symbols-outlined">loyalty</span> Descuentos de Fidelización Automáticos
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Input type="number" label="Nuevo Cliente (%)" value={config.policies?.discountNewClient || 0} onChange={e => setConfig({...config, policies: {...config.policies, discountNewClient: Number(e.target.value)}})} />
                <Input type="number" label="Cliente Frecuente (%)" value={config.policies?.discountFrequent || 0} onChange={e => setConfig({...config, policies: {...config.policies, discountFrequent: Number(e.target.value)}})} />
                <Input type="number" label="Cumpleaños (%)" value={config.policies?.discountBirthday || 0} onChange={e => setConfig({...config, policies: {...config.policies, discountBirthday: Number(e.target.value)}})} />
                <Input type="number" label="Límite sin Autorización (%)" value={config.policies?.maxDiscountWithoutAuth || 0} onChange={e => setConfig({...config, policies: {...config.policies, maxDiscountWithoutAuth: Number(e.target.value)}})} />
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* TAB: USERS */}
      {activeTab === 'users' && (
        <div className="space-y-6 animate-fade-in max-w-5xl">
          <Card className="p-0 overflow-hidden border border-outline-variant/30">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse font-sans">
                <thead>
                  <tr className="bg-surface-container-low text-on-surface-variant text-[10px] uppercase tracking-[0.15em] font-bold">
                    <th className="px-6 py-4">Usuario</th>
                    <th className="px-6 py-4">Email</th>
                    <th className="px-6 py-4">Rol</th>
                    <th className="px-6 py-4">Estado</th>
                    <th className="px-6 py-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {users.map(u => (
                    <tr key={u.uid} className="hover:bg-surface-container-lowest transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
                            {(u.display_name || u.email)[0].toUpperCase()}
                          </div>
                          <span className="text-sm font-bold text-on-surface">{u.display_name || 'Sin nombre'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-on-surface-variant">{u.email}</td>
                      <td className="px-6 py-4">
                        <Badge variant={u.role === 'admin' ? 'peach' : 'default'} className="capitalize">{u.role}</Badge>
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant={u.active ? 'success' : 'danger'}>{u.active ? 'Activo' : 'Inactivo'}</Badge>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Button variant="subtle" onClick={() => handleOpenUserModal(u)} className="p-2">
                          <span className="material-symbols-outlined text-[18px]">edit</span>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <div className="p-4 bg-primary-fixed rounded-2xl border border-primary/10 flex items-start gap-4">
            <span className="material-symbols-outlined text-primary mt-0.5">info</span>
            <div>
              <p className="text-sm font-bold text-primary">Gestión de Acceso</p>
              <p className="text-xs text-on-surface-variant leading-relaxed mt-1">
                Los usuarios deben registrarse primero con su correo electrónico. Aquí puedes activar/desactivar sus cuentas y asignarles el rol de <strong>Administrador</strong> (acceso total) o <strong>Staff</strong> (acceso limitado a agenda y POS).
              </p>
            </div>
          </div>
        </div>
      )}

      {/* --- MODALS --- */}
      <Modal open={isServiceModalOpen} onClose={() => !isSaving && setIsServiceModalOpen(false)} title={editingService ? 'Editar Servicio' : 'Nuevo Servicio'}>
        <form onSubmit={handleSaveService} className="space-y-4">
          <Input required label="Nombre del Servicio" value={serviceForm.name} onChange={e => setServiceForm({...serviceForm, name: e.target.value})} />
          <div className="grid grid-cols-2 gap-4">
            <Input required type="number" label="Duración (min)" value={serviceForm.duration} onChange={e => setServiceForm({...serviceForm, duration: Number(e.target.value)})} />
            <Input required type="number" label="Tiempo Extra (Buffer)" value={serviceForm.buffer_time} onChange={e => setServiceForm({...serviceForm, buffer_time: Number(e.target.value)})} />
            <Input required type="number" label="Precio (S/.)" value={serviceForm.price} onChange={e => setServiceForm({...serviceForm, price: Number(e.target.value)})} />
            <Input required label="Categoría" value={serviceForm.category} onChange={e => setServiceForm({...serviceForm, category: e.target.value})} />
          </div>

          <div className="flex justify-end gap-3 pt-4"><Button variant="ghost" type="button" onClick={() => setIsServiceModalOpen(false)}>Cancelar</Button><Button type="submit" variant="primary" disabled={isSaving}>Guardar</Button></div>
        </form>
      </Modal>

      <Modal open={isStaffModalOpen} onClose={() => !isSaving && setIsStaffModalOpen(false)} title={editingStaff ? 'Editar Personal' : 'Añadir Personal'}>
        <form onSubmit={handleSaveStaff} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input required label="Nombre Completo" value={staffForm.name} onChange={e => setStaffForm({...staffForm, name: e.target.value})} />
            <Input type="date" label="Fecha de Nacimiento" value={staffForm.birth_date} onChange={e => setStaffForm({...staffForm, birth_date: e.target.value})} />
          </div>
          <Input required label="Especialidades (separadas por comas)" value={staffForm.specialties} onChange={e => setStaffForm({...staffForm, specialties: e.target.value})} />
          <div className="p-4 bg-surface-container rounded-xl space-y-4">
             <h4 className="text-xs font-bold uppercase tracking-wider">Estructura Salarial</h4>
             <div className="grid grid-cols-2 gap-4">
                <Select label="Tipo de Pago" value={staffForm.paymentType} onChange={e => setStaffForm({...staffForm, paymentType: e.target.value as any})} options={[{value:'commission_only', label:'Solo Comisión'},{value:'fixed', label:'Sueldo Fijo'},{value:'hourly', label:'Por Hora'}]} />
                <Select label="Frecuencia" value={staffForm.frequency} onChange={e => setStaffForm({...staffForm, frequency: e.target.value as any})} options={[{value:'monthly', label:'Mensual'},{value:'biweekly', label:'Quincenal'}]} />
             </div>
             <div className="grid grid-cols-2 gap-4">
                <Input type="number" label="Sueldo Base (S/.)" value={staffForm.baseSalary} onChange={e => setStaffForm({...staffForm, baseSalary: Number(e.target.value)})} />
                <Input type="number" label="Comisión Base (%)" value={staffForm.commission_rate * 100} onChange={e => setStaffForm({...staffForm, commission_rate: Number(e.target.value)/100})} />
             </div>
          </div>
          <div className="flex justify-end gap-3 pt-4"><Button variant="ghost" type="button" onClick={() => setIsStaffModalOpen(false)}>Cancelar</Button><Button type="submit" variant="primary" disabled={isSaving}>Guardar</Button></div>
        </form>
      </Modal>

      <Modal open={isBedModalOpen} onClose={() => !isSaving && setIsBedModalOpen(false)} title={editingBed ? 'Editar Camilla' : 'Nueva Camilla'}>
        <form onSubmit={handleSaveBed} className="space-y-4">
          <Input required label="Identificador / Nombre" value={bedForm.name} onChange={e => setBedForm({...bedForm, name: e.target.value})} />
          <Input label="Notas de ubicación" value={bedForm.notes} onChange={e => setBedForm({...bedForm, notes: e.target.value})} />
          <div className="flex justify-end gap-3 pt-4"><Button variant="ghost" type="button" onClick={() => setIsBedModalOpen(false)}>Cancelar</Button><Button type="submit" variant="primary" disabled={isSaving}>Guardar</Button></div>
        </form>
      </Modal>

      <Modal open={isUserModalOpen} onClose={() => !isSaving && setIsUserModalOpen(false)} title="Editar Usuario y Rol">
        <form onSubmit={handleSaveUser} className="space-y-4">
          <Input label="Nombre a mostrar" value={userForm.display_name} onChange={e => setUserForm({...userForm, display_name: e.target.value})} />
          <Select 
            label="Rol del Sistema" 
            value={userForm.role} 
            onChange={e => setUserForm({...userForm, role: e.target.value as any})}
            options={[ { value: 'admin', label: 'Administrador (Acceso Total)' }, { value: 'staff', label: 'Staff (Agenda y POS)' } ]}
          />
          <div className="flex items-center gap-2 py-2">
            <input 
              type="checkbox" 
              id="user-active" 
              checked={userForm.active} 
              onChange={e => setUserForm({...userForm, active: e.target.checked})}
              className="w-4 h-4 rounded border-outline-variant/30 text-primary focus:ring-primary"
            />
            <label htmlFor="user-active" className="text-sm font-medium text-on-surface">Cuenta Activa</label>
          </div>
          <div className="flex justify-end gap-3 pt-4"><Button variant="ghost" type="button" onClick={() => setIsUserModalOpen(false)}>Cancelar</Button><Button type="submit" variant="primary" disabled={isSaving}>Guardar Cambios</Button></div>
        </form>
      </Modal>

    </div>
  );
}
