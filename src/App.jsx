// Presupuesta+: presupuestos de obra con catálogo de precios por zona que se actualiza semana a semana.
// Todo se guarda en el celular y se sincroniza con la empresa (ver src/nube).
import { useEffect, useMemo, useState } from 'react';
import {
  Plus, Trash2, Pencil, FileText, Calculator, Tag, MapPin, TrendingUp, TrendingDown, Send, RefreshCw,
  Printer, CircleCheck, Ban, Undo2, Copy, ChevronRight, Layers, Building2, Download, Search,
} from 'lucide-react';
import {
  COLORS, FONT_SLAB, FONT_SANS, FONT_MONO, CARD_SHADOW, Sheet, Field, TextInput, Select, PrimaryButton,
  Header, EmptyState, FloatingAddButton, Note, EncabezadoReporte, FirmasReporte, KpiReporte,
} from './ui.jsx';
import { Logo, NombreMarca } from './Marca.jsx';
import { aplicarCambios } from './nube/fusion.js';
import {
  CATALOGO_ID, CATEGORIAS_INSUMO, esCotizacion, normalizarCatalogo, precioVigente, variacionPrecio, costoDirectoConcepto,
  calcularEjecucion, explosionInsumos, totalCotizacion, congelar, siguienteFolio, vence, isoDe, csvPresupuesto,
} from './cotizaciones/calculo.js';

const uid = () => Math.random().toString(36).slice(2, 10);
const hoy = () => isoDe(new Date());
const pesos = (v, d = 2) => `$${(parseFloat(v) || 0).toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d })}`;
const cant = (v, d = 2) => (parseFloat(v) || 0).toLocaleString('es-MX', { maximumFractionDigits: d });
const plural = (n, palabra) => `${n} ${palabra}${n === 1 ? '' : 's'}`;
const fechaLarga = (iso) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) : '—');

// Función y no constante: este módulo se carga antes de que App.jsx defina COLORS (se importan mutuamente).
const estadoDe = (k) => ({
  borrador: { texto: 'Borrador', color: COLORS.inkFaint },
  enviada: { texto: 'Enviada', color: COLORS.blueprint },
  aceptada: { texto: 'Aceptada', color: COLORS.good },
  rechazada: { texto: 'Rechazada', color: COLORS.bad },
}[k] || { texto: 'Borrador', color: COLORS.inkFaint });
const UNIDADES = ['m³', 'm²', 'ml', 'm', 'km', 'ha', 'pza', 'ton', 'kg', 'L', 'jor', 'hr', 'lote', 'plano', 'estudio', 'visita'];
const PARTIDAS = ['Preliminares', 'Terracerías', 'Cimentación', 'Estructura', 'Albañilería', 'Pavimentos', 'Drenaje', 'Instalaciones', 'Acabados', 'Señalamiento', 'Limpieza'];
function nuevoPresupuesto(registros) {
  return {
    id: uid(), tipo: 'cotizacion', clase: 'ejecucion', folio: siguienteFolio(registros), nombre: '', cliente: '', ubicacion: '', fecha: hoy(),
    vigenciaDias: 30, estado: 'borrador', ivaPct: 16, notas: '', lineas: [], zonaId: '', indirectosPct: 12, financiamientoPct: 1, utilidadPct: 10,
    anticipoPct: 30, plazoSemanas: 8, congelado: null,
  };
}

