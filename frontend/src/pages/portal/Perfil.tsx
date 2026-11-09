// T-27 · Mockups 040 y 041: perfil del cliente (nombre y teléfono) y cambio de contraseña.
// RUT, correo y dirección son datos del contrato: los cambia ENINTI.
import { useEffect, useState, type FormEvent } from 'react';
import { ChevronRight, Lock } from 'lucide-react';
import { api } from '../../api';
import { useDatos } from '../../useDatos';
import { Aviso, Campo, CampoContrasena, Cargando, Modal, Titulo, Volver } from '../../componentes';
import { useWhatsapp } from '../../contacto';

interface Perfil { nombre: string; telefono: string; rut: string | null; email: string | null; direccion: string }

export default function Perfil() {
  const { datos: p, error } = useDatos<Perfil>('/portal/perfil');
  const wa = useWhatsapp('Hola ENINTI, quiero actualizar mis datos.');
  const [f, setF] = useState({ nombre: '', telefono: '' });
  const [aviso, setAviso] = useState('');
  const [falla, setFalla] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [clave, setClave] = useState(false);
  useEffect(() => { if (p) setF({ nombre: p.nombre, telefono: p.telefono ?? '' }); }, [p]);
  if (!p) return error ? <Aviso>{error}</Aviso> : <Cargando />;

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setFalla(''); setAviso('');
    setGuardando(true);
    try { await api('/portal/perfil', { method: 'PUT', body: f }); setAviso('Datos guardados'); }
    catch (err) { setFalla((err as Error).message); } finally { setGuardando(false); }
  };

  return (
    <div className="pagina-portal angosta">
      <Volver />
      <Titulo fuerte="Mi perfil" />
      <h2 className="subtitulo">Tus datos</h2>
      <form className="formulario" onSubmit={guardar} noValidate>
        <Campo etiqueta="Nombre" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
        <Campo etiqueta="Teléfono" type="tel" value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} />
        <Aviso>{falla}</Aviso>
        <Aviso tipo="ok">{aviso}</Aviso>
        <button className="boton primario" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
      </form>
      <h2 className="subtitulo">Datos de tu contrato</h2>
      <div className="formulario">
        <Campo etiqueta="RUT" value={p.rut ?? '—'} disabled />
        <Campo etiqueta="Correo" value={p.email ?? '—'} disabled />
        <Campo etiqueta="Dirección" value={p.direccion || '—'} disabled />
      </div>
      <p className="suave">Para cambiar estos datos, {wa ? <a href={wa} target="_blank" rel="noreferrer">escríbenos</a> : 'escríbenos'}.</p>
      <ul className="lista-menu">
        <li><button type="button" onClick={() => setClave(true)}><Lock size={20} /> Cambiar contraseña <ChevronRight size={18} className="empujar" /></button></li>
      </ul>
      {clave && <CambiarContrasena cerrar={() => setClave(false)} listo={() => { setClave(false); setAviso('Contraseña cambiada'); }} />}
    </div>
  );
}

function CambiarContrasena({ cerrar, listo }: { cerrar: () => void; listo: () => void }) {
  const [f, setF] = useState({ actual: '', nueva: '', repetir: '' });
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (f.nueva.length < 8) return setError('La contraseña nueva debe tener al menos 8 caracteres');
    if (f.nueva !== f.repetir) return setError('Las contraseñas nuevas no coinciden');
    setError('');
    setGuardando(true);
    try { await api('/portal/perfil/contrasena', { method: 'POST', body: { actual: f.actual, nueva: f.nueva } }); listo(); }
    catch (err) { setError((err as Error).message); setGuardando(false); }
  };
  return (
    <Modal titulo="Cambiar contraseña" cerrar={cerrar}>
      <form className="formulario" onSubmit={enviar} noValidate>
        <CampoContrasena etiqueta="Contraseña actual" autoComplete="current-password" value={f.actual} onChange={(e) => setF({ ...f, actual: e.target.value })} />
        <CampoContrasena etiqueta="Contraseña nueva" autoComplete="new-password" ayuda="Mínimo 8 caracteres" value={f.nueva} onChange={(e) => setF({ ...f, nueva: e.target.value })} />
        <CampoContrasena etiqueta="Repite la contraseña nueva" autoComplete="new-password" value={f.repetir} onChange={(e) => setF({ ...f, repetir: e.target.value })} />
        <Aviso>{error}</Aviso>
        <div className="botones">
          <button type="button" className="boton suave chico" onClick={cerrar}>Cancelar</button>
          <button className="boton primario chico" disabled={guardando}>{guardando ? 'Guardando…' : 'Cambiar contraseña'}</button>
        </div>
      </form>
    </Modal>
  );
}
