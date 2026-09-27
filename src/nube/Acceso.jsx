import { useEffect, useState } from 'react';
import { Building2, Users, Clock, UserCheck, UserX, LayoutDashboard, ShieldAlert, Copy, RefreshCw, LogOut, KeyRound, Check, ChevronRight, Eye, EyeOff, ShieldCheck, WifiOff } from 'lucide-react';
import { COLORS, FONT_SLAB, FONT_SANS, FONT_MONO, PLANO_BG, FRANJA, Sheet, Field, TextInput, Select, PrimaryButton } from '../ui.jsx';
import { APP, rpcDe, tablaDe } from '../config.js';
import { traducirError } from './cliente.js';
import { Logo, NombreMarca } from '../Marca.jsx';

const ROLES = { admin: 'Administrador', editor: 'Captura', lector: 'Solo lectura' };
const ETIQUETA_ROL = { ...ROLES, pendiente: 'Esperando aprobación' };

// Pantalla completa oscura tipo plano, con la tarjeta de captura al centro.
function Marco({ etiqueta, titulo, subtitulo, children, pie }) {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: COLORS.night, backgroundImage: PLANO_BG, backgroundSize: '24px 24px', fontFamily: FONT_SANS }}>
      <div style={{ height: 5, background: FRANJA }} />
      <div className="flex-1 w-full max-w-md mx-auto px-4 pb-10" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 36px)' }}>
        <div className="flex items-center gap-3 mb-8">
          <Logo size={52} radio={16} sombra />
          <div>
            <NombreMarca tamano={30} />
            <p className="text-xs mt-1" style={{ color: COLORS.nightSoft }}>{etiqueta}</p>
          </div>
        </div>
        <h1 className="text-[36px] font-bold leading-[1.02] tracking-tight" style={{ fontFamily: FONT_SLAB, color: '#fff' }}>{titulo}</h1>
        {subtitulo && <p className="text-[15px] mt-3 mb-6 leading-snug" style={{ color: COLORS.nightSoft }}>{subtitulo}</p>}
        <div className="rounded-3xl p-5 mt-6" style={{ background: COLORS.paper, boxShadow: '0 20px 50px rgba(0,0,0,0.35)' }}>{children}</div>
        {pie && <div className="mt-6">{pie}</div>}
      </div>
    </div>
  );
}

function MensajeError({ children }) {
  if (!children) return null;
  return <p role="alert" className="text-sm mb-4 px-3.5 py-2.5 rounded-xl font-medium" style={{ background: '#FDECEA', color: COLORS.bad, border: `1px solid ${COLORS.bad}33` }}>{children}</p>;
}
function Aviso({ children }) {
  return <p className="text-[13px] mb-4 px-3.5 py-2.5 rounded-xl" style={{ background: COLORS.paperAlt, color: COLORS.inkSoft, border: `1px solid ${COLORS.line}` }}>{children}</p>;
}
function BotonSecundario({ children, ...props }) {
  return (
    <button {...props} className="w-full py-3.5 rounded-xl text-[15px] font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
      style={{ background: COLORS.night, color: '#fff', opacity: props.disabled ? 0.4 : 1 }}>{children}</button>
  );
}
function Enlace({ children, oscuro, ...props }) {
  return <button {...props} className="w-full mt-4 py-2 text-sm font-semibold" style={{ color: oscuro ? COLORS.nightSoft : COLORS.inkSoft }}>{children}</button>;
}
function Separador({ texto }) {
  return (
    <div className="flex items-center gap-3 my-5">
      <div className="flex-1 h-px" style={{ background: COLORS.line }} />
      <span className="text-[11px] uppercase tracking-[0.15em] font-semibold" style={{ color: COLORS.inkFaint }}>{texto}</span>
      <div className="flex-1 h-px" style={{ background: COLORS.line }} />
    </div>
  );
}
function Beneficio({ icon: Icon, children }) {
  return (
    <div className="flex items-center gap-3 text-[13px]" style={{ color: COLORS.nightInk }}>
      <Icon size={16} color={COLORS.hazard} className="shrink-0" />{children}
    </div>
  );
}

