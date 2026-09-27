// Prueba con 3 celulares simulados contra un Supabase falso en memoria.
// Correr con: npm test
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { crearSincronizador } from '../src/nube/sincronizador.js';
import { aplicarCambios, fusionar3 } from '../src/nube/fusion.js';
import { crearServidor, crearAlmacen } from './supabaseFalso.js';

const EMPRESA = 'emp-a';
const abiertos = [];
afterEach(() => { while (abiertos.length) abiertos.pop().motor.detener(); });

// Un "celular": su propio almacenamiento, su conexión y la lista que vería la app en pantalla.
function celular(servidor, usuario, { rol = 'editor', almacen = crearAlmacen() } = {}) {
  servidor.ponerRol(EMPRESA, usuario, rol);
  const supabase = servidor.cliente(usuario);
  const cel = { supabase, almacen, pantalla: [] };
  cel.motor = crearSincronizador({ supabase, empresaId: EMPRESA, rol, almacen, ventana: null, esperaMs: 60000, intervaloMs: 0 });
  cel.motor.suscribir((aviso) => { cel.pantalla = aplicarCambios(cel.pantalla, aviso); cel.ultimoAviso = aviso; });
  cel.pantalla = cel.motor.iniciar();
  cel.editar = (fn) => { cel.pantalla = fn(cel.pantalla); cel.motor.actualizar(cel.pantalla); };
  cel.sync = () => cel.motor.sincronizar();
  cel.offline = () => { supabase.red.conectado = false; };
  cel.online = () => { supabase.red.conectado = true; };
  abiertos.push(cel);
  return cel;
}

const proyecto = (id, extra = {}) => ({ id, nombre: `Proyecto ${id}`, estaciones: [], conceptos: [], ejecuciones: [], ...extra });
const editarProyecto = (id, fn) => (lista) => lista.map((p) => (p.id === id ? fn(p) : p));

async function todosSync(...cels) {
  for (let i = 0; i < 2; i++) for (const c of cels) await c.sync();
}

function assertConvergen(servidor, ...cels) {
  const enServidor = servidor.proyectos(EMPRESA).sort((a, b) => a.id.localeCompare(b.id));
  for (const c of cels) {
    const pantalla = [...c.pantalla].sort((a, b) => a.id.localeCompare(b.id));
    assert.deepEqual(pantalla, enServidor);
    assert.equal(c.motor.pendientes(), 0);
    assert.equal(c.motor.estado, 'sincronizado');
  }
}

test('un proyecto creado en un celular llega a los otros dos', async () => {
  const s = crearServidor();
  const [a, b, c] = [celular(s, 'u1'), celular(s, 'u2'), celular(s, 'u3')];
  a.editar((l) => [...l, proyecto('p1')]);
  await todosSync(a, b, c);
  assert.equal(b.pantalla[0].nombre, 'Proyecto p1');
  assertConvergen(s, a, b, c);
});

test('dos celulares sin señal editan cosas distintas y al volver se juntan ambas', async () => {
  const s = crearServidor();
  const [a, b, c] = [celular(s, 'u1'), celular(s, 'u2'), celular(s, 'u3')];
  a.editar((l) => [...l, proyecto('p1', { conceptos: [{ id: 'c1', clave: 'E-1', cantidadProyectada: 10 }] })]);
  await todosSync(a, b, c);

  b.offline(); c.offline();
  b.editar(editarProyecto('p1', (p) => ({ ...p, conceptos: p.conceptos.map((x) => ({ ...x, cantidadProyectada: 25 })) })));
  c.editar(editarProyecto('p1', (p) => ({ ...p, ejecuciones: [...p.ejecuciones, { id: 'e1', conceptoId: 'c1', cantidad: 4 }] })));
  c.editar(editarProyecto('p1', (p) => ({ ...p, conceptos: [...p.conceptos, { id: 'c2', clave: 'E-2' }] })));
  await b.sync(); await c.sync();
  assert.equal(b.motor.estado, 'sin conexión');
  assert.equal(c.motor.pendientes(), 1);

  b.online(); c.online();
  await todosSync(b, c, a);
  const p = a.pantalla[0];
  assert.equal(p.conceptos.find((x) => x.id === 'c1').cantidadProyectada, 25);
  assert.equal(p.conceptos.length, 2);
  assert.equal(p.ejecuciones.length, 1);
  assertConvergen(s, a, b, c);
});

