# Presupuesta+

Presupuestos de obra con precios unitarios por zona que se actualizan cada semana. Funciona sin internet.

## Qué hace
- **Catálogo de precios**: insumos (material, mano de obra, equipo) con historial de precios por zona. Botón *Actualizar precios de la semana* para capturar solo lo que cambió.
- **Conceptos con matriz (APU)**: cada concepto dice qué insumos lleva por unidad; su costo directo se recalcula solo con los precios vigentes de la zona.
- **Presupuestos**: conceptos con volumen, indirectos, financiamiento, utilidad, IVA, anticipo y **explosión de insumos**.
- **Precio congelado al enviar**: el PDF que tiene el cliente no cambia; la app avisa cuánto saldría con los precios de hoy.
- **PDF** por partidas y **Excel (CSV)**.
- **Cuentas por empresa**: código de invitación con aprobación, roles (admin, captura, solo lectura) y licencias que activa el dueño.

## Servidor (Supabase)
Usa tablas propias con prefijo `pres_` (`pres_empresas`, `pres_miembros`, `pres_registros`) y funciones `pres_*`.
Comparte con la plataforma solo `plataforma_admins`, `es_admin_plataforma()` y `_nuevo_codigo()`; la migración los crea solo si faltan.

1. Aplica `supabase/migrations/001_cuentas.sql` en el SQL Editor (se puede correr más de una vez).
2. Para ser dueño (activar licencias): `insert into public.plataforma_admins (user_id) values ('<tu user id>');`
3. La URL y la llave publishable están en `src/nube/cliente.js` (o variables `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`).

## Publicar (Netlify)
Importa el repo en Netlify; `netlify.toml` ya trae el build (`npm run build`, carpeta `dist`).

## Pruebas
```bash
npm test                                                    # cálculos y sincronización
PGHOST=/tmp PGPORT=5433 PGUSER=postgres bash supabase/tests/correr.sh   # seguridad de la base (Postgres local)
```
