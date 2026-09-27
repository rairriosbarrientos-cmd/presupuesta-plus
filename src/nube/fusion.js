// Fusión de cambios entre celulares.
// base = lo último que este celular sabía del servidor; local = lo que tiene ahora; remoto = lo que hay en el servidor.
// Se fusiona campo por campo y, en las listas con id (estaciones, conceptos, ejecuciones...), elemento por elemento.
// Si los dos cambiaron exactamente lo mismo de forma distinta, gana el cambio local (el de quien está capturando).

export function igual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!igual(a[i], b[i])) return false;
    return true;
  }
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!Object.prototype.hasOwnProperty.call(b, k) || !igual(a[k], b[k])) return false;
  return true;
}

const esObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const esListaConId = (v) => Array.isArray(v) && v.every((x) => esObjeto(x) && x.id != null);

function fusionarListas(base, local, remoto) {
  const porId = (lista) => new Map((lista || []).map((x) => [x.id, x]));
  const mb = porId(base);
  const ml = porId(local);
  const mr = porId(remoto);
  const resultado = [];
  const vistos = new Set();

  const decidir = (id) => {
    const b = mb.get(id);
    const l = ml.get(id);
    const r = mr.get(id);
    if (l && r) return fusionar3(b, l, r);
    if (l && !r) {
      // No está en el servidor: o es nuevo aquí, o alguien lo borró. Si lo borraron y aquí no se tocó, se va.
      if (b && igual(b, l)) return undefined;
      return l;
    }
    if (!l && r) {
      // No está aquí: o es nuevo en el servidor, o aquí se borró. Si aquí se borró y allá no se tocó, se va.
      if (b && igual(b, r)) return undefined;
      return r;
    }
    return undefined;
  };

  // Se respeta el orden del servidor y se agregan al final los nuevos de este celular.
  for (const x of remoto || []) {
    vistos.add(x.id);
    const v = decidir(x.id);
    if (v !== undefined) resultado.push(v);
  }
  for (const x of local || []) {
    if (vistos.has(x.id)) continue;
    vistos.add(x.id);
    const v = decidir(x.id);
    if (v !== undefined) resultado.push(v);
  }
  return resultado;
}

export function fusionar3(base, local, remoto) {
  if (igual(local, remoto)) return local;
  if (base !== undefined && igual(local, base)) return remoto;
  if (base !== undefined && igual(remoto, base)) return local;

  if (esListaConId(local) && esListaConId(remoto) && (base === undefined || esListaConId(base))) {
    return fusionarListas(base, local, remoto);
  }
  if (esObjeto(local) && esObjeto(remoto)) {
    const b = esObjeto(base) ? base : {};
    const resultado = {};
    const claves = new Set([...Object.keys(remoto), ...Object.keys(local)]);
    for (const k of claves) {
      const enL = Object.prototype.hasOwnProperty.call(local, k);
      const enR = Object.prototype.hasOwnProperty.call(remoto, k);
      const enB = Object.prototype.hasOwnProperty.call(b, k);
      let v;
      if (enL && enR) v = fusionar3(enB ? b[k] : undefined, local[k], remoto[k]);
      else if (enL) v = enB && igual(b[k], local[k]) ? undefined : local[k];
      else v = enB && igual(b[k], remoto[k]) ? undefined : remoto[k];
      if (v !== undefined) resultado[k] = v;
    }
    return resultado;
  }
  return local;
}

// Aplica a la lista de la app solo los proyectos que cambiaron en la nube,
// sin pisar lo demás que el usuario tenga en pantalla.
export function aplicarCambios(proyectos, { actualizados = [], borrados = [] }) {
  if (!actualizados.length && !borrados.length) return proyectos;
  const quitar = new Set(borrados);
  const nuevos = new Map(actualizados.map((p) => [p.id, p]));
  const resultado = [];
  for (const p of proyectos) {
    if (quitar.has(p.id)) continue;
    if (nuevos.has(p.id)) { resultado.push(nuevos.get(p.id)); nuevos.delete(p.id); } else resultado.push(p);
  }
  for (const p of nuevos.values()) resultado.push(p);
  return resultado;
}