test('el mismo dato cambiado en dos celulares: todos terminan con el mismo valor', async () => {
  const s = crearServidor();
  const [a, b, c] = [celular(s, 'u1'), celular(s, 'u2'), celular(s, 'u3')];
  a.editar((l) => [...l, proyecto('p1')]);
  await todosSync(a, b, c);
  b.editar(editarProyecto('p1', (p) => ({ ...p, nombre: 'Nombre de B' })));
  c.editar(editarProyecto('p1', (p) => ({ ...p, nombre: 'Nombre de C' })));
  await b.sync(); await c.sync();
  await todosSync(a, b, c);
  assert.equal(a.pantalla[0].nombre, 'Nombre de C');
  assertConvergen(s, a, b, c);
});

test('borrar un proyecto se replica, pero si otro lo editó sin señal se conserva lo editado', async () => {
  const s = crearServidor();
  const [a, b, c] = [celular(s, 'u1'), celular(s, 'u2'), celular(s, 'u3')];
  a.editar((l) => [...l, proyecto('p1'), proyecto('p2')]);
  await todosSync(a, b, c);

  a.editar((l) => l.filter((p) => p.id !== 'p1'));
  await todosSync(a, b, c);
  assert.deepEqual(b.pantalla.map((p) => p.id), ['p2']);

  c.offline();
  c.editar(editarProyecto('p2', (p) => ({ ...p, nombre: 'Editado sin señal' })));
  a.editar((l) => l.filter((p) => p.id !== 'p2'));
  await a.sync();
  c.online();
  await todosSync(c, a, b);
  assert.equal(a.pantalla.find((p) => p.id === 'p2')?.nombre, 'Editado sin señal');
  assertConvergen(s, a, b, c);
});

test('lector ve los proyectos pero sus cambios no se suben y se deshacen', async () => {
  const s = crearServidor();
  const a = celular(s, 'u1');
  const lector = celular(s, 'u9', { rol: 'lector' });
  a.editar((l) => [...l, proyecto('p1')]);
  await todosSync(a, lector);
  lector.editar(editarProyecto('p1', (p) => ({ ...p, nombre: 'hack' })));
  lector.editar((l) => [...l, proyecto('p-lector')]);
  await lector.sync();
  assert.equal(s.proyectos(EMPRESA)[0].nombre, 'Proyecto p1');
  assert.deepEqual(lector.pantalla.map((p) => p.nombre), ['Proyecto p1']);
  assert.equal(lector.motor.estado, 'solo lectura');
});

test('si a un editor le quitan el permiso, sus cambios se deshacen en vez de quedarse atorados', async () => {
  const s = crearServidor();
  const a = celular(s, 'u1');
  a.editar((l) => [...l, proyecto('p1')]);
  await a.sync();
  s.ponerRol(EMPRESA, 'u1', undefined);
  a.editar(editarProyecto('p1', (p) => ({ ...p, nombre: 'sin permiso' })));
  await a.sync();
  assert.equal(a.motor.pendientes(), 0);
  assert.equal(s.proyectos(EMPRESA)[0].nombre, 'Proyecto p1');
});

test('cambios sin subir sobreviven a cerrar la app y se suben al volver la señal', async () => {
  const s = crearServidor();
  const almacen = crearAlmacen();
  const a = celular(s, 'u1', { almacen });
  a.editar((l) => [...l, proyecto('p1')]);
  await a.sync();
  a.offline();
  a.editar(editarProyecto('p1', (p) => ({ ...p, nombre: 'capturado en campo' })));
  a.editar((l) => [...l, proyecto('p2')]);
  await a.sync();
  a.motor.detener();

  const reabierto = celular(s, 'u1', { almacen });
  assert.deepEqual(reabierto.pantalla.map((p) => p.nombre), ['capturado en campo', 'Proyecto p2']);
  await reabierto.sync();
  const b = celular(s, 'u2');
  await b.sync();
  assertConvergen(s, reabierto, b);
});