function descargar(nombre, contenido, tipo) {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const a = document.createElement('a');
  a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ============================= RAÍZ ============================= */

// nube: motor de sincronización de la empresa; la app trabaja sobre su copia local y él sube y baja cambios.
// cuenta: { empresa, email, solicitudes, aviso, onAbrir } para el chip de empresa y los PDFs.
export default function App({ nube, cuenta }) {
  const [registros, setRegistros] = useState([]);
  const [cargado, setCargado] = useState(false);
  const [sync, setSync] = useState(null);
  const [vista, setVista] = useState({ tipo: 'lista' });

  useEffect(() => {
    setRegistros(nube.lista());
    setSync(nube.estado);
    setCargado(true);
    return nube.suscribir((aviso) => {
      setSync(aviso.estado);
      if (aviso.actualizados.length || aviso.borrados.length) setRegistros((prev) => aplicarCambios(prev, aviso));
    });
  }, [nube]);
  useEffect(() => { if (cargado) nube.actualizar(registros); }, [registros, cargado, nube]);

  const guardado = registros.find((r) => r.id === CATALOGO_ID);
  const catalogo = useMemo(() => normalizarCatalogo(guardado), [guardado]);
  const presupuestos = registros.filter(esCotizacion);
  const guardar = (r) => setRegistros((prev) => (prev.some((p) => p.id === r.id) ? prev.map((p) => (p.id === r.id ? r : p)) : [...prev, r]));
  const borrar = (id) => setRegistros((prev) => prev.filter((p) => p.id !== id));

  if (!cargado) return <div className="min-h-screen flex items-center justify-center" style={{ background: COLORS.night }}><div className="animate-pulse"><Logo size={64} radio={18} /></div></div>;

  let pantalla;
  const actual = presupuestos.find((c) => c.id === vista.id);
  if (vista.tipo === 'catalogo') {
    pantalla = <CatalogoView catalogo={catalogo} onGuardar={guardar} onBack={() => setVista({ tipo: 'lista' })} />;
  } else if (vista.tipo === 'pdf' && actual) {
    pantalla = <CotizacionPDF cotizacion={actual} catalogo={catalogo} cuenta={cuenta} onBack={() => setVista({ tipo: 'editar', id: actual.id })} />;
  } else if (vista.tipo === 'editar' && actual) {
    pantalla = (
      <EditorPresupuesto cotizacion={actual} catalogo={catalogo} onGuardar={guardar} onBack={() => setVista({ tipo: 'lista' })} onPDF={() => setVista({ tipo: 'pdf', id: actual.id })}
        onIrCatalogo={() => setVista({ tipo: 'catalogo' })}
        onBorrar={() => { borrar(actual.id); setVista({ tipo: 'lista' }); }}
        onDuplicar={() => { const copia = { ...actual, id: uid(), folio: siguienteFolio(registros), estado: 'borrador', fecha: hoy(), congelado: null }; guardar(copia); setVista({ tipo: 'editar', id: copia.id }); }} />
    );
  } else {
    pantalla = (
      <Inicio presupuestos={presupuestos} catalogo={catalogo} cuenta={cuenta}
        onAbrir={(id) => setVista({ tipo: 'editar', id })} onCatalogo={() => setVista({ tipo: 'catalogo' })}
        onNuevo={() => { const c = nuevoPresupuesto(registros); guardar(c); setVista({ tipo: 'editar', id: c.id }); }} />
    );
  }
  return (
    <div className="min-h-screen app-raiz" style={{ background: COLORS.bg, fontFamily: FONT_SANS }}>
      <ChipCuenta cuenta={cuenta} sync={sync} />
      <div className="max-w-3xl mx-auto">{pantalla}</div>
    </div>
  );
}

function ChipCuenta({ cuenta, sync }) {
  if (!cuenta && !sync) return null;
  const color = cuenta?.aviso ? '#FF6B5E' : sync === 'sincronizado' ? '#3CCB9F' : sync === 'guardando' ? COLORS.hazard : COLORS.nightSoft;
  const texto = cuenta?.aviso || { sincronizado: 'Al día', guardando: 'Guardando...', 'solo lectura': 'Solo lectura' }[sync] || 'Sin conexión';
  return (
    <button onClick={cuenta?.onAbrir} className="fixed right-3 z-50 no-print pl-2.5 pr-3 py-1.5 rounded-full text-[11px] font-semibold flex items-center gap-2"
      style={{ top: 'calc(env(safe-area-inset-top) + 10px)', background: 'rgba(12,27,42,0.85)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', border: `1px solid ${COLORS.nightLine}`, color: COLORS.nightInk }}>
      <Building2 size={13} color={COLORS.accent} /><span className="max-w-[110px] truncate">{cuenta?.empresa}</span>
      <span style={{ width: 1, height: 12, background: COLORS.nightLine }} />
      {cuenta?.solicitudes > 0 && (
        <span className="absolute -top-1.5 -left-1.5 min-w-[20px] h-5 px-1 rounded-full text-[11px] font-bold flex items-center justify-center" style={{ background: COLORS.bad, color: '#fff', boxShadow: `0 0 0 2px ${COLORS.night}` }} aria-label={`${cuenta.solicitudes} solicitudes de entrada`}>{cuenta.solicitudes}</span>
      )}
      <span style={{ width: 7, height: 7, borderRadius: 4, background: color, boxShadow: `0 0 8px ${color}` }} />
      <span style={{ color }}>{texto}</span>
    </button>
  );
}

const FILTROS = [['todos', 'Todos'], ['borrador', 'Borrador'], ['enviada', 'Enviados'], ['aceptada', 'Aceptados'], ['rechazada', 'Rechazados']];

function Inicio({ presupuestos, catalogo, cuenta, onAbrir, onCatalogo, onNuevo }) {
  const [filtro, setFiltro] = useState('todos');
  const [busca, setBusca] = useState('');
  const total = (estado) => presupuestos.filter((c) => c.estado === estado).reduce((s, c) => s + totalCotizacion(c, catalogo), 0);
  const q = busca.trim().toLowerCase();
  const lista = presupuestos
    .filter((c) => filtro === 'todos' || c.estado === filtro)
    .filter((c) => !q || `${c.folio} ${c.nombre} ${c.cliente}`.toLowerCase().includes(q))
    .sort((a, b) => (a.folio < b.folio ? 1 : -1));
  const enviados = presupuestos.filter((c) => c.estado === 'enviada' || c.estado === 'aceptada' || c.estado === 'rechazada').length;
  const aceptados = presupuestos.filter((c) => c.estado === 'aceptada').length;
  return (
    <div className="pb-28">
      <div className="relative mb-4" style={{ background: COLORS.night }}>
        <div className="px-5 pb-6" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 52px)' }}>
          <div className="flex items-center gap-2.5 mb-5"><Logo size={34} radio={10} /><NombreMarca tamano={20} /></div>
          <p className="text-[12px] font-semibold" style={{ color: COLORS.nightSoft }}>{cuenta?.empresa}</p>
          <h1 className="text-[28px] font-bold leading-tight tracking-tight" style={{ fontFamily: FONT_SLAB, color: '#fff' }}>Tus presupuestos</h1>
          <div className="grid grid-cols-3 gap-2 mt-4">
            {[['Por cerrar', total('enviada')], ['Ganados', total('aceptada')], ['Cierre', enviados ? `${Math.round((aceptados / enviados) * 100)}%` : '—']].map(([k, v]) => (
              <div key={k} className="rounded-xl p-2.5" style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${COLORS.nightLine}` }}>
                <p className="text-[10px] uppercase tracking-[0.12em] font-semibold" style={{ color: COLORS.nightSoft }}>{k}</p>
                <p className="text-[16px] font-bold nums truncate" style={{ fontFamily: FONT_SLAB, color: '#fff' }}>{typeof v === 'number' ? pesos(v, 0) : v}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="absolute left-0 right-0 bottom-0" style={{ height: 4, background: 'linear-gradient(90deg, #00A67E 0%, #3CCB9F 55%, #FFC53D 100%)' }} />
      </div>

      <div className="px-4 space-y-3">
        <button onClick={onCatalogo} className="w-full rounded-2xl p-4 flex items-center gap-3 text-left" style={{ background: COLORS.paper, boxShadow: CARD_SHADOW }}>
          <div className="rounded-xl p-2.5" style={{ background: '#E8F7F2' }}><Tag size={20} color={COLORS.accent} /></div>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold" style={{ fontFamily: FONT_SLAB, color: COLORS.ink }}>Catálogo de precios</p>
            <p className="text-[12px]" style={{ color: COLORS.inkSoft }}>{plural(catalogo.insumos.length, 'insumo')} · {plural(catalogo.conceptos.length, 'concepto')} · {plural(catalogo.zonas.length, 'zona')}</p>
          </div>
          <ChevronRight size={18} color={COLORS.inkFaint} />
        </button>

        {presupuestos.length > 0 && (
          <>
            <div className="relative">
              <Search size={16} color={COLORS.inkFaint} className="absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por folio, obra o cliente"
                className="w-full pl-10 pr-3.5 py-3 rounded-xl text-[14px] outline-none" style={{ background: COLORS.paper, border: `1.5px solid ${COLORS.line}`, color: COLORS.ink }} />
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {FILTROS.map(([k, t]) => (
                <button key={k} onClick={() => setFiltro(k)} className="shrink-0 px-3 py-1.5 rounded-full text-[12.5px] font-bold"
                  style={{ background: filtro === k ? COLORS.night : COLORS.paper, color: filtro === k ? '#fff' : COLORS.inkSoft, border: `1px solid ${filtro === k ? COLORS.night : COLORS.line}` }}>{t}</button>
              ))}
            </div>
          </>
        )}

        {lista.map((c) => {
          const e = estadoDe(c.estado);
          return (
            <button key={c.id} onClick={() => onAbrir(c.id)} className="w-full rounded-2xl p-4 text-left" style={{ background: COLORS.paper, boxShadow: CARD_SHADOW }}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold" style={{ fontFamily: FONT_MONO, color: COLORS.accent }}>{c.folio}</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: e.color, color: '#fff' }}>{e.texto}</span>
              </div>
              <p className="text-[17px] font-bold leading-tight tracking-tight mt-1 truncate" style={{ fontFamily: FONT_SLAB, color: COLORS.ink }}>{c.nombre || 'Sin nombre'}</p>
              <div className="flex items-end justify-between gap-2 mt-1">
                <p className="text-[12px] truncate" style={{ color: COLORS.inkSoft }}>{c.cliente || 'Sin cliente'} · {fechaLarga(c.fecha)}</p>
                <p className="text-[15px] font-bold nums shrink-0" style={{ fontFamily: FONT_MONO, color: COLORS.ink }}>{pesos(totalCotizacion(c, catalogo), 0)}</p>
              </div>
            </button>
          );
        })}
        {presupuestos.length === 0 && (
          <EmptyState icon={Calculator} text={catalogo.conceptos.length ? 'Crea tu primer presupuesto: elige conceptos del catálogo y pon el volumen.' : 'Empieza cargando tus insumos con precio en el catálogo; después armas conceptos y presupuestos.'} />
        )}
        {presupuestos.length > 0 && lista.length === 0 && <p className="text-sm text-center py-8" style={{ color: COLORS.inkFaint }}>Nada con ese filtro.</p>}
      </div>
      <FloatingAddButton onClick={onNuevo} label="Nuevo presupuesto" />
    </div>
  );
}

/* ============================= PIEZAS ============================= */

function Tarjeta({ titulo, children, derecha }) {
  return (
    <div className="rounded-2xl p-4 mb-3" style={{ background: COLORS.paper, boxShadow: CARD_SHADOW }}>
      {titulo && (
        <div className="flex items-center justify-between mb-3 gap-2">
          <p className="text-[15px] font-bold tracking-tight" style={{ fontFamily: FONT_SLAB, color: COLORS.ink }}>{titulo}</p>
          {derecha}
        </div>
      )}
      {children}
    </div>
  );
}

function Fila({ label, valor, fuerte, color }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className={`text-[13px] ${fuerte ? 'font-bold' : ''}`} style={{ color: fuerte ? COLORS.ink : COLORS.inkSoft }}>{label}</span>
      <span className={`nums ${fuerte ? 'text-[17px] font-bold' : 'text-[13px] font-semibold'}`} style={{ fontFamily: FONT_MONO, color: color || COLORS.ink }}>{valor}</span>
    </div>
  );
}

function Num({ value, onChange, disabled, step = '0.01', ...rest }) {
  return <TextInput type="number" inputMode="decimal" step={step} value={value ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value)} {...rest} />;
}

function DatosGenerales({ c, set, bloqueada, extra }) {
  return (
    <Tarjeta titulo="Datos">
      <Field label="Nombre de la obra"><TextInput value={c.nombre} disabled={bloqueada} onChange={(e) => set({ nombre: e.target.value })} placeholder="Ej. Casa habitación Lomas" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Cliente"><TextInput value={c.cliente} disabled={bloqueada} onChange={(e) => set({ cliente: e.target.value })} /></Field>
        <Field label="Ubicación"><TextInput value={c.ubicacion} disabled={bloqueada} onChange={(e) => set({ ubicacion: e.target.value })} /></Field>
        <Field label="Fecha"><TextInput type="date" value={c.fecha} disabled={bloqueada} onChange={(e) => set({ fecha: e.target.value })} /></Field>
        <Field label="Vigencia (días)"><Num step="1" value={c.vigenciaDias} disabled={bloqueada} onChange={(v) => set({ vigenciaDias: v })} /></Field>
        <Field label="Plazo (semanas)"><Num step="1" value={c.plazoSemanas} disabled={bloqueada} onChange={(v) => set({ plazoSemanas: v })} /></Field>
        <Field label="Anticipo %"><Num step="1" value={c.anticipoPct} disabled={bloqueada} onChange={(v) => set({ anticipoPct: v })} /></Field>
      </div>
      {extra}
    </Tarjeta>
  );
}

// Flujo de estados: borrador → enviada (congela precios) → aceptada / rechazada.
function BarraEstado({ c, onCambiar, onPDF, onDuplicar, onBorrar, onExcel }) {
  const e = estadoDe(c.estado);
  const boton = (texto, Icon, onClick, fondo = COLORS.paperAlt, color = COLORS.ink) => (
    <button onClick={onClick} className="py-2.5 rounded-xl text-[13px] font-bold flex items-center justify-center gap-1.5" style={{ background: fondo, color }}><Icon size={15} />{texto}</button>
  );
  return (
    <Tarjeta titulo="Estado" derecha={<span className="text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ background: e.color, color: '#fff' }}>{e.texto}</span>}>
      <div className="grid grid-cols-2 gap-2">
        {c.estado === 'borrador' && boton('Marcar enviada', Send, () => onCambiar('enviada'), COLORS.blueprint, '#fff')}
        {c.estado === 'enviada' && boton('Aceptada', CircleCheck, () => onCambiar('aceptada'), COLORS.good, '#fff')}
        {c.estado === 'enviada' && boton('Rechazada', Ban, () => onCambiar('rechazada'), '#FDECEA', COLORS.bad)}
        {c.estado !== 'borrador' && boton('Volver a borrador', Undo2, () => onCambiar('borrador'))}
        {boton('Ver PDF', Printer, onPDF, COLORS.orange, '#fff')}
        {boton('Excel', Download, onExcel)}
        {boton('Duplicar', Copy, onDuplicar)}
      </div>
      {c.estado === 'borrador' && <BorrarConfirmado onBorrar={onBorrar} />}
    </Tarjeta>
  );
}

function BorrarConfirmado({ onBorrar, texto = 'Eliminar presupuesto' }) {
  const [seguro, setSeguro] = useState(false);
  return seguro
    ? <div className="mt-3 grid grid-cols-2 gap-2"><button onClick={() => setSeguro(false)} className="py-2.5 rounded-xl text-[13px] font-bold" style={{ background: COLORS.paperAlt }}>Cancelar</button><button onClick={onBorrar} className="py-2.5 rounded-xl text-[13px] font-bold" style={{ background: COLORS.bad, color: '#fff' }}>Sí, eliminar</button></div>
    : <button onClick={() => setSeguro(true)} className="mt-3 w-full py-2 text-[12px] font-semibold flex items-center justify-center gap-1.5" style={{ color: COLORS.bad }}><Trash2 size={13} />{texto}</button>;
}

/* ============================= PRESUPUESTO ============================= */

function EditorPresupuesto({ cotizacion: c, catalogo, onGuardar, onBack, onPDF, onBorrar, onDuplicar, onIrCatalogo }) {
  const [editando, setEditando] = useState(null);
  const [verExplosion, setVerExplosion] = useState(false);
  const bloqueada = c.estado !== 'borrador';
  const set = (cambios) => onGuardar({ ...c, ...cambios });
  const r = calcularEjecucion(c, catalogo);
  const vivo = c.congelado ? calcularEjecucion(c, catalogo, { enVivo: true }) : null;
  const cambioPct = vivo && r.total > 0 ? ((vivo.total - r.total) / r.total) * 100 : 0;
  const zona = catalogo.zonas.find((z) => z.id === c.zonaId);
  const cambiarEstado = (estado) => {
    if (estado === 'enviada') onGuardar({ ...congelar(c, catalogo, hoy()), estado });
    else if (estado === 'borrador') onGuardar({ ...c, estado, congelado: null });
    else set({ estado });
  };
  const guardarLinea = (l) => { set({ lineas: l.id && c.lineas.some((x) => x.id === l.id) ? c.lineas.map((x) => (x.id === l.id ? l : x)) : [...c.lineas, { ...l, id: uid() }] }); setEditando(null); };
  const explosion = verExplosion ? explosionInsumos(c, catalogo) : [];
  return (
    <div className="pb-28">
      <Header title={c.nombre || 'Presupuesto sin nombre'} subtitle={c.folio} onBack={onBack} />
      <div className="px-5">
        <div className="rounded-2xl p-4 mb-3" style={{ background: COLORS.night }}>
          <p className="text-[10px] uppercase tracking-[0.16em] font-semibold" style={{ color: COLORS.nightSoft }}>Total con IVA</p>
          <p className="text-[34px] font-bold leading-none mt-1 nums" style={{ fontFamily: FONT_SLAB, color: '#fff' }}>{pesos(r.total)}</p>
          <p className="text-[12px] mt-1.5" style={{ color: COLORS.nightSoft }}>{c.lineas.length} concepto{c.lineas.length === 1 ? '' : 's'} · {zona ? zona.nombre : 'Precio general'}{c.congelado ? ` · precios del ${fechaLarga(c.congelado.fecha)}` : ' · precios de hoy'}</p>
          {vivo && Math.abs(cambioPct) >= 0.05 && (
            <div className="mt-3 rounded-xl p-3 flex items-center gap-2" style={{ background: cambioPct > 0 ? 'rgba(210,55,42,0.18)' : 'rgba(19,138,75,0.2)' }}>
              {cambioPct > 0 ? <TrendingUp size={18} color="#FF8A7E" /> : <TrendingDown size={18} color="#5BE39A" />}
              <p className="text-[12.5px] flex-1" style={{ color: '#fff' }}>Con los precios de hoy saldría en <b>{pesos(vivo.total, 0)}</b> ({cambioPct > 0 ? '+' : ''}{cant(cambioPct, 1)}%).</p>
            </div>
          )}
        </div>

        <BarraEstado c={c} onCambiar={cambiarEstado} onPDF={onPDF} onDuplicar={onDuplicar} onBorrar={onBorrar} onExcel={() => descargar(`${c.folio} ${c.nombre || 'presupuesto'}.csv`, csvPresupuesto(c, catalogo), 'text/csv;charset=utf-8')} />
        <DatosGenerales c={c} set={set} bloqueada={bloqueada} extra={(
          <Field label="Zona de precios">
            <Select value={c.zonaId} disabled={bloqueada} onChange={(e) => set({ zonaId: e.target.value })}>
              <option value="">Precio general</option>
              {catalogo.zonas.map((z) => <option key={z.id} value={z.id}>{z.nombre}</option>)}
            </Select>
          </Field>
        )} />

        <Tarjeta titulo="Conceptos" derecha={!bloqueada && <button onClick={() => setEditando({})} className="text-[13px] font-bold flex items-center gap-1" style={{ color: COLORS.orange }}><Plus size={15} />Agregar</button>}>
          {catalogo.conceptos.length === 0 && (
            <button onClick={onIrCatalogo} className="w-full mb-2"><Note>Tu catálogo aún no tiene conceptos. Toca aquí para cargar insumos y armar conceptos; también puedes agregar conceptos con costo manual.</Note></button>
          )}
          {r.partidas.map((g) => (
            <div key={g.partida} className="mb-2">
              <div className="flex items-center justify-between py-1.5">
                <span className="text-[11px] uppercase tracking-[0.12em] font-bold" style={{ color: COLORS.blueprint }}>{g.partida}</span>
                <span className="text-[12px] font-bold nums" style={{ fontFamily: FONT_MONO, color: COLORS.blueprint }}>{pesos(g.importe, 0)}</span>
              </div>
              {g.lineas.map((l) => (
                <button key={l.id} disabled={bloqueada} onClick={() => setEditando(l)} className="w-full text-left py-2 border-b flex items-start justify-between gap-3" style={{ borderColor: COLORS.line }}>
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-semibold" style={{ color: COLORS.ink }}><span style={{ fontFamily: FONT_MONO, color: COLORS.orange, fontSize: 11 }}>{l.clave}</span> {l.descripcion}</p>
                    <p className="text-[12px] nums" style={{ color: COLORS.inkSoft }}>{cant(l.cantidad)} {l.unidad} × {pesos(l.pu)}{l.puManual != null && l.puManual !== '' ? ' · manual' : ''}</p>
                  </div>
                  <span className="text-[13.5px] font-bold nums shrink-0" style={{ fontFamily: FONT_MONO }}>{pesos(l.importe, 0)}</span>
                </button>
              ))}
            </div>
          ))}
          {c.lineas.length === 0 && <p className="text-[13px]" style={{ color: COLORS.inkFaint }}>Agrega conceptos y su volumen de obra.</p>}
        </Tarjeta>

        <Tarjeta titulo="Sobrecosto">
          <div className="grid grid-cols-2 gap-x-3">
            <Field label="Indirectos %"><Num step="0.5" value={c.indirectosPct} disabled={bloqueada} onChange={(v) => set({ indirectosPct: v })} /></Field>
            <Field label="Financiamiento %"><Num step="0.5" value={c.financiamientoPct} disabled={bloqueada} onChange={(v) => set({ financiamientoPct: v })} /></Field>
            <Field label="Utilidad %"><Num step="0.5" value={c.utilidadPct} disabled={bloqueada} onChange={(v) => set({ utilidadPct: v })} /></Field>
            <Field label="IVA %"><Num step="1" value={c.ivaPct} disabled={bloqueada} onChange={(v) => set({ ivaPct: v })} /></Field>
          </div>
          <Fila label="Costo directo" valor={pesos(r.costoDirecto)} />
          <Fila label="Indirectos" valor={pesos(r.indirectos)} />
          <Fila label="Financiamiento" valor={pesos(r.financiamiento)} />
          <Fila label="Utilidad" valor={pesos(r.utilidad)} color={COLORS.good} />
          <Fila label="Subtotal" valor={pesos(r.subtotal)} fuerte />
          <Fila label={`IVA ${cant(c.ivaPct)}%`} valor={pesos(r.iva)} />
          <Fila label="Total" valor={pesos(r.total)} fuerte color={COLORS.orange} />
          <Fila label={`Anticipo ${cant(c.anticipoPct)}%`} valor={pesos(r.anticipo)} />
          <p className="text-[11px] mt-2" style={{ color: COLORS.inkFaint }}>Factor de sobrecosto {cant(r.factor, 4)} sobre el costo directo de cada concepto.</p>
        </Tarjeta>

        <Tarjeta titulo="Explosión de insumos" derecha={<button onClick={() => setVerExplosion(!verExplosion)} className="text-[13px] font-bold" style={{ color: COLORS.orange }}>{verExplosion ? 'Ocultar' : 'Ver'}</button>}>
          {!verExplosion && <p className="text-[12.5px]" style={{ color: COLORS.inkSoft }}>Cuánto material, mano de obra y equipo pide esta obra y cuánto cuesta cada uno.</p>}
          {verExplosion && explosion.length === 0 && <p className="text-[13px]" style={{ color: COLORS.inkFaint }}>Ningún concepto tiene matriz de insumos.</p>}
          {explosion.map((x) => (
            <div key={x.insumo.id} className="flex items-start justify-between gap-3 py-1.5 border-b last:border-0" style={{ borderColor: COLORS.line }}>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold" style={{ color: COLORS.ink }}>{x.insumo.descripcion}</p>
                <p className="text-[11.5px] nums" style={{ color: COLORS.inkSoft }}>{cant(x.cantidad, 3)} {x.insumo.unidad} × {pesos(x.precio)} · {CATEGORIAS_INSUMO[x.insumo.categoria] || 'Material'}</p>
              </div>
              <span className="text-[13px] font-bold nums shrink-0" style={{ fontFamily: FONT_MONO }}>{pesos(x.importe, 0)}</span>
            </div>
          ))}
        </Tarjeta>

        <Tarjeta titulo="Notas">
          <textarea value={c.notas} disabled={bloqueada} onChange={(e) => set({ notas: e.target.value })} rows={3} placeholder="Ej. No incluye permisos ni acometidas" className="w-full px-3.5 py-3 rounded-xl text-[15px] outline-none" style={{ background: COLORS.paperAlt, border: `1px solid ${COLORS.line}` }} />
        </Tarjeta>
      </div>
      {editando && <LineaSheet linea={editando} catalogo={catalogo} zonaId={c.zonaId} onClose={() => setEditando(null)} onSave={guardarLinea}
        onBorrar={editando.id ? () => { set({ lineas: c.lineas.filter((x) => x.id !== editando.id) }); setEditando(null); } : null} />}
    </div>
  );
}

function LineaSheet({ linea, catalogo, zonaId, onClose, onSave, onBorrar }) {
  const [l, setL] = useState({ conceptoId: '', clave: '', descripcion: '', unidad: 'm³', partida: '', cantidad: '', puManual: '', ...linea });
  const concepto = catalogo.conceptos.find((c) => c.id === l.conceptoId);
  const cd = concepto ? costoDirectoConcepto(concepto, catalogo, zonaId) : null;
  const elegir = (id) => {
    const k = catalogo.conceptos.find((c) => c.id === id);
    setL(k ? { ...l, conceptoId: k.id, clave: k.clave, descripcion: k.descripcion, unidad: k.unidad, partida: k.partida || '', puManual: '' } : { ...l, conceptoId: '' });
  };
  const valido = l.descripcion.trim() && l.cantidad !== '' && (l.conceptoId || l.puManual !== '');
  return (
    <Sheet title={linea.id ? 'Editar concepto' : 'Agregar concepto'} onClose={onClose}>
      <Field label="Del catálogo">
        <Select value={l.conceptoId} onChange={(e) => elegir(e.target.value)}>
          <option value="">— Concepto manual —</option>
          {catalogo.conceptos.map((c) => <option key={c.id} value={c.id}>{c.clave} · {c.descripcion}</option>)}
        </Select>
      </Field>
      {!l.conceptoId && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Clave"><TextInput value={l.clave} onChange={(e) => setL({ ...l, clave: e.target.value })} /></Field>
            <div className="col-span-2"><Field label="Partida"><Select value={l.partida} onChange={(e) => setL({ ...l, partida: e.target.value })}><option value="">Sin partida</option>{PARTIDAS.map((p) => <option key={p}>{p}</option>)}</Select></Field></div>
          </div>
          <Field label="Descripción"><TextInput value={l.descripcion} onChange={(e) => setL({ ...l, descripcion: e.target.value })} /></Field>
        </>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Volumen (${l.unidad})`}><Num value={l.cantidad} onChange={(v) => setL({ ...l, cantidad: v })} placeholder="Ej. 120" autoFocus={!!linea.id} /></Field>
        {l.conceptoId
          ? <Field label="Costo directo"><div className="px-3.5 py-3 rounded-xl text-[15px] font-bold nums" style={{ background: COLORS.paperAlt, fontFamily: FONT_MONO }}>{pesos(cd?.total)}</div></Field>
          : <Field label={`Costo directo $/${l.unidad}`}><Num value={l.puManual} onChange={(v) => setL({ ...l, puManual: v })} /></Field>}
      </div>
      {!l.conceptoId && <Field label="Unidad"><Select value={l.unidad} onChange={(e) => setL({ ...l, unidad: e.target.value })}>{UNIDADES.map((u) => <option key={u}>{u}</option>)}</Select></Field>}
      {cd?.faltantes.length > 0 && <Note>Sin precio en esta zona: {cd.faltantes.join(', ')}.</Note>}
      <PrimaryButton disabled={!valido} onClick={() => valido && onSave(l)}>Guardar</PrimaryButton>
      {onBorrar && <BorrarConfirmado onBorrar={onBorrar} texto="Quitar del presupuesto" />}
    </Sheet>
  );
}

/* ============================= CATÁLOGO DE PRECIOS ============================= */

function CatalogoView({ catalogo, onGuardar, onBack }) {
  const [pestana, setPestana] = useState('insumos');
  const [zonaId, setZonaId] = useState(catalogo.zonas[0]?.id || '');
  const [editando, setEditando] = useState(null);
  const [semanal, setSemanal] = useState(false);
  const set = (cambios) => onGuardar({ ...catalogo, ...cambios });
  const upsert = (lista, item) => (item.id && lista.some((x) => x.id === item.id) ? lista.map((x) => (x.id === item.id ? item : x)) : [...lista, { ...item, id: item.id || uid() }]);
  const zona = catalogo.zonas.find((z) => z.id === zonaId);

  if (semanal) return <PreciosSemana catalogo={catalogo} zonaId={zonaId} onBack={() => setSemanal(false)} onGuardar={(insumos) => { set({ insumos }); setSemanal(false); }} />;

  return (
    <div className="pb-28">
      <Header title="Catálogo de precios" subtitle="Precios por zona" onBack={onBack} />
      <div className="px-5">
        <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
          {[['', 'General'], ...catalogo.zonas.map((z) => [z.id, z.nombre])].map(([id, nombre]) => (
            <button key={id || 'general'} onClick={() => setZonaId(id)} className="shrink-0 px-3 py-1.5 rounded-full text-[12.5px] font-bold flex items-center gap-1"
              style={{ background: zonaId === id ? COLORS.night : COLORS.paper, color: zonaId === id ? '#fff' : COLORS.inkSoft, border: `1px solid ${zonaId === id ? COLORS.night : COLORS.line}` }}><MapPin size={12} />{nombre}</button>
          ))}
          <button onClick={() => setEditando({ tipo: 'zona', item: {} })} className="shrink-0 px-3 py-1.5 rounded-full text-[12.5px] font-bold flex items-center gap-1" style={{ color: COLORS.orange, border: `1px dashed ${COLORS.orange}` }}><Plus size={12} />Zona</button>
        </div>
        <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl mb-3" style={{ background: COLORS.paperAlt, border: `1px solid ${COLORS.line}` }}>
          {[['insumos', 'Insumos'], ['conceptos', 'Conceptos'], ['zonas', 'Zonas']].map(([k, t]) => (
            <button key={k} onClick={() => setPestana(k)} className="py-2 rounded-xl text-[13px] font-bold" style={{ background: pestana === k ? COLORS.night : 'transparent', color: pestana === k ? '#fff' : COLORS.inkSoft }}>{t}</button>
          ))}
        </div>

        {pestana === 'insumos' && (
          <>
            {catalogo.insumos.length > 0 && (
              <button onClick={() => setSemanal(true)} className="w-full mb-3 py-3 rounded-xl text-[14px] font-bold flex items-center justify-center gap-2" style={{ background: COLORS.orange, color: '#fff' }}>
                <RefreshCw size={16} />Actualizar precios de la semana · {zona?.nombre || 'General'}
              </button>
            )}
            {catalogo.insumos.map((i) => {
              const v = variacionPrecio(i, zonaId);
              const deOtraZona = v && zonaId && v.actual.zonaId !== zonaId;
              return (
                <button key={i.id} onClick={() => setEditando({ tipo: 'insumo', item: i })} className="w-full rounded-xl p-3 mb-2 text-left flex items-center justify-between gap-3" style={{ background: COLORS.paper, boxShadow: CARD_SHADOW }}>
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold truncate" style={{ color: COLORS.ink }}><span style={{ fontFamily: FONT_MONO, color: COLORS.orange, fontSize: 11 }}>{i.clave}</span> {i.descripcion}</p>
                    <p className="text-[11.5px]" style={{ color: COLORS.inkFaint }}>{CATEGORIAS_INSUMO[i.categoria] || 'Material'} · {v ? `${deOtraZona ? 'general · ' : ''}${fechaLarga(v.actual.fecha)}` : 'sin precio'}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[14px] font-bold nums" style={{ fontFamily: FONT_MONO, color: COLORS.ink }}>{v ? pesos(v.actual.precio) : '—'}<span className="text-[10px] font-normal" style={{ color: COLORS.inkFaint }}>/{i.unidad}</span></p>
                    {v?.pct != null && Math.abs(v.pct) >= 0.05 && <p className="text-[11px] font-bold nums" style={{ color: v.pct > 0 ? COLORS.bad : COLORS.good }}>{v.pct > 0 ? '▲' : '▼'} {cant(Math.abs(v.pct), 1)}%</p>}
                  </div>
                </button>
              );
            })}
            {catalogo.insumos.length === 0 && <EmptyState icon={Tag} text="Carga materiales, mano de obra y equipo con su precio. Después armas los conceptos con ellos." />}
          </>
        )}

        {pestana === 'conceptos' && (
          <>
            {catalogo.conceptos.map((k) => {
              const cd = costoDirectoConcepto(k, catalogo, zonaId);
              return (
                <button key={k.id} onClick={() => setEditando({ tipo: 'concepto', item: k })} className="w-full rounded-xl p-3 mb-2 text-left flex items-center justify-between gap-3" style={{ background: COLORS.paper, boxShadow: CARD_SHADOW }}>
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold" style={{ color: COLORS.ink }}><span style={{ fontFamily: FONT_MONO, color: COLORS.orange, fontSize: 11 }}>{k.clave}</span> {k.descripcion}</p>
                    <p className="text-[11.5px]" style={{ color: COLORS.inkFaint }}>{k.partida || 'Sin partida'} · {(k.matriz || []).length} insumos{cd.faltantes.length ? ` · ${cd.faltantes.length} sin precio` : ''}</p>
                  </div>
                  <p className="text-[14px] font-bold nums shrink-0" style={{ fontFamily: FONT_MONO, color: COLORS.ink }}>{pesos(cd.total)}<span className="text-[10px] font-normal" style={{ color: COLORS.inkFaint }}>/{k.unidad}</span></p>
                </button>
              );
            })}
            {catalogo.conceptos.length === 0 && <EmptyState icon={Layers} text={catalogo.insumos.length ? 'Arma tu primer concepto: elige los insumos y cuánto lleva de cada uno por unidad.' : 'Primero carga insumos con precio.'} />}
            <p className="text-[11px] text-center mt-2" style={{ color: COLORS.inkFaint }}>Costo directo en {zona?.nombre || 'precio general'}. Cambia de zona arriba para comparar.</p>
          </>
        )}

        {pestana === 'zonas' && (
          <>
            <Note>Una zona es una región con precios propios (ej. Acapulco, Chilpancingo). Si un insumo no tiene precio en la zona, se usa el general.</Note>
            {catalogo.zonas.map((z) => (
              <button key={z.id} onClick={() => setEditando({ tipo: 'zona', item: z })} className="w-full rounded-xl p-3 mt-2 text-left flex items-center justify-between" style={{ background: COLORS.paper, boxShadow: CARD_SHADOW }}>
                <span className="text-[14px] font-semibold flex items-center gap-2"><MapPin size={15} color={COLORS.orange} />{z.nombre}</span>
                <Pencil size={14} color={COLORS.inkFaint} />
              </button>
            ))}
          </>
        )}
      </div>
      {pestana !== 'zonas' && <FloatingAddButton onClick={() => setEditando({ tipo: pestana === 'insumos' ? 'insumo' : 'concepto', item: {} })} label={pestana === 'insumos' ? 'Insumo' : 'Concepto'} />}

      {editando?.tipo === 'zona' && (
        <ZonaSheet zona={editando.item} onClose={() => setEditando(null)}
          onSave={(z) => { const id = z.id || uid(); set({ zonas: upsert(catalogo.zonas, { ...z, id }) }); setZonaId(id); setEditando(null); }}
          onBorrar={editando.item.id ? () => { set({ zonas: catalogo.zonas.filter((x) => x.id !== editando.item.id) }); setZonaId(''); setEditando(null); } : null} />
      )}
      {editando?.tipo === 'insumo' && (
        <InsumoSheet insumo={editando.item} zonas={catalogo.zonas} zonaId={zonaId} onClose={() => setEditando(null)}
          onSave={(i) => { set({ insumos: upsert(catalogo.insumos, i) }); setEditando(null); }}
          onBorrar={editando.item.id && !catalogo.conceptos.some((k) => (k.matriz || []).some((m) => m.insumoId === editando.item.id)) ? () => { set({ insumos: catalogo.insumos.filter((x) => x.id !== editando.item.id) }); setEditando(null); } : null} />
      )}
      {editando?.tipo === 'concepto' && (
        <ConceptoCatalogoSheet concepto={editando.item} catalogo={catalogo} zonaId={zonaId} onClose={() => setEditando(null)}
          onSave={(k) => { set({ conceptos: upsert(catalogo.conceptos, k) }); setEditando(null); }}
          onBorrar={editando.item.id ? () => { set({ conceptos: catalogo.conceptos.filter((x) => x.id !== editando.item.id) }); setEditando(null); } : null} />
      )}
    </div>
  );
}

// Captura rápida: todos los insumos en una lista, solo escribes el precio nuevo de esta semana.
function PreciosSemana({ catalogo, zonaId, onBack, onGuardar }) {
  const [fecha, setFecha] = useState(hoy());
  const [nuevos, setNuevos] = useState({});
  const zona = catalogo.zonas.find((z) => z.id === zonaId);
  const cambios = Object.entries(nuevos).filter(([, v]) => v !== '' && parseFloat(v) > 0);
  const guardar = () => {
    const mapa = Object.fromEntries(cambios);
    onGuardar(catalogo.insumos.map((i) => (mapa[i.id] == null ? i : { ...i, precios: [...(i.precios || []).filter((p) => !((p.zonaId || '') === zonaId && p.fecha === fecha)), { id: uid(), zonaId, fecha, precio: parseFloat(mapa[i.id]) }] })));
  };
  return (
    <div className="pb-28">
      <Header title="Precios de la semana" subtitle={zona?.nombre || 'General'} onBack={onBack} />
      <div className="px-5">
        <Field label="Fecha de los precios"><TextInput type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></Field>
        <p className="text-[12.5px] mb-3" style={{ color: COLORS.inkSoft }}>Escribe solo los que cambiaron. Los presupuestos en borrador se recalculan solos; los enviados conservan su precio y te avisan cuánto cambiaría.</p>
        {catalogo.insumos.map((i) => {
          const pv = precioVigente(i, zonaId, fecha);
          const nuevo = parseFloat(nuevos[i.id]);
          const delta = pv && nuevo > 0 ? ((nuevo - pv.precio) / pv.precio) * 100 : null;
          return (
            <div key={i.id} className="rounded-xl p-3 mb-2 flex items-center gap-3" style={{ background: COLORS.paper, boxShadow: CARD_SHADOW }}>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-semibold truncate" style={{ color: COLORS.ink }}>{i.descripcion}</p>
                <p className="text-[11.5px] nums" style={{ color: COLORS.inkFaint }}>Actual {pv ? pesos(pv.precio) : '—'} /{i.unidad}{delta != null && Math.abs(delta) >= 0.05 ? <b style={{ color: delta > 0 ? COLORS.bad : COLORS.good }}> · {delta > 0 ? '+' : ''}{cant(delta, 1)}%</b> : null}</p>
              </div>
              <div className="w-[112px] shrink-0"><Num value={nuevos[i.id] ?? ''} onChange={(v) => setNuevos({ ...nuevos, [i.id]: v })} placeholder="Nuevo $" /></div>
            </div>
          );
        })}
        <div className="sticky mt-3" style={{ bottom: 'calc(84px + env(safe-area-inset-bottom))' }}>
          <PrimaryButton disabled={!cambios.length} onClick={guardar}><RefreshCw size={16} />Guardar {cambios.length || ''} precio{cambios.length === 1 ? '' : 's'}</PrimaryButton>
        </div>
      </div>
    </div>
  );
}

function ZonaSheet({ zona, onClose, onSave, onBorrar }) {
  const [nombre, setNombre] = useState(zona.nombre || '');
  return (
    <Sheet title={zona.id ? 'Editar zona' : 'Nueva zona'} onClose={onClose}>
      <Field label="Nombre"><TextInput value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Costa Grande" /></Field>
      <PrimaryButton disabled={!nombre.trim()} onClick={() => nombre.trim() && onSave({ ...zona, nombre: nombre.trim() })}>Guardar zona</PrimaryButton>
      {onBorrar && <BorrarConfirmado onBorrar={onBorrar} texto="Eliminar zona (sus precios quedan en el historial)" />}
    </Sheet>
  );
}

function InsumoSheet({ insumo, zonas, zonaId, onClose, onSave, onBorrar }) {
  const [i, setI] = useState({ clave: '', descripcion: '', unidad: 'pza', categoria: 'material', precios: [], ...insumo });
  const [precio, setPrecio] = useState('');
  const [fecha, setFecha] = useState(hoy());
  const [zona, setZona] = useState(zonaId);
  const nombreZona = (id) => zonas.find((z) => z.id === id)?.nombre || 'General';
  const precios = precio !== '' && parseFloat(precio) > 0
    ? [...i.precios.filter((p) => !((p.zonaId || '') === zona && p.fecha === fecha)), { id: uid(), zonaId: zona, fecha, precio: parseFloat(precio) }]
    : i.precios;
  const valido = i.clave.trim() && i.descripcion.trim() && precios.length > 0;
  const historial = [...i.precios].sort((a, b) => (a.fecha < b.fecha ? 1 : -1)).slice(0, 12);
  return (
    <Sheet title={insumo.id ? 'Editar insumo' : 'Nuevo insumo'} onClose={onClose}>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Clave"><TextInput value={i.clave} onChange={(e) => setI({ ...i, clave: e.target.value })} placeholder="CEM-01" /></Field>
        <div className="col-span-2"><Field label="Descripción"><TextInput value={i.descripcion} onChange={(e) => setI({ ...i, descripcion: e.target.value })} placeholder="Cemento gris 50 kg" /></Field></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tipo"><Select value={i.categoria} onChange={(e) => setI({ ...i, categoria: e.target.value })}>{Object.entries(CATEGORIAS_INSUMO).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</Select></Field>
        <Field label="Unidad"><Select value={i.unidad} onChange={(e) => setI({ ...i, unidad: e.target.value })}>{UNIDADES.map((u) => <option key={u}>{u}</option>)}</Select></Field>
      </div>
      <div className="rounded-xl p-3 mb-4" style={{ background: COLORS.paperAlt }}>
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] mb-2" style={{ color: COLORS.inkSoft }}>{insumo.id ? 'Precio nuevo' : 'Precio'}</p>
        <div className="grid grid-cols-3 gap-2">
          <Field label="$"><Num value={precio} onChange={setPrecio} /></Field>
          <Field label="Zona"><Select value={zona} onChange={(e) => setZona(e.target.value)}><option value="">General</option>{zonas.map((z) => <option key={z.id} value={z.id}>{z.nombre}</option>)}</Select></Field>
          <Field label="Fecha"><TextInput type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></Field>
        </div>
        {historial.length > 0 && (
          <div className="mt-1">
            {historial.map((p) => (
              <div key={p.id} className="flex items-center justify-between py-1 text-[12px]" style={{ color: COLORS.inkSoft }}>
                <span>{fechaLarga(p.fecha)} · {nombreZona(p.zonaId)}</span>
                <span className="flex items-center gap-2 nums" style={{ fontFamily: FONT_MONO, color: COLORS.ink }}>{pesos(p.precio)}
                  <button onClick={() => setI({ ...i, precios: i.precios.filter((x) => x.id !== p.id) })} aria-label="Quitar precio"><Trash2 size={12} color={COLORS.bad} /></button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      <PrimaryButton disabled={!valido} onClick={() => valido && onSave({ ...i, precios })}>Guardar insumo</PrimaryButton>
      {onBorrar && <BorrarConfirmado onBorrar={onBorrar} texto="Eliminar insumo" />}
      {insumo.id && !onBorrar && <p className="text-[11px] text-center mt-3" style={{ color: COLORS.inkFaint }}>No se puede eliminar: lo usa algún concepto.</p>}
    </Sheet>
  );
}

function ConceptoCatalogoSheet({ concepto, catalogo, zonaId, onClose, onSave, onBorrar }) {
  const [k, setK] = useState({ clave: '', descripcion: '', unidad: 'm³', partida: '', matriz: [], ...concepto });
  const cd = costoDirectoConcepto(k, catalogo, zonaId);
  const setM = (id, cambios) => setK({ ...k, matriz: k.matriz.map((m) => (m.id === id ? { ...m, ...cambios } : m)) });
  const valido = k.clave.trim() && k.descripcion.trim() && k.matriz.length > 0 && k.matriz.every((m) => m.insumoId && parseFloat(m.rendimiento) > 0);
  return (
    <Sheet title={concepto.id ? 'Editar concepto' : 'Nuevo concepto'} onClose={onClose}>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Clave"><TextInput value={k.clave} onChange={(e) => setK({ ...k, clave: e.target.value })} placeholder="CON-01" /></Field>
        <div className="col-span-2"><Field label="Unidad"><Select value={k.unidad} onChange={(e) => setK({ ...k, unidad: e.target.value })}>{UNIDADES.map((u) => <option key={u}>{u}</option>)}</Select></Field></div>
      </div>
      <Field label="Descripción"><TextInput value={k.descripcion} onChange={(e) => setK({ ...k, descripcion: e.target.value })} placeholder="Concreto f'c=200 kg/cm² en losa" /></Field>
      <Field label="Partida"><Select value={k.partida} onChange={(e) => setK({ ...k, partida: e.target.value })}><option value="">Sin partida</option>{PARTIDAS.map((p) => <option key={p}>{p}</option>)}</Select></Field>
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] mb-2" style={{ color: COLORS.inkSoft }}>Matriz · qué lleva por cada {k.unidad}</p>
      {k.matriz.map((m) => {
        const insumo = catalogo.insumos.find((i) => i.id === m.insumoId);
        const pv = insumo ? precioVigente(insumo, zonaId) : null;
        return (
          <div key={m.id} className="rounded-xl p-2.5 mb-2" style={{ background: COLORS.paperAlt }}>
            <Select value={m.insumoId} onChange={(e) => setM(m.id, { insumoId: e.target.value })}>
              <option value="">Elige insumo</option>
              {catalogo.insumos.map((i) => <option key={i.id} value={i.id}>{i.descripcion} ({i.unidad})</option>)}
            </Select>
            <div className="flex items-center gap-2 mt-2">
              <div className="w-[110px]"><Num step="0.001" value={m.rendimiento} onChange={(v) => setM(m.id, { rendimiento: v })} placeholder="Cantidad" /></div>
              <span className="text-[12px] flex-1 nums" style={{ color: COLORS.inkSoft }}>{insumo?.unidad || ''} × {pv ? pesos(pv.precio) : 'sin precio'} = <b style={{ color: COLORS.ink }}>{pesos((parseFloat(m.rendimiento) || 0) * (pv?.precio || 0))}</b></span>
              <button onClick={() => setK({ ...k, matriz: k.matriz.filter((x) => x.id !== m.id) })} className="p-1.5" aria-label="Quitar insumo"><Trash2 size={14} color={COLORS.bad} /></button>
            </div>
          </div>
        );
      })}
      <button onClick={() => setK({ ...k, matriz: [...k.matriz, { id: uid(), insumoId: catalogo.insumos[0]?.id || '', rendimiento: '' }] })} disabled={!catalogo.insumos.length}
        className="w-full py-2.5 mb-4 rounded-xl text-[13px] font-bold flex items-center justify-center gap-1.5" style={{ border: `1.5px dashed ${COLORS.orange}`, color: COLORS.orange, opacity: catalogo.insumos.length ? 1 : 0.4 }}><Plus size={14} />Agregar insumo</button>
      <div className="rounded-xl p-3 mb-4" style={{ background: COLORS.night }}>
        <Fila label={<span style={{ color: COLORS.nightSoft }}>Costo directo / {k.unidad}</span>} valor={<span style={{ color: '#fff' }}>{pesos(cd.total)}</span>} fuerte />
        <p className="text-[11px] nums" style={{ color: COLORS.nightSoft }}>Material {pesos(cd.porCategoria.material)} · M.O. {pesos(cd.porCategoria.mano_obra)} · Equipo {pesos(cd.porCategoria.equipo)}</p>
      </div>
      <PrimaryButton disabled={!valido} onClick={() => valido && onSave(k)}>Guardar concepto</PrimaryButton>
      {onBorrar && <BorrarConfirmado onBorrar={onBorrar} texto="Eliminar concepto del catálogo" />}
    </Sheet>
  );
}

/* ============================= PDF ============================= */

function CotizacionPDF({ cotizacion: c, catalogo, cuenta, onBack }) {
  const r = calcularEjecucion(c, catalogo);
  const datos = [['Fecha', fechaLarga(c.fecha)], ['Vigencia', `Hasta ${fechaLarga(vence(c))}`], ['Plazo', c.plazoSemanas ? `${c.plazoSemanas} semanas` : '—'], ['Anticipo', `${cant(c.anticipoPct)}%`]];
  return (
    <div className="pb-28">
      <div className="no-print"><Header title="Vista PDF" subtitle={c.folio} onBack={onBack} /></div>
      <div className="px-5 no-print mb-4"><PrimaryButton onClick={() => window.print()}><FileText size={17} />Guardar PDF / imprimir</PrimaryButton></div>
      <div className="mx-3 sm:mx-5 rounded-2xl p-4 sm:p-6" style={{ background: '#fff', boxShadow: CARD_SHADOW }}>
        <EncabezadoReporte tipo="Presupuesto de obra" titulo={c.nombre || c.folio} proyecto={c} cuenta={cuenta} folio={c.folio} datos={datos} />
        <div className="grid grid-cols-3 gap-2 mb-4">
          <KpiReporte label="Subtotal" value={pesos(r.subtotal, 0)} />
          <KpiReporte label={`IVA ${cant(c.ivaPct)}%`} value={pesos(r.iva, 0)} />
          <KpiReporte label="Total" value={pesos(r.total, 0)} destacado color="#fff" />
        </div>
          <>
            <p className="titulo-seccion">Catálogo de conceptos</p>
            <div className="overflow-x-auto -mx-1 px-1"><table className="tabla-reporte">
              <thead><tr><th>Clave</th><th>Concepto</th><th>Unidad</th><th className="num">Cantidad</th><th className="num">P. unitario</th><th className="num">Importe</th></tr></thead>
              <tbody>
                {r.partidas.map((g) => [
                  <tr key={`p-${g.partida}`}><td colSpan={5} style={{ fontWeight: 700, color: COLORS.blueprint }}>{g.partida}</td><td className="num" style={{ fontWeight: 700, color: COLORS.blueprint }}>{pesos(g.importe)}</td></tr>,
                  ...g.lineas.map((l) => <tr key={l.id}><td style={{ fontFamily: FONT_MONO }}>{l.clave}</td><td>{l.descripcion}</td><td>{l.unidad}</td><td className="num">{cant(l.cantidad)}</td><td className="num">{pesos(l.pu)}</td><td className="num">{pesos(l.importe)}</td></tr>),
                ])}
              </tbody>
              <tfoot><tr><td colSpan={5}>Subtotal</td><td className="num">{pesos(r.subtotal)}</td></tr></tfoot>
            </table></div>
          </>
        <div className="break-inside-avoid mt-4 ml-auto max-w-[320px]">
          <Fila label="Subtotal" valor={pesos(r.subtotal)} />
          <Fila label={`IVA ${cant(c.ivaPct)}%`} valor={pesos(r.iva)} />
          <Fila label="Total" valor={pesos(r.total)} fuerte color={COLORS.orange} />
          <Fila label={`Anticipo ${cant(c.anticipoPct)}%`} valor={pesos(r.anticipo)} />
        </div>
        {c.notas && <><p className="titulo-seccion">Condiciones</p><p className="text-[12px] whitespace-pre-line" style={{ color: COLORS.ink }}>{c.notas}</p></>}
        <p className="text-[10.5px] mt-4" style={{ color: COLORS.inkSoft }}>Precios en moneda nacional. Esta cotización es válida hasta el {fechaLarga(vence(c))}.</p>
        <FirmasReporte cuenta={cuenta} firmas={['Elaboró', 'Aceptación del cliente']} />
      </div>
    </div>
  );
}
