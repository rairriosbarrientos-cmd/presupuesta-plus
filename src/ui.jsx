// Piezas de interfaz y colores de Presupuesta+: azul noche, verde menta y dorado.
import { ArrowLeft, Plus, X } from 'lucide-react';
import { Logo, NombreMarca } from './Marca.jsx';
import { APP } from './config.js';

export const COLORS = {
  bg: '#EDF1F4', paper: '#FFFFFF', paperAlt: '#F3F6F8',
  ink: '#0C1B2A', inkSoft: '#4A5B6C', inkFaint: '#8A99A8',
  line: '#DCE3EA', lineStrong: '#A9B6C3',
  // `orange` es el color de acento (se conserva el nombre para las pantallas de cuenta compartidas).
  orange: '#00A67E', accent: '#00A67E', blueprint: '#123E6B', chip: '#E3E9EF',
  good: '#138A4B', warn: '#C98A00', bad: '#D2372A',
  night: '#0C1B2A', nightAlt: '#142638', nightLine: 'rgba(255,255,255,0.09)', nightInk: '#E6EEF5', nightSoft: '#93A6B8',
  hazard: '#FFC53D',
};
export const FONT_SLAB = "'Sora', system-ui, sans-serif";
export const FONT_SANS = "'Inter', system-ui, sans-serif";
export const FONT_MONO = "'JetBrains Mono', ui-monospace, monospace";
// Fondo de puntos y barra de marca menta→dorado.
export const PLANO_BG = 'radial-gradient(rgba(255,255,255,0.07) 1px, transparent 1.2px)';
export const FRANJA = 'linear-gradient(90deg, #00A67E 0%, #3CCB9F 55%, #FFC53D 100%)';
export const CARD_SHADOW = '0 1px 2px rgba(12,27,42,0.06), 0 6px 18px rgba(12,27,42,0.06)';

const inputStyle = { background: COLORS.paperAlt, border: `1.5px solid ${COLORS.line}`, color: COLORS.ink, fontFamily: FONT_SANS };

