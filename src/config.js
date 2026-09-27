// Identidad y conexión de esta app. Las tablas y funciones de Supabase llevan el prefijo
// para que sus cuentas, licencias y datos queden separados de cualquier otra app del mismo proyecto.
export const APP = {
  nombre: 'Presupuesta+',
  prefijo: 'pres',
  claveLocal: 'presupuesta',
  lema: 'Presupuestos de obra al día',
  descripcion: 'Presupuestos de obra con precios unitarios por zona que se actualizan cada semana. Funciona sin internet.',
  titulosEntrar: ['Entra a tus presupuestos', 'Crea tu cuenta'],
  subtituloEntrar: 'Cada quien con su cuenta: se sabe quién capturó qué y cada empresa ve solo lo suyo.',
  beneficios: ['Captura sin señal; se sube solo cuando vuelve.', 'Tu equipo cotiza con los mismos precios.', 'Tus precios y clientes, separados de otras empresas.'],
  cosa: ['registro', 'registros'],
  empresaPlaceholder: 'Ej. Constructora Ríos',
  empresaLabel: 'Nombre de tu empresa',
  correoPlaceholder: 'tu@empresa.mx',
};

export const rpcDe = (nombre) => `${APP.prefijo}_${nombre}`;
export const tablaDe = (nombre) => `${APP.prefijo}_${nombre}`;
