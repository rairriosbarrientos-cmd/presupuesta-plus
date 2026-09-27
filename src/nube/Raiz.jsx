import { useEffect, useMemo, useState } from 'react';
import App from '../App.jsx';
import { APP, rpcDe, tablaDe } from '../config.js';
import { leerConfig, obtenerCliente, traducirError } from './cliente.js';
import { crearSincronizador } from './sincronizador.js';
import { Cargando, Entrar, ElegirEmpresa, CuentaSheet, EsperandoAprobacion, LicenciaBloqueada } from './Acceso.jsx';
import { PanelPlataforma } from './Plataforma.jsx';

const membresiasKey = (uid) => `${APP.claveLocal}-membresias:${uid}`;
const empresaKey = (uid) => `${APP.claveLocal}-empresa:${uid}`;

function leer(k) { try { const raw = localStorage.getItem(k); return raw ? JSON.parse(raw) : null; } catch (e) { return null; } }
function escribir(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* bloqueado */ } }

export default function Raiz() {
  const config = useMemo(leerConfig, []);
  return <ConNube config={config} />;
}

function ConNube({ config }) {
  const supabase = useMemo(() => obtenerCliente(config), [config.url, config.anonKey]);
  const [sesion, setSesion] = useState(undefined);

  useEffect(() => {
    let vivo = true;
    supabase.auth.getSession().then(({ data }) => { if (vivo) setSesion(data.session ?? null); });
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, s) => setSesion(s ?? null));
    return () => { vivo = false; sub.subscription.unsubscribe(); };
  }, [supabase]);

  if (sesion === undefined) return <Cargando />;
  if (!sesion) return <Entrar supabase={supabase} />;
  return <ConSesion key={sesion.user.id} supabase={supabase} usuario={sesion.user} />;
}

function ConSesion({ supabase, usuario }) {
  const uid = usuario.id;
  const [membresias, setMembresias] = useState(() => leer(membresiasKey(uid)));
  const [errorCarga, setErrorCarga] = useState(null);
  const [empresaId, setEmpresaId] = useState(() => leer(empresaKey(uid)));
  const [eligiendo, setEligiendo] = useState(false);
  const [soyDueno, setSoyDueno] = useState(false);
  const [verPanel, setVerPanel] = useState(false);
  useEffect(() => { supabase.rpc('es_admin_plataforma').then(({ data }) => setSoyDueno(data === true)); }, [uid]);

  async function cargarMembresias() {
    const { data, error } = await supabase.rpc(rpcDe('mis_empresas'));
    if (error) {
      // Sin señal se sigue con lo guardado en el celular.
      setErrorCarga(traducirError(error));
      setMembresias((m) => m ?? []);
      return null;
    }
    const lista = (data || []).map((m) => ({ id: m.id, nombre: m.nombre, codigo: m.codigo, rol: m.rol, licencia: m.licencia || 'activa', vence: m.vence, max_usuarios: m.max_usuarios }));
    escribir(membresiasKey(uid), lista);
    setErrorCarga(null);
    setMembresias(lista);
    return lista;
  }
  useEffect(() => { cargarMembresias(); }, [uid]);

  function elegir(id) {
    escribir(empresaKey(uid), id);
    setEmpresaId(id);
    setEligiendo(false);
  }

  async function cerrarSesion(motor) {
    const n = motor?.pendientes() || 0;
    if (n && !window.confirm(`Hay ${n} cambio${n === 1 ? '' : 's'} sin subir. Si cierras sesión ahora se perderán. ¿Cerrar de todos modos?`)) return;
    motor?.olvidarDatos();
    // En celulares compartidos no se dejan datos de la empresa al salir.
    for (const m of membresias || []) crearSincronizador({ supabase, empresaId: m.id, rol: m.rol, ventana: null }).olvidarDatos();
    escribir(membresiasKey(uid), null);
    escribir(empresaKey(uid), null);
    await supabase.auth.signOut({ scope: 'local' });
  }

  if (verPanel) return <PanelPlataforma supabase={supabase} onCerrar={() => { setVerPanel(false); cargarMembresias(); }} />;
  if (!membresias) return <Cargando />;
  const empresa = membresias.find((m) => m.id === empresaId) || (membresias.length === 1 && !eligiendo ? membresias[0] : null);
  if (!empresa || eligiendo) {
    return (
      <ElegirEmpresa supabase={supabase} email={usuario.email} membresias={membresias} errorCarga={membresias.length ? null : errorCarga}
        onElegir={elegir} onCreada={async (id) => { await cargarMembresias(); elegir(id); }} onSalir={() => cerrarSesion(null)} />
    );
  }
  if (empresa.rol === 'pendiente') {
    return (
      <EsperandoAprobacion supabase={supabase} empresa={empresa} email={usuario.email} userId={uid}
        onActualizar={cargarMembresias}
        onOtraEmpresa={() => setEligiendo(true)}
        onCancelada={() => { escribir(empresaKey(uid), null); setEmpresaId(null); cargarMembresias(); }}
        onSalir={() => cerrarSesion(null)} />
    );
  }
  if (empresa.licencia === 'pendiente' || empresa.licencia === 'suspendida') {
    return (
      <LicenciaBloqueada empresa={empresa} email={usuario.email} soyDueno={soyDueno} onAbrirPanel={() => setVerPanel(true)}
        onActualizar={cargarMembresias} onOtraEmpresa={() => setEligiendo(true)} onSalir={() => cerrarSesion(null)} />
    );
  }
  return (
    <ConEmpresa key={`${empresa.id}:${empresa.rol}:${empresa.licencia}`} soyDueno={soyDueno} onAbrirPanel={() => setVerPanel(true)} supabase={supabase} usuario={usuario} empresa={empresa} variasEmpresas={membresias.length > 1}
      onCambiarEmpresa={() => setEligiendo(true)}
      onCerrarSesion={cerrarSesion}
      onDejarEmpresa={(motor) => { motor.olvidarDatos(); escribir(empresaKey(uid), null); setEmpresaId(null); cargarMembresias(); }}
      onRolCambiado={cargarMembresias} />
  );
}

