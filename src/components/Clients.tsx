import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button, Badge, Spinner, EmptyState, Card, Modal, Pagination } from './ui';
import { formatCurrency, formatDate } from '../lib/utils';
import { customersSvc, configSvc } from '../services/salon';
import type { Customer, SalonConfig } from '../types';
import ClientForm from './clients/ClientForm';
import ClientDetail from './clients/ClientDetail';
import Papa from 'papaparse';

// ─── CSV helpers ─────────────────────────────────────────────
const CSV_COLUMNS = [
  'nombre','apellido','telefono','whatsapp','email',
  'fecha_nacimiento','canal','frecuencia','tecnica_preferida',
  'alergias','notas_internas',
];

const VALID_CHANNELS = ['Instagram','Facebook','TikTok','Presencial','Recomendación','Otros'];
const VALID_FREQ     = ['Primera vez','Esporádico','Mensual','Quincenal','Semanal'];

const ALIASES: Record<string, string> = {
  nombre: 'nombre', name: 'nombre', 'primer_nombre': 'nombre',
  apellido: 'apellido', surnames: 'apellido', surname: 'apellido', apellidos: 'apellido',
  telefono: 'telefono', phone: 'telefono', celular: 'telefono', movil: 'telefono', 'nro_telefono': 'telefono',
  whatsapp: 'whatsapp', wsp: 'whatsapp',
  email: 'email', correo: 'email', 'correo_electronico': 'email',
  fecha_nacimiento: 'fecha_nacimiento', nacimiento: 'fecha_nacimiento', birthdate: 'fecha_nacimiento', cumpleanos: 'fecha_nacimiento',
  canal: 'canal', origen: 'canal', medio: 'canal', acquisition_channel: 'canal',
  frecuencia: 'frecuencia', frequency: 'frecuencia',
  tecnica_preferida: 'tecnica_preferida', preferred_technique: 'tecnica_preferida', tecnica: 'tecnica_preferida',
  alergias: 'alergias', allergies: 'alergias',
  notas_internas: 'notas_internas', internal_notes: 'notas_internas', notas: 'notas_internas', comentario: 'notas_internas', comentarios: 'notas_internas',
};

function normalizeRowKeys(row: Record<string, string>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, val] of Object.entries(row)) {
    const cleanKey = key
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // remove accents
      .trim()
      .replace(/[^a-z0-9_]/g, '_') // replace special chars
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');
    
    const mappedKey = ALIASES[cleanKey] || cleanKey;
    normalized[mappedKey] = val;
  }
  return normalized;
}

interface ImportRow {
  nombre: string; apellido: string; telefono: string; whatsapp: string;
  email: string; fecha_nacimiento: string; canal: string; frecuencia: string;
  tecnica_preferida: string; alergias: string; notas_internas: string;
  _errors: string[];
  isDuplicate?: boolean;
  duplicateReason?: string;
  selected?: boolean;
}

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

function validateRow(row: Record<string,string>): ImportRow {
  const norm = normalizeRowKeys(row);
  const errors: string[] = [];
  
  const nombre = (norm.nombre || '').trim();
  const telefono = (norm.telefono || '').trim();
  const canal = (norm.canal || '').trim();
  const frecuencia = (norm.frecuencia || '').trim();

  if (!nombre)   errors.push('Nombre requerido');
  if (!telefono) errors.push('Teléfono requerido');
  if (canal && !VALID_CHANNELS.includes(canal)) errors.push(`Canal inválido: ${canal}`);
  if (frecuencia && !VALID_FREQ.includes(frecuencia)) errors.push(`Frecuencia inválida: ${frecuencia}`);

  return {
    nombre,
    apellido: (norm.apellido || '').trim(),
    telefono,
    whatsapp: (norm.whatsapp || '').trim(),
    email: (norm.email || '').trim(),
    fecha_nacimiento: (norm.fecha_nacimiento || '').trim(),
    canal,
    frecuencia,
    tecnica_preferida: (norm.tecnica_preferida || '').trim(),
    alergias: (norm.alergias || '').trim(),
    notas_internas: (norm.notas_internas || '').trim(),
    _errors: errors
  };
}

type FilterTab = 'all' | 'recurring' | 'vip' | 'new';

const TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'recurring', label: 'Recurrentes' },
  { key: 'vip', label: 'VIP' },
  { key: 'new', label: 'Nuevos' },
];

