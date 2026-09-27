import { useEffect, useState } from 'react';
import { X, RefreshCw, Building2, Users, FolderOpen, CalendarClock, Clock, ShieldOff, ShieldCheck } from 'lucide-react';
import { COLORS, FONT_SLAB, FONT_SANS, FONT_MONO, PLANO_BG, FRANJA, CARD_SHADOW } from '../ui.jsx';
import { Logo, NombreMarca } from '../Marca.jsx';
import { rpcDe } from '../config.js';
import { traducirError } from './cliente.js';

const ESTILO_LICENCIA = {
  pendiente: { texto: 'En revisión', color: COLORS.warn },
  activa: { texto: 'Activa', color: COLORS.good },
  vencida: { texto: 'Vencida', color: COLORS.bad },
  suspendida: { texto: 'Suspendida', color: COLORS.inkFaint },
};

function sumarDias(dias) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fechaCorta(iso) {
  return iso ? new Date(iso + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Sin vencimiento';
}

// Panel del dueño de la app: todas las empresas, sus licencias y su uso.
export function PanelPlataforma({ supabase, onCerrar }) {
  const [empresas, setEmpresas] = useState(null);
  const [error, setError] = useState(null);
  const [filtro, setFiltro] = useState('todas');

  async function cargar() {
    setError(null);
    const { data, error: err } = await supabase.rpc(rpcDe('plataforma_empresas'));
    if (err) setError(traducirError(err)); else setEmpresas(data);
  }
  useEffect(() => { cargar(); }, []);

  async function guardar(e, cambios) {
    const datos = { estado: e.estado, vence: e.vence, max_usuarios: e.max_usuarios, plan: e.plan, notas: e.notas, ...cambios };
    const { error: err } = await supabase.rpc(rpcDe('plataforma_actualizar_empresa'), {
      p_empresa: e.id, p_estado: datos.estado, p_vence: datos.vence, p_max_usuarios: datos.max_usuarios, p_plan: datos.plan, p_notas: datos.notas,
    });
    if (err) return setError(traducirError(err));
    cargar();
  }

  const lista = (empresas || []).filter((e) => filtro === 'todas' || e.licencia === filtro);
  const cuenta = (lic) => (empresas || []).filter((e) => e.licencia === lic).length;

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto" style={{ background: COLORS.bg, fontFamily: FONT_SANS }}>
      <div className="relative" style={{ background: COLORS.night, backgroundImage: PLANO_BG, backgroundSize: '22px 22px' }}>
        <div className="px-5 pb-5 flex items-center gap-3" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 18px)' }}>
          <Logo size={40} radio={12} />
          <div className="flex-1 min-w-0">
            <NombreMarca tamano={22} />
            <p className="text-[11px] uppercase tracking-[0.2em] font-semibold mt-0.5" style={{ color: COLORS.orange, fontFamily: FONT_MONO }}>Panel del dueño</p>
          </div>
          <button onClick={cargar} className="p-2.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.08)' }} aria-label="Actualizar"><RefreshCw size={18} color="#fff" /></button>
          <button onClick={onCerrar} className="p-2.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.08)' }} aria-label="Cerrar"><X size={18} color="#fff" /></button>
        </div>
        <div style={{ height: 5, background: FRANJA }} />
      </div>

      <div className="px-4 py-4 max-w-2xl mx-auto" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}>
        {error && <p role="alert" className="text-sm mb-4 px-3.5 py-2.5 rounded-xl" style={{ background: '#FDECEA', color: COLORS.bad }}>{error}</p>}
        <div className="flex gap-1.5 overflow-x-auto pb-1 mb-4">
          {[['todas', `Todas · ${empresas?.length ?? 0}`], ['pendiente', `En revisión · ${cuenta('pendiente')}`], ['activa', `Activas · ${cuenta('activa')}`], ['vencida', `Vencidas · ${cuenta('vencida')}`], ['suspendida', `Suspendidas · ${cuenta('suspendida')}`]].map(([k, t]) => (
            <button key={k} onClick={() => setFiltro(k)} className="shrink-0 px-3 py-2 rounded-full text-[12px] font-bold"
              style={{ background: filtro === k ? COLORS.night : COLORS.paper, color: filtro === k ? '#fff' : COLORS.inkSoft, border: `1px solid ${filtro === k ? COLORS.night : COLORS.line}` }}>{t}</button>
          ))}
        </div>
        {!empresas && !error && <p className="text-sm" style={{ color: COLORS.inkFaint }}>Cargando...</p>}
        {empresas && lista.length === 0 && <p className="text-sm text-center py-10" style={{ color: COLORS.inkFaint }}>Nada por aquí.</p>}
        <div className="flex flex-col gap-3">
          {lista.map((e) => <TarjetaEmpresa key={e.id} empresa={e} onGuardar={(c) => guardar(e, c)} />)}
        </div>
      </div>
    </div>
  );
}