test('editar mientras se está subiendo no pierde el cambio', async () => {
  const s = crearServidor();
  const [a, b] = [celular(s, 'u1'), celular(s, 'u2')];
  a.editar((l) => [...l, proyecto('p1')]);
  const subiendo = a.sync();
  a.editar(editarProyecto('p1', (p) => ({ ...p, nombre: 'durante la subida' })));
  a.editar((l) => [...l, proyecto('p2')]);
  await subiendo;
  await todosSync(a, b);
  assert.deepEqual(b.pantalla.map((p) => p.nombre).sort(), ['Proyecto p2', 'durante la subida']);
  assertConvergen(s, a, b);
});

test('borrar un proyecto nuevo mientras se sube no lo hace reaparecer', async () => {
  const s = crearServidor();
  const [a, b] = [celular(s, 'u1'), celular(s, 'u2')];
  a.editar((l) => [...l, proyecto('p1')]);
  const subiendo = a.sync();
  a.editar((l) => l.filter((p) => p.id !== 'p1'));
  await subiendo;
  await todosSync(a, b);
  assert.deepEqual(a.pantalla, []);
  assertConvergen(s, a, b);
});

test('los 3 celulares trabajando a la vez con cortes de señal terminan iguales', async () => {
  const s = crearServidor();
  const cels = [celular(s, 'u1'), celular(s, 'u2'), celular(s, 'u3')];
  cels[0].editar((l) => [...l, proyecto('p1'), proyecto('p2')]);
  await todosSync(...cels);
  let n = 0;
  for (let ronda = 0; ronda < 6; ronda++) {
    for (const [i, c] of cels.entries()) {
      if ((ronda + i) % 3 === 0) c.offline(); else c.online();
      const pid = (ronda + i) % 2 ? 'p1' : 'p2';
      c.editar(editarProyecto(pid, (p) => ({ ...p, ejecuciones: [...p.ejecuciones, { id: `e${n++}`, cantidad: ronda }] })));
      if (ronda === 3 && i === 1) c.editar((l) => [...l, proyecto('p3')]);
      await c.sync();
    }
  }
  cels.forEach((c) => c.online());
  await todosSync(...cels);
  const total = s.proyectos(EMPRESA).reduce((acc, p) => acc + p.ejecuciones.length, 0);
  assert.equal(total, n, 'no se perdió ninguna ejecución capturada');
  assertConvergen(s, ...cels);
});

test('fusión: listas con id se juntan elemento por elemento y respetan borrados', () => {
  const base = { conceptos: [{ id: 'a', v: 1 }, { id: 'b', v: 1 }, { id: 'c', v: 1 }] };
  const local = { conceptos: [{ id: 'a', v: 2 }, { id: 'c', v: 1 }, { id: 'd', v: 1 }] }; // edita a, borra b, agrega d
  const remoto = { conceptos: [{ id: 'a', v: 1 }, { id: 'b', v: 1 }, { id: 'c', v: 9 }, { id: 'e', v: 1 }] }; // edita c, agrega e
  assert.deepEqual(fusionar3(base, local, remoto), { conceptos: [{ id: 'a', v: 2 }, { id: 'c', v: 9 }, { id: 'e', v: 1 }, { id: 'd', v: 1 }] });
});

test('fusión: borrado en un lado y edición en el otro conserva la edición', () => {
  const base = { xs: [{ id: 'a', v: 1 }] };
  assert.deepEqual(fusionar3(base, { xs: [] }, { xs: [{ id: 'a', v: 2 }] }), { xs: [{ id: 'a', v: 2 }] });
  assert.deepEqual(fusionar3(base, { xs: [{ id: 'a', v: 3 }] }, { xs: [] }), { xs: [{ id: 'a', v: 3 }] });
});