export default function Clients() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [config, setConfig] = useState<SalonConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<FilterTab>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [showImport, setShowImport] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ok:number;fail:number}|null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const toggleRowSelected = (index: number) => {
    setImportRows(prev => prev.map((r, idx) => {
      if (idx === index) {
        if (r._errors.length > 0) return r; // Cannot select rows with errors
        return { ...r, selected: !r.selected };
      }
      return r;
    }));
  };

  const selectableRows = importRows.filter(r => r._errors.length === 0);
  const allSelected = selectableRows.length > 0 && selectableRows.every(r => r.selected);

  const toggleAllSelected = () => {
    const target = !allSelected;
    setImportRows(prev => prev.map(r => {
      if (r._errors.length > 0) return r; // cannot select rows with errors
      return { ...r, selected: target };
    }));
  };

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [custRes, configRes] = await Promise.all([
        customersSvc.getAll(),
        configSvc.get()
      ]);
      setCustomers(custRes.data || []);
      if (configRes.data) setConfig(configRes.data);
    } catch (error) {
      console.error('Error loading clients data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ─── Export CSV ──────────────────────────────────────────────
  const handleExport = () => {
    const rows = customers.map(c => ({
      nombre: c.first_name || c.name.split(' ')[0],
      apellido: c.last_name || c.name.split(' ').slice(1).join(' '),
      telefono: c.phone,
      whatsapp: c.whatsapp || '',
      email: c.email || '',
      fecha_nacimiento: c.birth_date || '',
      canal: c.acquisition_channel || '',
      frecuencia: c.frequency || '',
      tecnica_preferida: c.preferred_technique || '',
      alergias: c.allergies || '',
      notas_internas: c.internal_notes || '',
    }));
    const csv = Papa.unparse(rows.length > 0 ? rows : [Object.fromEntries(CSV_COLUMNS.map(k=>[k,'']))]);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clientes-estefany-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Import CSV ──────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse<Record<string,string>>(file, {
      header: true, skipEmptyLines: true,
      complete: (result) => {
        const rows = result.data.map(validateRow);
        const checkedRows = rows.map(r => {
          if (r._errors.length > 0) {
            return { ...r, isDuplicate: false, selected: false };
          }
          // check if phone or email matches existing customers
          const dupPhone = customers.find(c => c.phone && c.phone.trim() === r.telefono.trim());
          const dupEmail = r.email && customers.find(c => c.email && c.email.toLowerCase().trim() === r.email.toLowerCase().trim());
          
          if (dupPhone) {
            return {
              ...r,
              isDuplicate: true,
              duplicateReason: `Mismo teléfono: ${dupPhone.name}`,
              selected: false, // unselected by default for safety
            };
          }
          if (dupEmail) {
            return {
              ...r,
              isDuplicate: true,
              duplicateReason: `Mismo email: ${dupEmail.name}`,
              selected: false, // unselected by default for safety
            };
          }
          return { ...r, isDuplicate: false, selected: true }; // selected by default if valid & not duplicate
        });
        setImportRows(checkedRows);
        setImportResult(null);
        setShowImport(true);
      },
    });
    e.target.value = '';
  };

  const handleImportConfirm = async () => {
    const toImport = importRows.filter(r => r._errors.length === 0 && r.selected);
    if (toImport.length === 0) return;
    setImporting(true);
    let ok = 0; let fail = 0;
    for (const r of toImport) {
      const name = `${r.nombre} ${r.apellido}`.trim();
      const { error } = await customersSvc.create({
        first_name: r.nombre,
        last_name: r.apellido || '.',
        name,
        phone: r.telefono,
        whatsapp: r.whatsapp || undefined,
        email: r.email || undefined,
        birth_date: normalizeDateToISO(r.fecha_nacimiento),
        acquisition_channel: (VALID_CHANNELS.includes(r.canal) ? r.canal : undefined) as any,
        frequency: (VALID_FREQ.includes(r.frecuencia) ? r.frecuencia : undefined) as any,
        preferred_technique: r.tecnica_preferida || undefined,
        allergies: r.alergias || 'Ninguna',
        internal_notes: r.notas_internas || undefined,
        metrics: { totalAppointments:0, attendedAppointments:0, noShows:0, noShowRate:0, totalSpent:0, averageTicket:0 },
        is_recurring: false,
        active: true,
      } as any);
      error ? fail++ : ok++;
    }
    setImporting(false);
    setImportResult({ ok, fail });
    load();
  };

  // Filter logic
  const filtered = customers.filter(c => {
    const q = search.toLowerCase();
    const matchSearch = !q || c.name.toLowerCase().includes(q) || c.phone.includes(q) || (c.email || '').toLowerCase().includes(q);
    const matchTab =
      tab === 'all' ? true :
      tab === 'recurring' ? c.is_recurring :
      tab === 'vip' ? (c.metrics?.totalSpent || 0) > 500 :
      tab === 'new' ? c.frequency === 'Primera vez' : true;
    return matchSearch && matchTab;
  });

  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const paginated = filtered.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Reset page on search or tab change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, tab]);

  const totalSpent = customers.reduce((s, c) => s + (c.metrics?.totalSpent || 0), 0);
  const recurringCount = customers.filter(c => c.is_recurring).length;

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto bg-background">
      <div className="p-8 space-y-8 animate-fade-in select-none">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-4xl font-headline-md text-on-surface tracking-tight font-normal">Clientes</h1>
            <p className="text-sm text-on-surface-variant/60 font-medium mt-1.5">{customers.length} clientes registrados en cabina</p>
          </div>
          <div className="flex items-center gap-3.5 flex-wrap">
            {/* Hidden file input */}
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} id="csv-file-input" />
            <Button variant="ghost" size="sm" onClick={handleExport} id="export-csv-btn" title="Exportar como CSV (plantilla)" className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider py-3.5 px-6">
              <span className="material-symbols-outlined text-[16px] leading-none">download</span>
              <span>Exportar</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()} id="import-csv-btn" className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider py-3.5 px-6">
              <span className="material-symbols-outlined text-[16px] leading-none">upload</span>
              <span>Importar</span>
            </Button>
            <Button onClick={() => setShowCreate(true)} id="new-client-btn" className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider py-3.5 px-6">
              <span className="material-symbols-outlined text-[16px] leading-none">add</span>
              <span>Nuevo cliente</span>
            </Button>
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card padding="none" className="flex flex-col justify-center items-center py-7 bg-white border border-outline-variant/30 select-none">
            <p className="text-4xl font-headline-md text-on-surface leading-none">{customers.length}</p>
            <p className="text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-[0.2em] mt-3 font-sans">Total clientes</p>
          </Card>
          <Card padding="none" className="flex flex-col justify-center items-center py-7 bg-white border border-outline-variant/30 select-none">
            <p className="text-4xl font-headline-md text-on-surface leading-none">{recurringCount}</p>
            <p className="text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-[0.2em] mt-3 font-sans">Recurrentes</p>
          </Card>
          <Card padding="none" className="flex flex-col justify-center items-center py-7 bg-white border border-outline-variant/30 select-none">
            <p className="text-4xl font-headline-md text-on-surface leading-none">{formatCurrency(totalSpent)}</p>
            <p className="text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-[0.2em] mt-3 font-sans">Ingresos totales</p>
          </Card>
        </div>

        {/* Search + Tabs */}
        <div className="space-y-4">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-5 top-1/2 -translate-y-1/2 text-on-surface-variant/60 text-[20px] leading-none select-none">search</span>
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nombre, teléfono o correo..."
              className="w-full pl-13 pr-6 py-4 bg-white border border-outline-variant/30 rounded-full text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary focus:shadow-md transition-all duration-300 font-sans"
              id="client-search"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`px-5 py-2 text-xs font-bold rounded-full transition-all duration-300 cursor-pointer select-none font-sans
                  ${tab === t.key 
                    ? 'bg-primary text-white shadow-md shadow-primary/10' 
                    : 'bg-white border border-outline-variant/20 text-on-surface-variant/70 hover:border-outline-variant/60 hover:text-on-surface'
                  }`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Client list */}
        {loading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<span className="material-symbols-outlined text-[48px] text-outline/50">face_3</span>}
            title={search ? 'Sin resultados' : 'Sin clientes aún'}
            description={search ? 'Intenta con otro término de búsqueda.' : 'Registra tu primer cliente con el botón "Nuevo cliente".'}
            action={!search ? <Button onClick={() => setShowCreate(true)}>Registrar primer cliente</Button> : undefined}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {paginated.map(c => <ClientCard key={c.id} customer={c} onClick={() => setSelected(c)} />)}
          </div>
        )}

        {/* Pagination */}
        {!loading && filtered.length > itemsPerPage && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
          />
        )}
      </div>

      {/* Modals */}
      <ClientForm open={showCreate} onClose={() => setShowCreate(false)} onSaved={load} />
      <ClientDetail customer={selected} onClose={() => setSelected(null)} config={config} onUpdated={() => { load(); setSelected(null); }} />

      {/* Import Modal */}
      <Modal open={showImport} onClose={() => { setShowImport(false); setImportRows([]); setImportResult(null); }}
        title="Importar clientes desde CSV" size="xl"
        footer={
          <div className="flex items-center gap-3 w-full">
            {importResult && (
              <span className="text-xs text-on-surface-variant/60 flex-1 font-semibold">
                ✅ {importResult.ok} importados {importResult.fail > 0 ? `· ❌ ${importResult.fail} fallidos` : ''}
              </span>
            )}
            <div className="flex gap-2 ml-auto">
              <Button variant="ghost" onClick={() => { setShowImport(false); setImportRows([]); setImportResult(null); }}>Cerrar</Button>
              {!importResult && (
                <Button
                  loading={importing}
                  disabled={importRows.filter(r => r._errors.length === 0 && r.selected).length === 0}
                  onClick={handleImportConfirm}
                >
                  Importar {importRows.filter(r => r._errors.length === 0 && r.selected).length} seleccionados
                </Button>
              )}
            </div>
          </div>
        }
      >
        {importRows.length === 0 ? (
          <p className="text-sm text-on-surface-variant/60 text-center py-8">Sin filas para mostrar.</p>
        ) : (
          <div className="space-y-4 font-sans select-none">
            {/* Summary */}
            <div className="flex gap-4 text-xs font-bold px-2">
              <span className="flex items-center gap-1.5 text-secondary">
                <span className="material-symbols-outlined text-[16px] leading-none">check_circle</span>
                <span>{importRows.filter(r => r._errors.length === 0 && !r.isDuplicate).length} listos</span>
              </span>
              <span className="flex items-center gap-1.5 text-warning">
                <span className="material-symbols-outlined text-[16px] leading-none">warning</span>
                <span>{importRows.filter(r => r.isDuplicate).length} duplicados</span>
              </span>
              <span className="flex items-center gap-1.5 text-error">
                <span className="material-symbols-outlined text-[16px] leading-none">cancel</span>
                <span>{importRows.filter(r => r._errors.length > 0).length} con errores</span>
              </span>
            </div>
            {/* Table preview */}
            <div className="overflow-x-auto rounded-[1.5rem] border border-outline-variant/30 max-h-96">
              <table className="w-full text-xs">
                <thead className="bg-surface-container-low sticky top-0 border-b border-outline-variant/30 z-10">
                  <tr>
                    <th className="px-4 py-3.5 text-center w-12">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAllSelected}
                        disabled={selectableRows.length === 0}
                        className="w-4 h-4 rounded text-primary focus:ring-primary border-outline-variant cursor-pointer"
                        id="import-select-all"
                      />
                    </th>
                    <th className="px-4 py-3.5 text-left text-on-surface-variant font-bold uppercase tracking-wider">Estado</th>
                    <th className="px-4 py-3.5 text-left text-on-surface-variant font-bold uppercase tracking-wider">Nombre</th>
                    <th className="px-4 py-3.5 text-left text-on-surface-variant font-bold uppercase tracking-wider">Teléfono</th>
                    <th className="px-4 py-3.5 text-left text-on-surface-variant font-bold uppercase tracking-wider">Email</th>
                    <th className="px-4 py-3.5 text-left text-on-surface-variant font-bold uppercase tracking-wider">Canal</th>
                    <th className="px-4 py-3.5 text-left text-on-surface-variant font-bold uppercase tracking-wider">Errores</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/20 bg-white">
                  {importRows.map((row, i) => (
                    <tr key={i} className={row._errors.length > 0 ? 'bg-error-container/10' : row.isDuplicate ? 'bg-warning-container/5 hover:bg-warning-container/10 transition-colors' : 'bg-white hover:bg-surface-container-low/20 transition-colors'}>
                      <td className="px-4 py-3 text-center w-12">
                        <input
                          type="checkbox"
                          checked={!!row.selected}
                          onChange={() => toggleRowSelected(i)}
                          disabled={row._errors.length > 0}
                          className={`w-4 h-4 rounded focus:ring-primary border-outline-variant cursor-pointer
                            ${row._errors.length > 0 ? 'opacity-30 cursor-not-allowed' : 'text-primary'}`}
                          id={`import-checkbox-${i}`}
                        />
                      </td>
                      <td className="px-4 py-3 font-semibold">
                        {row._errors.length > 0 ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-error-container text-error border border-error/20">
                            Inválido
                          </span>
                        ) : row.isDuplicate ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300/30">
                            Duplicado
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300/30">
                            Listo
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-bold text-on-surface">{`${row.nombre} ${row.apellido}`.trim() || '—'}</p>
                        {row.isDuplicate && (
                          <p className="text-[10px] text-amber-700 font-semibold mt-0.5">{row.duplicateReason}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-on-surface-variant font-medium">{row.telefono || '—'}</td>
                      <td className="px-4 py-3 text-on-surface-variant">{row.email || '—'}</td>
                      <td className="px-4 py-3 text-on-surface-variant font-medium">{row.canal || '—'}</td>
                      <td className="px-4 py-3">
                        {row._errors.length > 0 && (
                          <span className="flex items-center gap-1 text-error font-medium">
                            <span className="material-symbols-outlined text-[12px] leading-none">error</span>
                            <span>{row._errors.join(', ')}</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-on-surface-variant/70 leading-relaxed bg-surface-container-low/40 p-4 rounded-2xl border border-outline-variant/20">
              💡 Las columnas requeridas son: <strong>nombre</strong> y <strong>telefono</strong>. Los clientes duplicados (por teléfono o email coincidente en la base de datos) vienen deseleccionados por defecto para evitar duplicaciones.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ─── Client Card ─────────────────────────────────────────────
function ClientCard({ customer: c, onClick }: { customer: Customer; onClick: () => void }) {
  const m = c.metrics;
  const isVIP = (m?.totalSpent || 0) > 500;
  const isBirthday = c.birth_date && new Date(c.birth_date).getMonth() === new Date().getMonth();
  
  const lastVisitDate = m?.lastVisit ? new Date(m.lastVisit) : null;
  const isInactive = lastVisitDate 
    ? (new Date().getTime() - lastVisitDate.getTime()) > 60 * 24 * 60 * 60 * 1000 
    : false;

  return (
    <div onClick={onClick}
      className="bg-white border border-outline-variant/30 rounded-[2rem] p-6 cursor-pointer shadow-[0_8px_30px_-6px_rgba(35,26,19,0.02)] hover:shadow-lg hover:border-primary active:scale-[0.99] transition-all duration-300 group select-none">
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div className="w-11 h-11 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0 font-bold text-sm shadow-inner group-hover:bg-primary group-hover:text-white transition-all duration-300 select-none">
          {c.name.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold text-on-surface group-hover:text-primary transition-colors leading-tight">{c.name}</p>
            {isBirthday && <span title="Cumpleaños este mes" className="text-xs">🎂</span>}
            {isVIP && <Badge variant="peach" className="text-[9px] uppercase tracking-wider py-0.5 px-2">VIP</Badge>}
            {c.is_recurring && <Badge variant="success" className="text-[9px] uppercase tracking-wider py-0.5 px-2">Recurrente</Badge>}
            {isInactive && (
              <Badge variant="peach" className="text-[9px] uppercase tracking-wider py-0.5 px-2 bg-rose-50 text-rose-600 border border-rose-100 font-extrabold flex items-center gap-0.5">
                Inactivo
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-2">
            <span className="material-symbols-outlined text-[14px] text-outline leading-none">phone</span>
            <p className="text-xs text-on-surface-variant font-medium">{c.phone}</p>
          </div>
          {c.frequency && (
            <p className="text-[10px] text-on-surface-variant/50 font-bold uppercase tracking-wider mt-2 bg-surface-container-low px-2 py-0.5 rounded-md inline-block">
              {c.frequency}
            </p>
          )}
        </div>
      </div>

      {/* Metrics footer */}
      <div className="grid grid-cols-3 gap-2 mt-5 pt-4 border-t border-outline-variant/20 select-none">
        <div className="text-center">
          <p className="text-sm font-bold text-on-surface">{m?.totalAppointments ?? 0}</p>
          <p className="text-[9px] text-on-surface-variant/50 font-bold uppercase tracking-wider mt-1 font-sans">Citas</p>
        </div>
        <div className="text-center">
          <p className="text-sm font-bold text-on-surface">{formatCurrency(m?.totalSpent ?? 0)}</p>
          <p className="text-[9px] text-on-surface-variant/50 font-bold uppercase tracking-wider mt-1 font-sans">Gastado</p>
        </div>
        <div className="text-center">
          <p className="text-sm font-bold text-on-surface">{m?.lastVisit ? formatDate(m.lastVisit, 'dd/MM') : '—'}</p>
          <p className="text-[9px] text-on-surface-variant/50 font-bold uppercase tracking-wider mt-1 font-sans">Últ. visita</p>
        </div>
      </div>
    </div>
  );
}