function ConEmpresa({ supabase, usuario, empresa, variasEmpresas, soyDueno, onAbrirPanel, onCambiarEmpresa, onCerrarSesion, onDejarEmpresa, onRolCambiado }) {
  const [motor, setMotor] = useState(null);
  const [verCuenta, setVerCuenta] = useState(false);
  const [solicitudes, setSolicitudes] = useState(0);
  const esAdmin = empresa.rol === 'admin';
  // Con licencia vencida todos quedan en solo lectura (el servidor también lo exige).
  const rolEfectivo = empresa.licencia === 'vencida' ? 'lector' : empresa.rol;

  // Al admin se le avisa de solicitudes de entrada nuevas.
  async function contarSolicitudes() {
    if (!esAdmin) return;
    const { count, error } = await supabase.from(tablaDe('miembros')).select('user_id', { count: 'exact', head: true }).eq('empresa_id', empresa.id).eq('rol', 'pendiente');
    if (!error) setSolicitudes(count || 0);
  }
  useEffect(() => {
    if (!esAdmin) return undefined;
    contarSolicitudes();
    const t = setInterval(contarSolicitudes, 60000);
    return () => clearInterval(t);
  }, [supabase, empresa.id, esAdmin]);

  useEffect(() => {
    const m = crearSincronizador({ supabase, empresaId: empresa.id, rol: rolEfectivo });
    m.iniciar();
    setMotor(m);
    return () => { m.detener(); setMotor(null); };
  }, [supabase, empresa.id, rolEfectivo]);

  if (!motor) return <Cargando texto="Preparando tu información..." />;
  return (
    <>
      <App nube={motor} cuenta={{ empresa: empresa.nombre, email: usuario.email, solicitudes, aviso: empresa.licencia === 'vencida' ? 'Licencia vencida' : null, onAbrir: () => { setVerCuenta(true); onRolCambiado(); } }} />
      {verCuenta && (
        <CuentaSheet supabase={supabase} empresa={empresa} soyDueno={soyDueno} onAbrirPanel={() => { setVerCuenta(false); onAbrirPanel(); }} email={usuario.email} userId={usuario.id} pendientes={motor.pendientes()} variasEmpresas={variasEmpresas}
          onCerrar={() => { setVerCuenta(false); contarSolicitudes(); }}
          onEquipoCambiado={contarSolicitudes}
          onCambiarEmpresa={() => { setVerCuenta(false); onCambiarEmpresa(); }}
          onCerrarSesion={() => onCerrarSesion(motor)}
          onDejarEmpresa={() => onDejarEmpresa(motor)} />
      )}
    </>
  );
}
