// Presupuestos de obra: catálogo de precios por zona, precios unitarios (APU) y totales.
// Todo vive en registros sincronizados de la empresa, marcados con `tipo`:
//   tipo 'catalogo'   → un solo registro por empresa (id CATALOGO_ID) con zonas, insumos con historial de precios y conceptos con su matriz.
//   tipo 'cotizacion' → un presupuesto: conceptos con volumen, sobrecosto e IVA.

export const CATALOGO_ID = 'catalogo-precios';
export const ESTADOS_COTIZACION = ['borrador', 'enviada', 'aceptada', 'rechazada'];
export const CATEGORIAS_INSUMO = { material: 'Material', mano_obra: 'Mano de obra', equipo: 'Equipo' };

export const esCotizacion = (r) => r?.tipo === 'cotizacion';

const n = (v) => { const x = parseFloat(v); return Number.isFinite(x) ? x : 0; };
const pct = (v) => n(v) / 100;

export function catalogoVacio() {
  return { id: CATALOGO_ID, tipo: 'catalogo', nombre: 'Catálogo de precios', zonas: [], insumos: [], conceptos: [] };
}
export function normalizarCatalogo(c) {
  return { ...catalogoVacio(), ...(c || {}), zonas: c?.zonas || [], insumos: c?.insumos || [], conceptos: c?.conceptos || [] };
}

// Precio de un insumo en una zona a una fecha: el registro más reciente de esa zona;
// si la zona no tiene, el más reciente general (zona vacía). Devuelve { precio, fecha, zonaId } o null.
export function precioVigente(insumo, zonaId = '', fecha = '9999-12-31') {
  const lista = (insumo?.precios || []).filter((p) => (p.fecha || '') <= fecha);
  const ultimo = (zona) => lista.filter((p) => (p.zonaId || '') === zona)
    .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0))[0];
  const p = (zonaId && ultimo(zonaId)) || ultimo('');
  return p ? { precio: n(p.precio), fecha: p.fecha, zonaId: p.zonaId || '' } : null;
}

// Variación del precio vigente contra el anterior de la misma zona (para la vista semanal).
export function variacionPrecio(insumo, zonaId = '', fecha) {
  const actual = precioVigente(insumo, zonaId, fecha);
  if (!actual) return null;
  const antes = new Date(`${actual.fecha}T00:00:00`);
  antes.setDate(antes.getDate() - 1);
  const previo = precioVigente(insumo, actual.zonaId, isoDe(antes));
  if (!previo || previo.precio <= 0) return { actual, previo: null, pct: null };
  return { actual, previo, pct: ((actual.precio - previo.precio) / previo.precio) * 100 };
}

