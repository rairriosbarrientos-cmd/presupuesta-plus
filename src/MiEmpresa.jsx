// Datos de la empresa del usuario para sus PDFs (logo, teléfono, correo, dirección).
// Se guardan como un registro sincronizado más, así todo el equipo usa la misma imagen.
import { useState } from 'react';
import { ImagePlus, Trash2, MessageCircle } from 'lucide-react';
import { COLORS, Sheet, Field, TextInput, PrimaryButton, Note } from './ui.jsx';

export const MI_EMPRESA_ID = 'mi-empresa';

// Reduce el logo a 360 px como máximo para que pese poco y sincronice rápido.
export function comprimirLogo(file, max = 360) {
  return new Promise((ok, mal) => {
    const lector = new FileReader();
    lector.onload = () => {
      const img = new Image();
      img.onload = () => {
        const escala = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * escala));
        c.height = Math.max(1, Math.round(img.height * escala));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        ok(c.toDataURL('image/png'));
      };
      img.onerror = () => mal(new Error('No se pudo leer la imagen'));
      img.src = lector.result;
    };
    lector.onerror = () => mal(new Error('No se pudo leer el archivo'));
    lector.readAsDataURL(file);
  });
}

export function MiEmpresaSheet({ datos, empresa, onGuardar, onClose }) {
  const [d, setD] = useState({ nombre: empresa || '', telefono: '', correo: '', direccion: '', logo: '', ...(datos || {}) });
  const [error, setError] = useState(null);
  const subir = async (ev) => {
    const archivo = ev.target.files?.[0];
    ev.target.value = '';
    if (!archivo) return;
    try { setError(null); setD({ ...d, logo: await comprimirLogo(archivo) }); } catch (e) { setError(e.message); }
  };
  return (
    <Sheet title="Tu empresa en el PDF" onClose={onClose}>
      <div className="flex items-center gap-3 mb-4">
        <label className="shrink-0 rounded-2xl flex items-center justify-center overflow-hidden cursor-pointer" style={{ width: 88, height: 88, background: '#fff', border: `2px dashed ${COLORS.line}` }}>
          {d.logo ? <img src={d.logo} alt="Logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} /> : <ImagePlus size={28} color={COLORS.inkFaint} />}
          <input type="file" accept="image/*" className="hidden" onChange={subir} />
        </label>
        <div className="min-w-0">
          <p className="text-[14px] font-semibold" style={{ color: COLORS.ink }}>{d.logo ? 'Tu logo' : 'Sube tu logo'}</p>
          <p className="text-[12px]" style={{ color: COLORS.inkSoft }}>PNG o JPG. Sale en todos tus PDFs.</p>
          {d.logo && <button onClick={() => setD({ ...d, logo: '' })} className="mt-1 text-[12px] font-semibold flex items-center gap-1" style={{ color: COLORS.bad }}><Trash2 size={12} />Quitar logo</button>}
        </div>
      </div>
      {error && <Note>{error}</Note>}
      <Field label="Nombre comercial"><TextInput value={d.nombre} onChange={(e) => setD({ ...d, nombre: e.target.value })} maxLength={80} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Teléfono / WhatsApp"><TextInput type="tel" value={d.telefono} onChange={(e) => setD({ ...d, telefono: e.target.value })} maxLength={30} placeholder="744 123 4567" /></Field>
        <Field label="Correo"><TextInput type="email" value={d.correo} onChange={(e) => setD({ ...d, correo: e.target.value })} maxLength={80} /></Field>
      </div>
      <Field label="Dirección o ciudad"><TextInput value={d.direccion} onChange={(e) => setD({ ...d, direccion: e.target.value })} maxLength={120} placeholder="Acapulco, Gro." /></Field>
      <PrimaryButton onClick={() => onGuardar({ ...d, id: MI_EMPRESA_ID, tipo: 'empresa' })}>Guardar</PrimaryButton>
    </Sheet>
  );
}

// Abre WhatsApp con un resumen listo para mandar; el PDF se adjunta desde "Ver PDF".
export function abrirWhatsApp(texto) {
  window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank', 'noopener');
}

export function BotonWhatsApp({ onClick }) {
  return (
    <button onClick={onClick} className="py-2.5 rounded-xl text-[13px] font-bold flex items-center justify-center gap-1.5" style={{ background: '#25D366', color: '#fff' }}>
      <MessageCircle size={15} />WhatsApp
    </button>
  );
}