export function Cargando({ texto = 'Cargando...' }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: COLORS.night, backgroundImage: PLANO_BG, backgroundSize: '24px 24px' }}>
      <div className="animate-pulse"><Logo size={64} radio={18} sombra /></div>
      <NombreMarca tamano={26} />
      <p className="text-sm" style={{ color: COLORS.nightSoft, fontFamily: FONT_SANS }}>{texto}</p>
    </div>
  );
}

export function Entrar({ supabase }) {
  const [modo, setModo] = useState('entrar');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verPassword, setVerPassword] = useState(false);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setError(null); setAviso(null); setEnviando(true);
    try {
      const datos = { email: email.trim(), password };
      const { data, error: err } = modo === 'entrar'
        ? await supabase.auth.signInWithPassword(datos)
        : await supabase.auth.signUp({ ...datos, options: { emailRedirectTo: window.location.origin } });
      if (err) throw err;
      if (modo === 'crear' && !data.session) setAviso('Te enviamos un correo para confirmar tu cuenta. Confírmalo y luego entra aquí.');
    } catch (err) {
      setError(traducirError(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Marco etiqueta={APP.lema} titulo={modo === 'entrar' ? APP.titulosEntrar[0] : APP.titulosEntrar[1]}
      subtitulo={APP.subtituloEntrar}
      pie={(
        <div className="flex flex-col gap-2.5 px-1">
          <Beneficio icon={WifiOff}>{APP.beneficios[0]}</Beneficio>
          <Beneficio icon={Users}>{APP.beneficios[1]}</Beneficio>
          <Beneficio icon={ShieldCheck}>{APP.beneficios[2]}</Beneficio>
        </div>
      )}>
      <div className="grid grid-cols-2 gap-1 p-1 rounded-xl mb-5" style={{ background: COLORS.paperAlt }}>
        {[['entrar', 'Entrar'], ['crear', 'Crear cuenta']].map(([k, t]) => (
          <button key={k} type="button" onClick={() => { setModo(k); setError(null); setAviso(null); }} className="py-2.5 rounded-lg text-sm font-bold"
            style={{ background: modo === k ? COLORS.night : 'transparent', color: modo === k ? '#fff' : COLORS.inkSoft }}>{t}</button>
        ))}
      </div>
      <form onSubmit={enviar}>
        <MensajeError>{error}</MensajeError>
        {aviso && <Aviso>{aviso}</Aviso>}
        <Field label="Correo"><TextInput type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoCapitalize="none" placeholder={APP.correoPlaceholder} required /></Field>
        <Field label="Contraseña">
          <div className="relative">
            <TextInput type={verPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'} minLength={6} placeholder="Mínimo 6 caracteres" required />
            <button type="button" onClick={() => setVerPassword(!verPassword)} className="absolute right-2 top-1/2 -translate-y-1/2 p-2" aria-label={verPassword ? 'Ocultar contraseña' : 'Ver contraseña'}>
              {verPassword ? <EyeOff size={18} color={COLORS.inkFaint} /> : <Eye size={18} color={COLORS.inkFaint} />}
            </button>
          </div>
        </Field>
        <PrimaryButton type="submit" disabled={enviando || !email || password.length < 6}><KeyRound size={17} />{enviando ? 'Un momento...' : modo === 'entrar' ? 'Entrar' : 'Crear cuenta'}</PrimaryButton>
      </form>
    </Marco>
  );
}

export function ElegirEmpresa({ supabase, email, membresias, errorCarga, onElegir, onCreada, onSalir }) {
  const [nombre, setNombre] = useState('');
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);

  async function llamar(fn, args) {
    setError(null); setEnviando(true);
    try {
      const { data, error: err } = await supabase.rpc(fn, args);
      if (err) throw err;
      onCreada(data.id);
    } catch (err) {
      setError(traducirError(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Marco etiqueta={email} titulo={membresias.length ? 'Elige tu empresa' : 'Tu empresa'}
      subtitulo={membresias.length ? 'Entra a una de tus empresas, únete a otra o crea una nueva.' : 'Únete a la de tu equipo con su código, o crea la tuya.'}
      pie={<Enlace oscuro onClick={onSalir}>Cerrar sesión</Enlace>}>
      <MensajeError>{error || errorCarga}</MensajeError>
      {membresias.length > 0 && (
        <>
          <div className="flex flex-col gap-2">
            {membresias.map((m) => (
              <button key={m.id} onClick={() => onElegir(m.id)} className="flex items-center gap-3 p-3.5 rounded-2xl text-left active:scale-[0.99] transition-transform" style={{ background: COLORS.night }}>
                <div className="rounded-xl p-2" style={{ background: 'rgba(242,100,25,0.15)' }}><Building2 size={20} color={COLORS.orange} /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-lg font-bold leading-tight tracking-tight truncate" style={{ color: '#fff', fontFamily: FONT_SLAB }}>{m.nombre}</p>
                  <p className="text-[11px]" style={{ color: m.rol === 'pendiente' || m.licencia !== 'activa' ? COLORS.hazard : COLORS.nightSoft }}>
                    {m.rol === 'pendiente' ? ETIQUETA_ROL.pendiente : { pendiente: 'Licencia en revisión', suspendida: 'Suspendida', vencida: `${ROLES[m.rol]} · licencia vencida` }[m.licencia] || ROLES[m.rol]}
                  </p>
                </div>
                <ChevronRight size={20} color={COLORS.orange} />
              </button>
            ))}
          </div>
          <Separador texto="o" />
        </>
      )}
      <form onSubmit={(e) => { e.preventDefault(); llamar(rpcDe('unirse_empresa'), { p_codigo: codigo }); }}>
        <Field label="Unirme con código de invitación">
          <input value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase().replace(/\s/g, ''))} placeholder="K7M2QX9A" maxLength={12} autoCapitalize="characters" autoCorrect="off" spellCheck={false}
            className="w-full px-3.5 py-3 rounded-xl text-xl font-bold tracking-[0.3em] text-center outline-none focus:ring-2 focus:ring-orange-400"
            style={{ fontFamily: FONT_MONO, background: COLORS.paperAlt, border: `1.5px solid ${COLORS.line}`, color: COLORS.ink }} />
        </Field>
        <BotonSecundario type="submit" disabled={enviando || codigo.trim().length < 6}><Users size={17} />Unirme al equipo</BotonSecundario>
      </form>
      <Separador texto="o crea la tuya" />
      <form onSubmit={(e) => { e.preventDefault(); llamar(rpcDe('crear_empresa'), { p_nombre: nombre }); }}>
        <Field label={APP.empresaLabel}><TextInput value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={APP.empresaPlaceholder} maxLength={120} /></Field>
        <PrimaryButton type="submit" disabled={enviando || !nombre.trim()}><Building2 size={17} />Crear empresa</PrimaryButton>
      </form>
    </Marco>
  );
}

export function EsperandoAprobacion({ supabase, empresa, email, userId, onActualizar, onOtraEmpresa, onCancelada, onSalir }) {
  const [revisando, setRevisando] = useState(false);
  const [error, setError] = useState(null);

  async function revisar() {
    setRevisando(true);
    await onActualizar();
    setRevisando(false);
  }
  // Revisa solo cada 20 s y al volver a la app, para que entre en cuanto lo aprueben.
  useEffect(() => {
    const t = setInterval(onActualizar, 20000);
    const alVolver = () => { if (document.visibilityState === 'visible') onActualizar(); };
    document.addEventListener('visibilitychange', alVolver);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', alVolver); };
  }, []);

  async function cancelar() {
    if (!window.confirm(`¿Cancelar tu solicitud a ${empresa.nombre}?`)) return;
    const { error: err } = await supabase.rpc(rpcDe('quitar_miembro'), { p_empresa: empresa.id, p_user: userId });
    if (err) return setError(traducirError(err));
    onCancelada();
  }

  return (
    <Marco etiqueta={email} titulo="Solicitud enviada" subtitulo={`Un administrador de ${empresa.nombre} tiene que aceptarte. En cuanto lo haga, entras solo.`}
      pie={<Enlace oscuro onClick={onSalir}>Cerrar sesión</Enlace>}>
      <MensajeError>{error}</MensajeError>
      <div className="flex items-center gap-3 p-4 rounded-2xl mb-4" style={{ background: '#FFF7E6', border: `1.5px solid ${COLORS.hazard}` }}>
        <Clock size={24} color={COLORS.warn} className="shrink-0" />
        <div className="min-w-0">
          <p className="text-lg font-bold leading-tight tracking-tight truncate" style={{ fontFamily: FONT_SLAB, color: COLORS.ink }}>{empresa.nombre}</p>
          <p className="text-[12px]" style={{ color: COLORS.inkSoft }}>Esperando aprobación</p>
        </div>
      </div>
      <Aviso>Avísale a quien te invitó que ya pediste entrada; lo verá en el aviso rojo de su empresa.</Aviso>
      <div className="flex flex-col gap-2">
        <BotonSecundario onClick={revisar} disabled={revisando}><RefreshCw size={17} />{revisando ? 'Revisando...' : 'Ya me aceptaron'}</BotonSecundario>
        <Enlace onClick={onOtraEmpresa}>Unirme o crear otra empresa</Enlace>
        <Enlace onClick={cancelar}>Cancelar solicitud</Enlace>
      </div>
    </Marco>
  );
}

export function LicenciaBloqueada({ empresa, email, soyDueno, onActualizar, onAbrirPanel, onOtraEmpresa, onSalir }) {
  const [revisando, setRevisando] = useState(false);
  const suspendida = empresa.licencia === 'suspendida';
  useEffect(() => {
    const t = setInterval(onActualizar, 30000);
    const alVolver = () => { if (document.visibilityState === 'visible') onActualizar(); };
    document.addEventListener('visibilitychange', alVolver);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', alVolver); };
  }, []);
  async function revisar() { setRevisando(true); await onActualizar(); setRevisando(false); }

  return (
    <Marco etiqueta={email} titulo={suspendida ? 'Empresa suspendida' : 'Activa tu licencia'}
      subtitulo={suspendida
        ? `El acceso de ${empresa.nombre} está suspendido. Comunícate con ${APP.nombre} para reactivarlo; tus datos siguen guardados.`
        : `${empresa.nombre} ya está registrada. ${APP.nombre} la activará cuando se confirme tu plan; en cuanto pase, entras solo.`}
      pie={<Enlace oscuro onClick={onSalir}>Cerrar sesión</Enlace>}>
      <div className="flex items-center gap-3 p-4 rounded-2xl mb-4" style={{ background: suspendida ? '#FDECEA' : '#FFF7E6', border: `1.5px solid ${suspendida ? COLORS.bad : COLORS.hazard}` }}>
        {suspendida ? <ShieldAlert size={24} color={COLORS.bad} className="shrink-0" /> : <Clock size={24} color={COLORS.warn} className="shrink-0" />}
        <div className="min-w-0">
          <p className="text-lg font-bold leading-tight tracking-tight truncate" style={{ fontFamily: FONT_SLAB, color: COLORS.ink }}>{empresa.nombre}</p>
          <p className="text-[12px]" style={{ color: COLORS.inkSoft }}>{suspendida ? 'Suspendida' : 'Licencia en revisión'}</p>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {soyDueno && <PrimaryButton onClick={onAbrirPanel}><LayoutDashboard size={17} />Panel del dueño</PrimaryButton>}
        <BotonSecundario onClick={revisar} disabled={revisando}><RefreshCw size={17} />{revisando ? 'Revisando...' : 'Ya está activa'}</BotonSecundario>
        <Enlace onClick={onOtraEmpresa}>Unirme o crear otra empresa</Enlace>
      </div>
    </Marco>
  );
}

export function CuentaSheet({ supabase, empresa, email, userId, pendientes, variasEmpresas, soyDueno, onAbrirPanel, onCerrar, onCambiarEmpresa, onCerrarSesion, onDejarEmpresa, onEquipoCambiado }) {
  const esAdmin = empresa.rol === 'admin';
  const [codigo, setCodigo] = useState(empresa.codigo);
  const [miembros, setMiembros] = useState(null);
  const [error, setError] = useState(null);
  const [copiado, setCopiado] = useState(false);

  async function cargarMiembros() {
    const { data, error: err } = await supabase.from(tablaDe('miembros')).select('user_id, rol, email').eq('empresa_id', empresa.id).order('created_at');
    if (err) setError(traducirError(err)); else setMiembros(data);
    onEquipoCambiado?.();
  }
  const solicitudes = (miembros || []).filter((m) => m.rol === 'pendiente');
  const equipo = (miembros || []).filter((m) => m.rol !== 'pendiente');
  useEffect(() => { cargarMiembros(); }, [empresa.id]);

  async function rpc(fn, args, luego) {
    setError(null);
    const { data, error: err } = await supabase.rpc(rpcDe(fn), args);
    if (err) return setError(traducirError(err));
    luego?.(data);
  }
  async function compartir() {
    const texto = `Únete a ${empresa.nombre} en ${APP.nombre}: ${window.location.origin}\nCódigo de invitación: ${codigo}`;
    try {
      if (navigator.share) { await navigator.share({ title: APP.nombre, text: texto }); return; }
    } catch (e) { return; /* canceló */ }
    navigator.clipboard?.writeText(texto).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 1800); }).catch(() => {});
  }
  function salirDeEmpresa() {
    if (!window.confirm(`¿Salir de ${empresa.nombre}? Dejarás de ver sus datos.`)) return;
    rpc('quitar_miembro', { p_empresa: empresa.id, p_user: userId }, onDejarEmpresa);
  }

  return (
    <Sheet title={empresa.nombre} onClose={onCerrar}>
      <MensajeError>{error}</MensajeError>
      <div className="flex items-center gap-2 mb-4 text-[13px]" style={{ color: COLORS.inkSoft }}>
        <span className="truncate">{email}</span>
        <span className="shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: esAdmin ? COLORS.orange : COLORS.chip, color: esAdmin ? '#fff' : COLORS.ink }}>{ROLES[empresa.rol]}</span>
      </div>
      {pendientes > 0 && <Aviso>{pendientes} cambio{pendientes === 1 ? '' : 's'} por subir. Se suben solos cuando haya señal.</Aviso>}
      <div className="flex items-center justify-between gap-2 mb-4 px-3.5 py-2.5 rounded-xl text-[13px]" style={{ background: empresa.licencia === 'vencida' ? '#FDECEA' : COLORS.paperAlt, border: `1px solid ${empresa.licencia === 'vencida' ? COLORS.bad + '55' : COLORS.line}` }}>
        <span className="font-semibold" style={{ color: empresa.licencia === 'vencida' ? COLORS.bad : COLORS.ink }}>
          {empresa.licencia === 'vencida' ? 'Licencia vencida: solo lectura' : 'Licencia activa'}
        </span>
        <span className="text-[12px]" style={{ color: COLORS.inkSoft }}>
          {empresa.vence ? `${empresa.licencia === 'vencida' ? 'venció' : 'hasta'} ${new Date(empresa.vence + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}` : 'sin vencimiento'}
          {empresa.max_usuarios ? ` · ${equipo.length}/${empresa.max_usuarios} usuarios` : ''}
        </span>
      </div>

      <div className="rounded-2xl p-4 mb-5" style={{ background: COLORS.night, backgroundImage: PLANO_BG, backgroundSize: '18px 18px' }}>
        <p className="text-[11px] uppercase tracking-[0.2em] font-semibold" style={{ color: COLORS.orange, fontFamily: FONT_MONO }}>Código de invitación</p>
        <div className="flex items-center gap-2 mt-2">
          <p className="flex-1 text-[30px] font-bold tracking-[0.18em] leading-none" style={{ fontFamily: FONT_MONO, color: '#fff' }}>{codigo}</p>
          {esAdmin && (
            <button onClick={() => window.confirm('¿Cambiar el código? El anterior dejará de servir.') && rpc('regenerar_codigo', { p_empresa: empresa.id }, setCodigo)} className="p-2.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.08)' }} aria-label="Cambiar código"><RefreshCw size={18} color="#fff" /></button>
          )}
        </div>
        <button onClick={compartir} className="w-full mt-3 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2" style={{ background: COLORS.orange, color: '#fff' }}>
          {copiado ? <><Check size={17} />Invitación copiada</> : <><Copy size={17} />Invitar a mi equipo</>}
        </button>
        <p className="text-[11px] mt-2 text-center" style={{ color: COLORS.nightSoft }}>El código solo sirve para pedir entrada: nadie ve tu información hasta que un administrador lo acepta.</p>
      </div>

      {esAdmin && solicitudes.length > 0 && (
        <Field label={`Solicitudes de entrada · ${solicitudes.length}`}>
          <div className="flex flex-col gap-2">
            {solicitudes.map((m) => (
              <div key={m.user_id} className="rounded-xl p-3" style={{ background: '#FFF7E6', border: `1.5px solid ${COLORS.hazard}` }}>
                <div className="flex items-center gap-2">
                  <Clock size={16} color={COLORS.warn} className="shrink-0" />
                  <span className="flex-1 text-sm font-semibold truncate" style={{ color: COLORS.ink }}>{m.email || 'Sin correo'}</span>
                </div>
                <p className="text-[11px] mt-1 mb-2.5" style={{ color: COLORS.inkSoft }}>Aprueba solo si conoces a esta persona.</p>
                <div className="grid grid-cols-3 gap-1.5">
                  <button onClick={() => rpc('cambiar_rol', { p_empresa: empresa.id, p_user: m.user_id, p_rol: 'editor' }, cargarMiembros)} className="py-2.5 rounded-lg text-[13px] font-bold flex items-center justify-center gap-1" style={{ background: COLORS.good, color: '#fff' }}><UserCheck size={15} />Captura</button>
                  <button onClick={() => rpc('cambiar_rol', { p_empresa: empresa.id, p_user: m.user_id, p_rol: 'lector' }, cargarMiembros)} className="py-2.5 rounded-lg text-[13px] font-bold" style={{ background: COLORS.night, color: '#fff' }}>Solo ver</button>
                  <button onClick={() => window.confirm(`¿Rechazar a ${m.email || 'esta persona'}?`) && rpc('quitar_miembro', { p_empresa: empresa.id, p_user: m.user_id }, cargarMiembros)} className="py-2.5 rounded-lg text-[13px] font-bold flex items-center justify-center gap-1" style={{ background: '#FDECEA', color: COLORS.bad }}><UserX size={15} />Rechazar</button>
                </div>
              </div>
            ))}
          </div>
        </Field>
      )}

      <Field label={`Equipo${miembros ? ` · ${equipo.length}` : ''}`}>
        {!miembros && <p className="text-xs" style={{ color: COLORS.inkFaint }}>Cargando...</p>}
        <div className="flex flex-col gap-1.5">
          {equipo.map((m) => (
            <div key={m.user_id} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl" style={{ background: COLORS.paperAlt, border: `1px solid ${COLORS.line}` }}>
              <div className="rounded-full flex items-center justify-center shrink-0 text-sm font-bold" style={{ width: 32, height: 32, background: COLORS.night, color: COLORS.orange, fontFamily: FONT_SLAB }}>{(m.email || '?')[0]}</div>
              <span className="flex-1 text-sm truncate font-medium" style={{ color: COLORS.ink }}>{m.email || 'Sin correo'}{m.user_id === userId ? ' (tú)' : ''}</span>
              {esAdmin && m.user_id !== userId ? (
                <div className="w-[132px] shrink-0">
                  <Select value={m.rol} onChange={(e) => rpc('cambiar_rol', { p_empresa: empresa.id, p_user: m.user_id, p_rol: e.target.value }, cargarMiembros)}>
                    {Object.entries(ROLES).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
                  </Select>
                </div>
              ) : <span className="text-[11px] shrink-0 font-semibold" style={{ color: COLORS.inkFaint }}>{ROLES[m.rol]}</span>}
              {esAdmin && m.user_id !== userId && (
                <button onClick={() => window.confirm(`¿Quitar a ${m.email || 'este miembro'}?`) && rpc('quitar_miembro', { p_empresa: empresa.id, p_user: m.user_id }, cargarMiembros)} className="text-[11px] font-bold px-1" style={{ color: COLORS.bad }}>Quitar</button>
              )}
            </div>
          ))}
        </div>
      </Field>

      <div className="flex flex-col gap-2 mt-2">
        {soyDueno && <PrimaryButton onClick={onAbrirPanel}><LayoutDashboard size={17} />Panel del dueño</PrimaryButton>}
        <BotonSecundario onClick={onCambiarEmpresa}><Building2 size={17} />{variasEmpresas ? 'Cambiar de empresa' : 'Unirme o crear otra empresa'}</BotonSecundario>
        <button onClick={onCerrarSesion} className="w-full py-3.5 rounded-xl text-[15px] font-bold flex items-center justify-center gap-2" style={{ background: COLORS.paperAlt, color: COLORS.ink, border: `1px solid ${COLORS.line}` }}><LogOut size={17} />Cerrar sesión</button>
        <Enlace onClick={salirDeEmpresa}>Salir de esta empresa</Enlace>
      </div>
    </Sheet>
  );
}