export function isoDe(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Costo directo unitario de un concepto del catálogo con los precios de la zona.
export function costoDirectoConcepto(concepto, catalogo, zonaId, fecha) {
  const porCategoria = { material: 0, mano_obra: 0, equipo: 0 };
  const faltantes = [];
  let total = 0;
  for (const m of concepto?.matriz || []) {
    const insumo = catalogo.insumos.find((i) => i.id === m.insumoId);
    const pv = insumo ? precioVigente(insumo, zonaId, fecha) : null;
    if (!pv) { faltantes.push(insumo?.descripcion || 'insumo eliminado'); continue; }
    const importe = n(m.rendimiento) * pv.precio;
    total += importe;
    porCategoria[insumo.categoria in porCategoria ? insumo.categoria : 'material'] += importe;
  }
  return { total, porCategoria, faltantes };
}

// Factor de sobrecosto: indirectos, financiamiento y utilidad en cascada sobre el costo directo.
export function factorSobrecosto(c) {
  return (1 + pct(c.indirectosPct)) * (1 + pct(c.financiamientoPct)) * (1 + pct(c.utilidadPct));
}

// Costo directo unitario de una línea: manual > congelado (cotización enviada) > catálogo en vivo.
export function costoDirectoLinea(linea, cotizacion, catalogo, { enVivo = false } = {}) {
  if (linea.puManual != null && linea.puManual !== '') return n(linea.puManual);
  const congelado = cotizacion.congelado?.cd?.[linea.id];
  if (!enVivo && congelado != null) return n(congelado);
  const concepto = catalogo.conceptos.find((c) => c.id === linea.conceptoId);
  return concepto ? costoDirectoConcepto(concepto, catalogo, cotizacion.zonaId, cotizacion.congelado && !enVivo ? cotizacion.congelado.fecha : undefined).total : 0;
}

export function calcularEjecucion(cotizacion, catalogo, opciones = {}) {
  const factor = factorSobrecosto(cotizacion);
  const lineas = (cotizacion.lineas || []).map((l) => {
    const cd = costoDirectoLinea(l, cotizacion, catalogo, opciones);
    const pu = redondear(cd * factor);
    const cantidad = n(l.cantidad);
    return { ...l, cantidad, cd, pu, importe: redondear(pu * cantidad), cdImporte: cd * cantidad };
  });
  const costoDirecto = lineas.reduce((s, l) => s + l.cdImporte, 0);
  const indirectos = costoDirecto * pct(cotizacion.indirectosPct);
  const financiamiento = (costoDirecto + indirectos) * pct(cotizacion.financiamientoPct);
  const subtotal = lineas.reduce((s, l) => s + l.importe, 0);
  const utilidad = subtotal - costoDirecto - indirectos - financiamiento;
  const iva = redondear(subtotal * pct(cotizacion.ivaPct));
  const total = subtotal + iva;
  const partidas = agruparPorPartida(lineas);
  return { lineas, partidas, factor, costoDirecto, indirectos, financiamiento, utilidad, subtotal, iva, total, anticipo: total * pct(cotizacion.anticipoPct) };
}

function agruparPorPartida(lineas) {
  const mapa = new Map();
  for (const l of lineas) {
    const k = l.partida || 'Sin partida';
    if (!mapa.has(k)) mapa.set(k, { partida: k, importe: 0, lineas: [] });
    const g = mapa.get(k);
    g.importe += l.importe;
    g.lineas.push(l);
  }
  return [...mapa.values()];
}

// Explosión de insumos: cuánto material, mano de obra y equipo pide la cotización completa, y su costo.
export function explosionInsumos(cotizacion, catalogo) {
  const mapa = new Map();
  const fecha = cotizacion.congelado?.fecha;
  for (const l of cotizacion.lineas || []) {
    if (l.puManual != null && l.puManual !== '') continue;
    const concepto = catalogo.conceptos.find((c) => c.id === l.conceptoId);
    for (const m of concepto?.matriz || []) {
      const insumo = catalogo.insumos.find((i) => i.id === m.insumoId);
      if (!insumo) continue;
      const cantidad = n(m.rendimiento) * n(l.cantidad);
      const precio = precioVigente(insumo, cotizacion.zonaId, fecha)?.precio || 0;
      const actual = mapa.get(insumo.id) || { insumo, cantidad: 0, precio, importe: 0 };
      actual.cantidad += cantidad;
      actual.importe += cantidad * precio;
      mapa.set(insumo.id, actual);
    }
  }
  return [...mapa.values()].sort((a, b) => b.importe - a.importe);
}

export function totalCotizacion(cotizacion, catalogo) {
  return calcularEjecucion(cotizacion, catalogo).total;
}

// Al enviar una cotización se congelan sus costos directos para que el PDF que tiene el cliente no cambie solo.
export function congelar(cotizacion, catalogo, fecha) {
  const cd = {};
  for (const l of cotizacion.lineas || []) cd[l.id] = costoDirectoLinea(l, { ...cotizacion, congelado: null }, catalogo);
  return { ...cotizacion, congelado: { fecha, cd } };
}

export function siguienteFolio(registros, prefijo = 'P') {
  const max = registros.filter(esCotizacion)
    .reduce((m, r) => Math.max(m, parseInt(String(r.folio || '').split('-')[1], 10) || 0), 0);
  return `${prefijo}-${String(max + 1).padStart(3, '0')}`;
}

export function vence(cotizacion) {
  if (!cotizacion.fecha) return null;
  const d = new Date(`${cotizacion.fecha}T00:00:00`);
  d.setDate(d.getDate() + (parseInt(cotizacion.vigenciaDias, 10) || 0));
  return isoDe(d);
}

// Presupuesto en CSV (abre en Excel): conceptos con cantidades, precios e importes, y totales.
export function csvPresupuesto(cotizacion, catalogo) {
  const r = calcularEjecucion(cotizacion, catalogo);
  const celda = (v) => (typeof v === 'number' ? v.toFixed(2) : `"${String(v ?? '').replace(/"/g, '""')}"`);
  const filas = [['Partida', 'Clave', 'Concepto', 'Unidad', 'Cantidad', 'Costo directo', 'P. unitario', 'Importe']];
  for (const l of r.lineas) filas.push([l.partida || 'Sin partida', l.clave, l.descripcion, l.unidad, l.cantidad, l.cd, l.pu, l.importe]);
  filas.push([]);
  for (const [k, v] of [['Costo directo', r.costoDirecto], ['Indirectos', r.indirectos], ['Financiamiento', r.financiamiento], ['Utilidad', r.utilidad], ['Subtotal', r.subtotal], ['IVA', r.iva], ['Total', r.total]]) {
    filas.push(['', '', k, '', '', '', '', v]);
  }
  return '\uFEFF' + filas.map((f) => f.map(celda).join(',')).join('\r\n');
}

export function redondear(v) { return Math.round((v + Number.EPSILON) * 100) / 100; }

// ---------- Importar insumos desde Excel/CSV ----------
const sinAcentos = (t) => String(t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
function columna(fila, nombres) {
  for (const k of Object.keys(fila)) if (nombres.includes(sinAcentos(k))) return fila[k];
  return undefined;
}
function categoriaDe(t) {
  const c = sinAcentos(t);
  if (/mano|^mo$|obra|jornal|cuadrilla/.test(c)) return 'mano_obra';
  if (/equipo|maquin|herramient/.test(c)) return 'equipo';
  return 'material';
}
const numero = (v) => { const x = parseFloat(String(v ?? '').replace(/[$,\s]/g, '')); return Number.isFinite(x) ? x : null; };

// filas: objetos con encabezados (clave, descripción, unidad, tipo, precio). Actualiza por clave o agrega nuevos;
// el precio se registra como precio de `fecha` en la zona elegida (o '' = general).
export function importarInsumos(catalogo, filas, { zonaId = '', fecha, nuevoId }) {
  const insumos = catalogo.insumos.map((i) => ({ ...i, precios: [...(i.precios || [])] }));
  const resumen = { nuevos: 0, actualizados: 0, precios: 0, omitidas: 0 };
  for (const fila of filas) {
    const clave = String(columna(fila, ['clave', 'codigo', 'id']) ?? '').trim();
    const descripcion = String(columna(fila, ['descripcion', 'insumo', 'nombre', 'concepto']) ?? '').trim();
    if (!clave || !descripcion) { resumen.omitidas++; continue; }
    const unidad = String(columna(fila, ['unidad', 'um', 'u.m.']) ?? '').trim() || 'pza';
    const tipo = columna(fila, ['tipo', 'categoria', 'clase']);
    const precio = numero(columna(fila, ['precio', 'precio unitario', 'costo', 'pu', 'importe']));
    let ins = insumos.find((i) => sinAcentos(i.clave) === sinAcentos(clave));
    if (ins) {
      Object.assign(ins, { descripcion, unidad, ...(tipo != null && tipo !== '' ? { categoria: categoriaDe(tipo) } : {}) });
      resumen.actualizados++;
    } else {
      ins = { id: nuevoId(), clave, descripcion, unidad, categoria: categoriaDe(tipo), precios: [] };
      insumos.push(ins);
      resumen.nuevos++;
    }
    if (precio != null && precio > 0) {
      ins.precios = ins.precios.filter((p) => !((p.zonaId || '') === zonaId && p.fecha === fecha));
      ins.precios.push({ id: nuevoId(), zonaId, fecha, precio });
      resumen.precios++;
    }
  }
  return { catalogo: { ...catalogo, insumos }, resumen };
}

export const PLANTILLA_INSUMOS = '﻿Clave,Descripción,Unidad,Tipo,Precio\r\nCEM-01,Cemento gris 50 kg,ton,Material,3200\r\nARE-01,Arena,m³,Material,450\r\nMO-01,Peón,jor,Mano de obra,500\r\nEQ-01,Revolvedora 1 saco,hr,Equipo,120\r\n';
