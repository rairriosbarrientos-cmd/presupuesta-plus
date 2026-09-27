// Identidad de Presupuesta+: barras de presupuesto que suben, con un "+" dorado.
// Colores propios para no depender de ui.jsx (que importa este archivo).
const NOCHE = '#0C1B2A';
const MENTA = '#00A67E';
const MENTA_CLARO = '#3CCB9F';
const DORADO = '#FFC53D';

export function Logo({ size = 40, radio = 14, sombra = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Presupuesta+" className="shrink-0"
      style={sombra ? { filter: 'drop-shadow(0 8px 18px rgba(0,166,126,0.35))' } : undefined}>
      <rect width="64" height="64" rx={radio} fill={NOCHE} />
      <rect x="12" y="36" width="9" height="16" rx="2.5" fill={MENTA} opacity="0.55" />
      <rect x="25" y="27" width="9" height="25" rx="2.5" fill={MENTA} opacity="0.8" />
      <rect x="38" y="18" width="9" height="34" rx="2.5" fill={MENTA_CLARO} />
      <path d="M49 9 v11 M43.5 14.5 h11" stroke={DORADO} strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function NombreMarca({ tamano = 22, claro = true }) {
  return (
    <span className="font-bold leading-none tracking-tight" style={{ fontFamily: "'Sora', system-ui, sans-serif", fontSize: tamano }}>
      <span style={{ color: claro ? '#fff' : NOCHE }}>Presupuesta</span><span style={{ color: DORADO }}>+</span>
    </span>
  );
}
