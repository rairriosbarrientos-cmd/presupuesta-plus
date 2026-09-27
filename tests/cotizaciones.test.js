import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  precioVigente, variacionPrecio, costoDirectoConcepto, calcularEjecucion, explosionInsumos,
  congelar, siguienteFolio, normalizarCatalogo, csvPresupuesto,
} from '../src/cotizaciones/calculo.js';

const catalogo = normalizarCatalogo({
  zonas: [{ id: 'gro', nombre: 'Guerrero' }],
  insumos: [
    { id: 'cem', clave: 'CEM', descripcion: 'Cemento', unidad: 'ton', categoria: 'material', precios: [
      { id: 'p1', zonaId: '', fecha: '2026-09-01', precio: 3000 },
      { id: 'p2', zonaId: 'gro', fecha: '2026-09-14', precio: 3200 },
      { id: 'p3', zonaId: 'gro', fecha: '2026-09-21', precio: 3360 },
    ] },
    { id: 'peon', clave: 'MO', descripcion: 'Peón', unidad: 'jor', categoria: 'mano_obra', precios: [{ id: 'p4', zonaId: '', fecha: '2026-09-01', precio: 500 }] },
  ],
  conceptos: [{ id: 'c1', clave: 'CON-01', descripcion: 'Concreto f\'c=200', unidad: 'm³', partida: 'Estructura', matriz: [
    { id: 'm1', insumoId: 'cem', rendimiento: 0.35 }, { id: 'm2', insumoId: 'peon', rendimiento: 0.5 },
  ] }],
});

test('precio vigente por zona, fecha y respaldo general', () => {
  const cem = catalogo.insumos[0];
  assert.equal(precioVigente(cem, 'gro').precio, 3360);
  assert.equal(precioVigente(cem, 'gro', '2026-09-15').precio, 3200);
  assert.equal(precioVigente(cem, 'gro', '2026-09-10').precio, 3000); // antes del primero de la zona → general
  assert.equal(precioVigente(cem, 'otra').precio, 3000);
  assert.equal(precioVigente(cem, '', '2026-08-01'), null);
  assert.equal(Math.round(variacionPrecio(cem, 'gro').pct), 5);
});

test('costo directo y precio de venta con indirectos, financiamiento y utilidad', () => {
  const cd = costoDirectoConcepto(catalogo.conceptos[0], catalogo, 'gro');
  assert.equal(cd.total, 0.35 * 3360 + 0.5 * 500);
  assert.equal(cd.porCategoria.mano_obra, 250);
  const cot = { lineas: [{ id: 'l1', conceptoId: 'c1', clave: 'CON-01', cantidad: 10 }, { id: 'l2', clave: 'X', cantidad: 2, puManual: 100 }],
    zonaId: 'gro', indirectosPct: 10, financiamientoPct: 0, utilidadPct: 10, ivaPct: 16, anticipoPct: 30 };
  const r = calcularEjecucion(cot, catalogo);
  assert.equal(r.lineas[0].pu, Math.round(1426 * 1.21 * 100) / 100);
  assert.equal(r.lineas[1].pu, 121);
  assert.equal(r.subtotal, r.lineas[0].importe + r.lineas[1].importe);
  assert.equal(r.total, r.subtotal + r.iva);
  assert.ok(Math.abs(r.costoDirecto - (14260 + 200)) < 1e-9);
});

test('una cotización enviada conserva sus precios aunque suba el catálogo', () => {
  const cot = congelar({ lineas: [{ id: 'l1', conceptoId: 'c1', cantidad: 1 }], zonaId: 'gro', indirectosPct: 0, financiamientoPct: 0, utilidadPct: 0, ivaPct: 0 }, catalogo, '2026-09-22');
  const antes = calcularEjecucion(cot, catalogo).total;
  const subio = normalizarCatalogo({ ...catalogo, insumos: catalogo.insumos.map((i) => (i.id === 'cem' ? { ...i, precios: [...i.precios, { id: 'p9', zonaId: 'gro', fecha: '2026-09-28', precio: 4000 }] } : i)) });
  assert.equal(calcularEjecucion(cot, subio).total, antes);
  assert.ok(calcularEjecucion(cot, subio, { enVivo: true }).total > antes);
});

test('explosión de insumos, CSV y folios', () => {
  const cot = { id: 'q1', folio: 'P-001', nombre: 'Casa', lineas: [{ id: 'l1', conceptoId: 'c1', clave: 'CON-01', descripcion: 'Concreto "especial"', unidad: 'm³', cantidad: 10 }],
    zonaId: 'gro', indirectosPct: 0, financiamientoPct: 0, utilidadPct: 0, ivaPct: 16 };
  const ex = explosionInsumos(cot, catalogo);
  assert.equal(ex[0].insumo.id, 'cem');
  assert.equal(ex[0].cantidad, 3.5);
  assert.equal(ex[1].cantidad, 5);
  const csv = csvPresupuesto(cot, catalogo);
  assert.ok(csv.includes('"Concreto ""especial"""'));
  assert.ok(csv.includes('"Total"'));
  const regs = [{ tipo: 'cotizacion', folio: 'P-004' }, { tipo: 'cotizacion', folio: 'P-001' }, { id: 'catalogo-precios', tipo: 'catalogo' }];
  assert.equal(siguienteFolio(regs), 'P-005');
  assert.equal(siguienteFolio([]), 'P-001');
});
