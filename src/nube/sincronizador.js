// Motor de sincronización: la app siempre trabaja con la copia del celular (funciona sin internet)
// y este motor sube los cambios cuando hay señal y baja los de los compañeros de la empresa.
// Cada proyecto lleva una versión; si alguien más lo cambió primero, el servidor avisa y aquí se fusiona.
import { fusionar3, igual } from './fusion.js';
import { APP, rpcDe, tablaDe } from '../config.js';

const clave = (empresaId) => `${APP.claveLocal}-nube:${empresaId}`;

function almacenSeguro(almacen) {
  return {
    leer(k) { try { const raw = almacen?.getItem(k); return raw ? JSON.parse(raw) : null; } catch (e) { return null; } },
    escribir(k, v) { try { almacen?.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    borrar(k) { try { almacen?.removeItem(k); } catch (e) { /* nada */ } },
  };
}

export function crearSincronizador({ supabase, empresaId, rol, almacen = globalThis.localStorage, ventana = globalThis.window, esperaMs = 1200, intervaloMs = 30000 }) {
  const disco = almacenSeguro(almacen);
  // recs[id] = { data, version, sucio, eliminado, base }
  // base solo se guarda mientras hay cambios sin subir (evita duplicar fotos en el celular).
  let recs = {};
  let orden = [];
  let estado = 'guardando';
  let oyentes = new Set();
  let timerSubir = null;
  let timerBajar = null;
  let enCurso = null;
  let otraVez = false;
  let detenido = false;
  let sinEspacio = false;
  let subiendoId = null;
  let olvidado = false;
  const soloLectura = rol === 'lector';

  function guardarDisco() {
    if (olvidado) return;
    sinEspacio = !disco.escribir(clave(empresaId), { orden, recs });
  }

  function lista() {
    return orden.filter((id) => recs[id] && !recs[id].eliminado).map((id) => recs[id].data);
  }

  function pendientes() {
    return Object.values(recs).filter((r) => r.sucio).length;
  }

  function avisar(cambios) {
    const aviso = { estado, sinEspacio, pendientes: pendientes(), actualizados: [], borrados: [], ...cambios };
    for (const fn of oyentes) fn(aviso);
  }

  function ponerEstado(nuevo) {
    if (nuevo === estado) return;
    estado = nuevo;
    avisar({});
  }

  function actualizar(proyectos) {
    let hubo = false;
    const ids = new Set();
    for (const p of proyectos) {
      ids.add(p.id);
      const r = recs[p.id];
      if (!r) {
        recs[p.id] = { data: p, version: 0, sucio: true, eliminado: false };
        hubo = true;
      } else if (r.eliminado || !igual(r.data, p)) {
        if (!r.sucio) r.base = r.data;
        r.data = p;
        r.eliminado = false;
        r.sucio = true;
        hubo = true;
      }
    }
    for (const id of Object.keys(recs)) {
      const r = recs[id];
      if (ids.has(id) || r.eliminado) continue;
      hubo = true;
      if (r.version === 0 && subiendoId !== id) { delete recs[id]; continue; }
      if (!r.sucio) r.base = r.data;
      r.eliminado = true;
      r.sucio = true;
    }
    const nuevoOrden = proyectos.map((p) => p.id);
    if (!hubo && igual(nuevoOrden, orden)) return;
    orden = nuevoOrden;
    guardarDisco();
    if (!hubo) return;
    ponerEstado(soloLectura ? 'solo lectura' : 'guardando');
    programarSubida();
  }

  function programarSubida() {
    if (detenido) return;
    clearTimeout(timerSubir);
    timerSubir = setTimeout(() => { sincronizar(); }, esperaMs);
  }

  // Descarta cambios locales que el servidor no va a aceptar (lector o sin permiso).
  function revertir(id, cambios) {
    const r = recs[id];
    if (!r || !r.sucio) return;
    if (r.version === 0) {
      delete recs[id];
      orden = orden.filter((x) => x !== id);
      cambios.borrados.push(id);
      return;
    }
    if (r.base !== undefined) r.data = r.base;
    delete r.base;
    r.sucio = false;
    if (r.eliminado && !orden.includes(id)) orden.push(id);
    r.eliminado = false;
    cambios.actualizados.push(r.data);
  }

  // Mezcla una versión del servidor con lo que haya en el celular.
  function aplicarRemoto(id, remoto, cambios) {
    const r = recs[id];
    if (!r) {
      if (remoto.eliminado) return;
      recs[id] = { data: remoto.data, version: remoto.version, sucio: false, eliminado: false };
      if (!orden.includes(id)) orden.push(id);
      cambios.actualizados.push(remoto.data);
      return;
    }
    if (remoto.version <= r.version) return;

    if (!r.sucio) {
      if (remoto.eliminado) {
        delete recs[id];
        orden = orden.filter((x) => x !== id);
        cambios.borrados.push(id);
      } else {
        r.data = remoto.data;
        r.version = remoto.version;
        cambios.actualizados.push(r.data);
      }
      return;
    }

    const base = r.base;
    if (remoto.eliminado && r.eliminado) {
      delete recs[id];
      orden = orden.filter((x) => x !== id);
      return;
    }
    if (remoto.eliminado) {
      // Lo borraron en otro celular pero aquí se editó: se conserva lo editado para no perder captura.
      r.version = remoto.version;
      r.base = remoto.data;
      return;
    }
    if (r.eliminado) {
      if (base !== undefined && igual(remoto.data, base)) { r.version = remoto.version; return; }
      // Aquí se borró, pero allá lo siguieron editando: gana lo editado.
      r.data = remoto.data;
      r.version = remoto.version;
      r.eliminado = false;
      r.sucio = false;
      delete r.base;
      if (!orden.includes(id)) orden.push(id);
      cambios.actualizados.push(r.data);
      return;
    }
    const fusionado = fusionar3(base, r.data, remoto.data);
    r.version = remoto.version;
    if (igual(fusionado, remoto.data)) {
      r.data = remoto.data;
      r.sucio = false;
      delete r.base;
    } else {
      r.data = fusionado;
      r.base = remoto.data;
    }
    cambios.actualizados.push(r.data);
  }

  async function subir(cambios) {
    for (const id of Object.keys(recs)) {
      const r = recs[id];
      if (!r || !r.sucio) continue;
      if (soloLectura) { revertir(id, cambios); continue; }
      const enviado = r.data;
      const eliminadoEnviado = r.eliminado;
      subiendoId = id;
      let res;
      let error;
      try {
        ({ data: res, error } = await supabase.rpc(rpcDe('guardar_registro'), {
          p_empresa: empresaId, p_id: id, p_data: enviado, p_version_base: r.version, p_eliminado: eliminadoEnviado,
        }));
      } finally {
        subiendoId = null;
      }
      if (error) {
        if (error.code === '42501') { revertir(id, cambios); continue; }
        throw error;
      }
      const actual = recs[id];
      if (!actual) continue;
      if (res.ok) {
        actual.version = res.version;
        if (actual.data === enviado && actual.eliminado === eliminadoEnviado) {
          if (actual.eliminado) { delete recs[id]; orden = orden.filter((x) => x !== id); }
          else { actual.sucio = false; delete actual.base; }
        } else {
          // Se editó mientras subía: lo enviado ya es la base del servidor.
          actual.base = enviado;
        }
      } else if (res.conflicto) {
        aplicarRemoto(id, { version: res.version, data: res.data, eliminado: res.eliminado }, cambios);
      }
    }
  }

  async function bajar(cambios) {
    const { data: filas, error } = await supabase.from(tablaDe('registros')).select('id, version, eliminado').eq('empresa_id', empresaId);
    if (error) throw error;
    const enServidor = new Set();
    const traer = [];
    for (const f of filas || []) {
      enServidor.add(f.id);
      const r = recs[f.id];
      if (f.eliminado && !r) continue;
      if (!r || f.version > r.version) traer.push(f.id);
    }
    // Proyectos que ya no existen en el servidor (borrados a mano por un admin).
    for (const id of Object.keys(recs)) {
      const r = recs[id];
      if (!enServidor.has(id) && r.version > 0 && !r.sucio) {
        delete recs[id];
        orden = orden.filter((x) => x !== id);
        cambios.borrados.push(id);
      }
    }
    for (let i = 0; i < traer.length; i += 20) {
      const lote = traer.slice(i, i + 20);
      const { data: completos, error: err } = await supabase.from(tablaDe('registros')).select('id, version, eliminado, data').eq('empresa_id', empresaId).in('id', lote);
      if (err) throw err;
      for (const f of completos || []) aplicarRemoto(f.id, f, cambios);
    }
  }

  async function correr() {
    const cambios = { actualizados: [], borrados: [] };
    try {
      if (pendientes()) ponerEstado(soloLectura ? 'solo lectura' : 'guardando');
      await subir(cambios);
      await bajar(cambios);
      // Si al bajar hubo fusión, lo fusionado se sube en esta misma vuelta.
      if (pendientes() && !soloLectura) await subir(cambios);
      estado = soloLectura ? 'solo lectura' : pendientes() ? 'guardando' : 'sincronizado';
    } catch (e) {
      estado = 'sin conexión';
    }
    guardarDisco();
    // Un proyecto puede aparecer en actualizados y luego en borrados; el borrado manda.
    const borrados = new Set(cambios.borrados);
    const ultimos = new Map();
    for (const p of cambios.actualizados) if (!borrados.has(p.id)) ultimos.set(p.id, recs[p.id]?.data ?? p);
    avisar({ actualizados: [...ultimos.values()].filter((p) => recs[p.id] && !recs[p.id].eliminado), borrados: [...borrados] });
    if (estado === 'guardando' && !detenido) programarSubida();
  }

  function sincronizar() {
    if (detenido) return Promise.resolve();
    if (enCurso) { otraVez = true; return enCurso; }
    enCurso = (async () => {
      do { otraVez = false; await correr(); } while (otraVez && !detenido);
      enCurso = null;
    })();
    return enCurso;
  }

  const alVolver = () => { if (!ventana?.document || ventana.document.visibilityState !== 'hidden') sincronizar(); };

  function iniciar() {
    const guardado = disco.leer(clave(empresaId));
    if (guardado) { recs = guardado.recs || {}; orden = guardado.orden || []; }
    ventana?.addEventListener?.('online', alVolver);
    ventana?.document?.addEventListener?.('visibilitychange', alVolver);
    if (intervaloMs) timerBajar = setInterval(() => sincronizar(), intervaloMs);
    sincronizar();
    return lista();
  }

  function detener() {
    detenido = true;
    clearTimeout(timerSubir);
    clearInterval(timerBajar);
    ventana?.removeEventListener?.('online', alVolver);
    ventana?.document?.removeEventListener?.('visibilitychange', alVolver);
    oyentes = new Set();
  }

  function olvidarDatos() {
    detener();
    olvidado = true;
    disco.borrar(clave(empresaId));
    recs = {};
    orden = [];
  }

  function suscribir(fn) {
    oyentes.add(fn);
    return () => oyentes.delete(fn);
  }

  return {
    iniciar, detener, olvidarDatos, sincronizar, actualizar, suscribir, lista, pendientes,
    get estado() { return estado; },
    tieneDatos: () => Object.keys(recs).length > 0 || !!disco.leer(clave(empresaId)),
  };
}
