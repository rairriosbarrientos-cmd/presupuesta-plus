import { rpcDe, tablaDe } from '../src/config.js';

// Supabase de prueba en memoria: imita guardar_registro y la lectura de registros
// con las mismas reglas que supabase/migrations/001_empresas.sql.
export function crearServidor() {
  const filas = new Map(); // `${empresa}|${id}` -> { empresa_id, id, data, version, eliminado }
  const roles = new Map(); // `${empresa}|${usuario}` -> rol
  const copia = (v) => JSON.parse(JSON.stringify(v));

  return {
    filas,
    ponerRol(empresa, usuario, rol) { roles.set(`${empresa}|${usuario}`, rol); },
    proyectos(empresa) {
      return [...filas.values()].filter((f) => f.empresa_id === empresa && !f.eliminado).map((f) => copia(f.data));
    },
    cliente(usuario) {
      const red = { conectado: true, llamadas: 0 };
      const sinRed = () => ({ data: null, error: { message: 'Failed to fetch' } });
      const rol = (empresa) => roles.get(`${empresa}|${usuario}`);
      const tick = () => new Promise((r) => setTimeout(r, 0));

      return {
        red,
        async rpc(nombre, args) {
          await tick();
          red.llamadas++;
          if (!red.conectado) return sinRed();
          if (nombre !== rpcDe('guardar_registro')) throw new Error(`rpc desconocida ${nombre}`);
          const { p_empresa, p_id, p_data, p_version_base, p_eliminado } = args;
          if (!['admin', 'editor'].includes(rol(p_empresa))) return { data: null, error: { code: '42501', message: 'sin_permiso' } };
          const k = `${p_empresa}|${p_id}`;
          const actual = filas.get(k);
          if (!actual) {
            filas.set(k, { empresa_id: p_empresa, id: p_id, data: copia(p_data), version: 1, eliminado: !!p_eliminado });
            return { data: { ok: true, version: 1 }, error: null };
          }
          if (actual.version !== (p_version_base || 0)) {
            return { data: { ok: false, conflicto: true, version: actual.version, data: copia(actual.data), eliminado: actual.eliminado }, error: null };
          }
          filas.set(k, { ...actual, data: copia(p_data), version: actual.version + 1, eliminado: !!p_eliminado });
          return { data: { ok: true, version: actual.version + 1 }, error: null };
        },
        from(tabla) {
          if (tabla !== tablaDe('registros')) throw new Error(`tabla desconocida ${tabla}`);
          const filtro = { columnas: '', empresa: null, ids: null };
          const consulta = {
            select(c) { filtro.columnas = c; return consulta; },
            eq(col, v) { if (col === 'empresa_id') filtro.empresa = v; return consulta; },
            in(col, v) { if (col === 'id') filtro.ids = new Set(v); return consulta; },
            then(ok, mal) {
              return (async () => {
                await tick();
                red.llamadas++;
                if (!red.conectado) return sinRed();
                if (!rol(filtro.empresa)) return { data: [], error: null };
                const cols = filtro.columnas.split(',').map((s) => s.trim());
                const data = [...filas.values()]
                  .filter((f) => f.empresa_id === filtro.empresa && (!filtro.ids || filtro.ids.has(f.id)))
                  .map((f) => Object.fromEntries(cols.map((c) => [c, copia(f[c])])));
                return { data, error: null };
              })().then(ok, mal);
            },
          };
          return consulta;
        },
      };
    },
  };
}

export function crearAlmacen() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}