function TarjetaEmpresa({ empresa: e, onGuardar }) {
  const [max, setMax] = useState(e.max_usuarios ?? '');
  const [notas, setNotas] = useState(e.notas ?? '');
  const estilo = ESTILO_LICENCIA[e.licencia] || ESTILO_LICENCIA.pendiente;
  const cambiado = String(max) !== String(e.max_usuarios ?? '') || notas !== (e.notas ?? '');
  const activar = (dias) => {
    const plazo = dias ? `hasta el ${fechaCorta(sumarDias(dias))}` : 'sin vencimiento';
    if (window.confirm(`¿${e.licencia === 'activa' ? 'Renovar' : 'Activar'} ${e.nombre} ${plazo}?`)) onGuardar({ estado: 'activa', vence: dias ? sumarDias(dias) : null });
  };

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: COLORS.paper, border: `1px solid ${e.licencia === 'pendiente' ? COLORS.hazard : COLORS.line}`, boxShadow: CARD_SHADOW }}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-xl p-2 shrink-0" style={{ background: COLORS.night }}><Building2 size={18} color={COLORS.orange} /></div>
          <div className="flex-1 min-w-0">
            <p className="text-xl font-bold leading-tight tracking-tight truncate" style={{ fontFamily: FONT_SLAB, color: COLORS.ink }}>{e.nombre}</p>
            <p className="text-[12px] truncate" style={{ color: COLORS.inkSoft }}>{e.admin_email || 'Sin administrador'}</p>
          </div>
          <span className="shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ background: estilo.color + '1A', color: estilo.color, border: `1px solid ${estilo.color}55` }}>{estilo.texto}</span>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-3 text-[12px]" style={{ color: COLORS.inkSoft }}>
          <span className="flex items-center gap-1"><Users size={13} />{e.usuarios}{e.max_usuarios ? ` / ${e.max_usuarios}` : ''} usuario{e.usuarios === 1 && !e.max_usuarios ? '' : 's'}</span>
          <span className="flex items-center gap-1"><FolderOpen size={13} />{e.obras} cotizaci{e.obras === 1 ? 'ón' : 'ones'}</span>
          <span className="flex items-center gap-1 truncate"><CalendarClock size={13} />{fechaCorta(e.vence)}</span>
        </div>
        {e.solicitudes > 0 && <p className="text-[11px] mt-1.5 flex items-center gap-1" style={{ color: COLORS.warn }}><Clock size={12} />{e.solicitudes} solicitud{e.solicitudes === 1 ? '' : 'es'} de entrada sin atender</p>}
        <p className="text-[10px] mt-1.5" style={{ color: COLORS.inkFaint, fontFamily: FONT_MONO }}>Creada {new Date(e.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
      </div>

      <div className="px-4 pb-4 pt-3" style={{ borderTop: `1px solid ${COLORS.line}`, background: COLORS.paperAlt }}>
        <p className="text-[10px] uppercase tracking-[0.12em] font-semibold mb-2" style={{ color: COLORS.inkSoft }}>{e.licencia === 'activa' ? 'Renovar desde hoy' : 'Activar licencia'}</p>
        <div className="grid grid-cols-3 gap-1.5">
          <button onClick={() => activar(30)} className="py-2.5 rounded-lg text-[13px] font-bold" style={{ background: COLORS.orange, color: '#fff' }}>30 días</button>
          <button onClick={() => activar(365)} className="py-2.5 rounded-lg text-[13px] font-bold" style={{ background: COLORS.orange, color: '#fff' }}>1 año</button>
          <button onClick={() => activar(null)} className="py-2.5 rounded-lg text-[13px] font-bold" style={{ background: COLORS.night, color: '#fff' }}>Sin fin</button>
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-2 mt-3 items-end">
          <label className="text-[11px] font-semibold" style={{ color: COLORS.inkSoft }}>
            Límite de usuarios (vacío = sin límite)
            <input type="number" min="1" inputMode="numeric" value={max} onChange={(ev) => setMax(ev.target.value)} className="w-full mt-1 px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: COLORS.paper, border: `1.5px solid ${COLORS.line}`, color: COLORS.ink }} />
          </label>
          {e.estado !== 'suspendida' ? (
            <button onClick={() => window.confirm(`¿Suspender ${e.nombre}? Nadie de esa empresa podrá entrar.`) && onGuardar({ estado: 'suspendida' })} className="py-2 px-3 rounded-lg text-[12px] font-bold flex items-center gap-1" style={{ background: '#FDECEA', color: COLORS.bad }}><ShieldOff size={14} />Suspender</button>
          ) : (
            <span className="py-2 px-3 text-[12px] flex items-center gap-1" style={{ color: COLORS.inkFaint }}><ShieldCheck size={14} />Suspendida</span>
          )}
        </div>
        <label className="block text-[11px] font-semibold mt-2" style={{ color: COLORS.inkSoft }}>
          Notas (pago, contacto…)
          <input value={notas} onChange={(ev) => setNotas(ev.target.value)} maxLength={300} className="w-full mt-1 px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: COLORS.paper, border: `1.5px solid ${COLORS.line}`, color: COLORS.ink }} />
        </label>
        {cambiado && (
          <button onClick={() => onGuardar({ max_usuarios: max === '' ? null : Math.max(1, parseInt(max, 10) || 1), notas: notas.trim() || null })}
            className="w-full mt-2 py-2.5 rounded-lg text-[13px] font-bold" style={{ background: COLORS.night, color: '#fff' }}>Guardar cambios</button>
        )}
      </div>
    </div>
  );
}
