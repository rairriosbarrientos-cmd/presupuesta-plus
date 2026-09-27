import { createClient } from '@supabase/supabase-js';
import { APP } from '../config.js';

// Proyecto de Supabase de la app. La llave publishable es pública por diseño (va dentro de la app);
// la seguridad la ponen las reglas de supabase/migrations. Nunca poner aquí la service_role / secret.
const NUBE_DE_FABRICA = {
  url: 'https://rqzlfspinrmawzkxpnks.supabase.co',
  anonKey: 'sb_publishable_jUFT70pMgV_RfZUwCfT-tQ_LnMN3mnB',
};

// Las variables del build (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) tienen prioridad sobre la nube de fábrica.
export function leerConfig() {
  return {
    url: import.meta.env?.VITE_SUPABASE_URL || NUBE_DE_FABRICA.url,
    anonKey: import.meta.env?.VITE_SUPABASE_ANON_KEY || NUBE_DE_FABRICA.anonKey,
  };
}

let cache = null;
export function obtenerCliente(config) {
  if (cache && cache.url === config.url && cache.anonKey === config.anonKey) return cache.cliente;
  const cliente = createClient(config.url, config.anonKey, { auth: { persistSession: true, autoRefreshToken: true, storageKey: `${APP.claveLocal}-sesion` } });
  cache = { url: config.url, anonKey: config.anonKey, cliente };
  return cliente;
}

export function traducirError(error) {
  const msg = String(error?.message || error || '');
  if (/codigo_invalido/.test(msg)) return 'Ese código de invitación no existe. Revísalo con quien te invitó.';
  if (/sin_permiso/.test(msg)) return 'No tienes permiso para hacer eso.';
  if (/ultimo_admin/.test(msg)) return 'La empresa necesita al menos un administrador.';
  if (/limite_usuarios/.test(msg)) return 'Llegaste al límite de usuarios de tu plan. Pide que lo amplíen en tu plan.';
  if (/licencia_inactiva/.test(msg)) return 'La licencia de tu empresa no está activa.';
  if (/Invalid login credentials/i.test(msg)) return 'Correo o contraseña incorrectos.';
  if (/Email not confirmed/i.test(msg)) return 'Falta confirmar tu correo. Revisa tu bandeja de entrada.';
  if (/already registered|already been registered/i.test(msg)) return 'Ese correo ya tiene cuenta. Entra con tu contraseña.';
  if (/Password should be/i.test(msg)) return 'La contraseña debe tener al menos 6 caracteres.';
  if (/rate limit|too many/i.test(msg)) return 'Demasiados intentos. Espera un minuto y vuelve a intentar.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'Sin conexión. Intenta cuando tengas señal.';
  return msg || 'Algo salió mal. Intenta de nuevo.';
}