export function Sheet({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" style={{ background: 'rgba(12,27,42,0.6)', backdropFilter: 'blur(2px)' }} onClick={onClose}>
      <div className="rounded-t-3xl max-h-[88vh] overflow-y-auto w-full max-w-xl mx-auto" style={{ background: COLORS.paper, paddingBottom: 'env(safe-area-inset-bottom)' }} onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 px-5 pt-2.5 pb-3.5 border-b" style={{ background: COLORS.paper, borderColor: COLORS.line }}>
          <div className="mx-auto mb-2.5 rounded-full" style={{ width: 40, height: 4, background: COLORS.line }} />
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold leading-tight tracking-tight" style={{ fontFamily: FONT_SLAB, color: COLORS.ink }}>{title}</h2>
            <button onClick={onClose} className="p-2 rounded-full shrink-0" style={{ background: COLORS.paperAlt }} aria-label="Cerrar"><X size={18} color={COLORS.ink} /></button>
          </div>
        </div>
        <div className="px-5 py-5">{children}</div>
      </div>
    </div>
  );
}
export function Field({ label, children }) {
  return (
    <div className="mb-4">
      <label className="block text-[11px] font-semibold mb-1.5 tracking-[0.08em] uppercase" style={{ color: COLORS.inkSoft, fontFamily: FONT_SANS }}>{label}</label>
      {children}
    </div>
  );
}
export function TextInput(props) { return <input {...props} className="w-full px-3.5 py-3 rounded-xl text-[15px] outline-none focus:ring-2 focus:ring-emerald-400 disabled:opacity-70" style={inputStyle} />; }
export function Select(props) { return <select {...props} className="w-full px-3.5 py-3 rounded-xl text-[15px] outline-none focus:ring-2 focus:ring-emerald-400 disabled:opacity-70" style={inputStyle}>{props.children}</select>; }
export function PrimaryButton({ children, disabled, ...props }) {
  return (
    <button {...props} disabled={disabled} className="w-full py-3.5 rounded-xl text-[15px] font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
      style={{ background: COLORS.accent, color: '#fff', fontFamily: FONT_SANS, opacity: disabled ? 0.4 : 1, boxShadow: disabled ? 'none' : '0 8px 20px rgba(0,166,126,0.30)' }}>{children}</button>
  );
}
export function FloatingAddButton({ onClick, label }) {
  return (
    <button onClick={onClick} className="fixed right-4 flex items-center gap-2 pl-4 pr-5 py-3.5 rounded-2xl z-40 no-print active:scale-95 transition-transform"
      style={{ bottom: 'calc(20px + env(safe-area-inset-bottom))', background: COLORS.accent, color: '#fff', boxShadow: '0 12px 26px rgba(0,166,126,0.38)' }}>
      <Plus size={20} strokeWidth={2.6} /><span className="text-[15px] font-bold" style={{ fontFamily: FONT_SANS }}>{label}</span>
    </button>
  );
}
export function EmptyState({ icon: Icon, text }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 px-8 text-center rounded-2xl" style={{ border: `2px dashed ${COLORS.line}` }}>
      <div className="rounded-2xl p-4 mb-1" style={{ background: COLORS.night }}><Icon size={28} color={COLORS.accent} strokeWidth={1.8} /></div>
      <p className="mt-3 text-sm max-w-[260px]" style={{ color: COLORS.inkSoft }}>{text}</p>
    </div>
  );
}
export function Note({ children }) {
  return <div className="text-[12.5px] px-3.5 py-2.5 rounded-xl mb-3 text-left" style={{ background: '#E8F7F2', color: '#0B5E48', border: '1px solid #BFE8DA' }}>{children}</div>;
}
// Encabezado oscuro con barra de marca. En impresión se oculta (los PDFs llevan su propio encabezado).
export function Header({ title, subtitle, onBack, derecha }) {
  return (
    <div className="relative mb-5 header-app" style={{ background: COLORS.night, backgroundImage: PLANO_BG, backgroundSize: '16px 16px' }}>
      <div className="px-5 pb-6 flex items-end gap-3 max-w-3xl mx-auto" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 52px)' }}>
        {onBack && (
          <button onClick={onBack} className="mb-0.5 p-2 rounded-xl shrink-0 no-print" style={{ background: 'rgba(255,255,255,0.08)', border: `1px solid ${COLORS.nightLine}` }} aria-label="Regresar">
            <ArrowLeft size={20} color="#fff" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          {subtitle && <p className="text-[11px] uppercase tracking-[0.16em] font-semibold truncate mb-1" style={{ color: COLORS.accent, fontFamily: FONT_MONO }}>{subtitle}</p>}
          <h1 className="text-[27px] font-bold leading-[1.05] tracking-tight" style={{ fontFamily: FONT_SLAB, color: '#fff' }}>{title}</h1>
        </div>
        {derecha}
      </div>
      <div className="absolute left-0 right-0 bottom-0" style={{ height: 4, background: FRANJA }} />
    </div>
  );
}

function Dato({ label, children }) {
  return (
    <div className="min-w-0">
      <p className="text-[9.5px] uppercase tracking-[0.12em] font-semibold" style={{ color: COLORS.inkFaint }}>{label}</p>
      <p className="text-[12px] font-semibold leading-snug break-words" style={{ color: COLORS.ink }}>{children || '—'}</p>
    </div>
  );
}
export function EncabezadoReporte({ tipo, titulo, proyecto, cuenta, folio, datos = [] }) {
  return (
    <div className="break-inside-avoid mb-5">
      <div className="rounded-2xl overflow-hidden" style={{ background: COLORS.night }}>
        <div className="px-5 pt-4 pb-4 flex items-start justify-between gap-4" style={{ backgroundImage: PLANO_BG, backgroundSize: '14px 14px' }}>
          <div className="min-w-0">
            <p className="text-[12px] font-bold truncate" style={{ color: COLORS.accent, fontFamily: FONT_SLAB }}>{cuenta?.empresa || APP.nombre}</p>
            <p className="text-[10.5px] uppercase tracking-[0.14em] mt-1" style={{ color: COLORS.nightSoft }}>{tipo}</p>
            <h1 className="text-[26px] font-bold leading-[1.05] tracking-tight mt-1" style={{ fontFamily: FONT_SLAB, color: '#fff' }}>{titulo}</h1>
          </div>
          <div className="text-right shrink-0">
            {folio && <p className="text-[13px] font-bold" style={{ color: '#fff', fontFamily: FONT_MONO }}>{folio}</p>}
          </div>
        </div>
        <div style={{ height: 4, background: FRANJA }} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2.5 mt-3 px-1">
        <Dato label="Cliente">{proyecto.cliente}</Dato>
        <Dato label="Ubicación">{proyecto.ubicacion}</Dato>
        {datos.map(([label, valor]) => <Dato key={label} label={label}>{valor}</Dato>)}
      </div>
    </div>
  );
}
export function FirmasReporte({ cuenta, firmas = ['Elaboró', 'Autorizó'] }) {
  return (
    <div className="break-inside-avoid mt-10">
      <div className="grid grid-cols-2 gap-10">
        {firmas.map((f, i) => (
          <div key={f} className="text-center">
            <div style={{ height: 44 }} />
            <div style={{ borderTop: `1.5px solid ${COLORS.ink}` }} />
            <p className="text-[11px] font-semibold mt-1 uppercase tracking-[0.1em]" style={{ color: COLORS.ink }}>{f}</p>
            {i === 0 && cuenta?.email && <p className="text-[10px]" style={{ color: COLORS.inkFaint }}>{cuenta.email}</p>}
          </div>
        ))}
      </div>
      <p className="text-[9px] text-center mt-6 flex items-center justify-center gap-1" style={{ color: COLORS.inkFaint }}>
        <Logo size={12} radio={3} /> Hecho con {APP.nombre} · {new Date().toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' })}
      </p>
    </div>
  );
}
export function KpiReporte({ label, value, sub, color = COLORS.ink, destacado }) {
  return (
    <div className="rounded-xl p-3 break-inside-avoid min-w-0" style={{ background: destacado ? COLORS.night : COLORS.paperAlt, border: `1px solid ${destacado ? COLORS.night : COLORS.line}` }}>
      <p className="text-[9.5px] uppercase tracking-[0.12em] font-semibold truncate" style={{ color: destacado ? COLORS.nightSoft : COLORS.inkFaint }}>{label}</p>
      <p className="text-[15px] sm:text-[19px] font-bold leading-tight mt-0.5 nums break-all" style={{ fontFamily: FONT_SLAB, color: destacado ? '#fff' : color }}>{value}</p>
      {sub && <p className="text-[10.5px] mt-0.5" style={{ color: destacado ? COLORS.nightSoft : COLORS.inkSoft }}>{sub}</p>}
    </div>
  );
}
export { Logo, NombreMarca };
