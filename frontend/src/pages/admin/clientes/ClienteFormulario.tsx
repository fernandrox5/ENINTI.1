// T-22: crear o editar la ficha de un cliente
import { useState, type FormEvent } from 'react';
import { api } from '../../../api';
import { useDatos } from '../../../useDatos';
import { AreaTexto, Aviso, Campo, Modal, Selector } from '../../../componentes';
import type { Localidad } from './Clientes';

export interface DatosCliente {
  rut: string; nombre: string; es_empresa: boolean; email: string; telefono: string; direccion: string;
  localidad_id: string; origen: string; notas: string;
}
const VACIO: DatosCliente = { rut: '', nombre: '', es_empresa: false, email: '', telefono: '', direccion: '', localidad_id: '', origen: '', notas: '' };
const ORIGENES = ['Boca a boca', 'Referido', 'Instagram', 'Facebook', 'Sitio web', 'Feria o evento', 'Otro'];

export default function ClienteFormulario({ id, inicial, cerrar, listo }: {
  id?: number; inicial?: Partial<DatosCliente>; cerrar: () => void; listo: (id: number) => void;
}) {
  const [f, setF] = useState<DatosCliente>({ ...VACIO, ...inicial });
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const { datos: localidades } = useDatos<Localidad[]>('/admin/clientes/localidades');
  const cambiar = (c: keyof DatosCliente) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF({ ...f, [c]: e.target.value });

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!f.nombre.trim()) return setError('El nombre es obligatorio');
    setEnviando(true);
    try {
      const cuerpo = { ...f, localidad_id: f.localidad_id ? Number(f.localidad_id) : null };
      if (id) {
        await api(`/admin/clientes/${id}`, { method: 'PUT', body: cuerpo });
        listo(id);
      } else {
        const r = await api<{ id: number }>('/admin/clientes', { method: 'POST', body: cuerpo });
        listo(r.id);
      }
    } catch (err) {
      setError((err as Error).message);
      setEnviando(false);
    }
  };

  return (
    <Modal titulo={id ? 'Editar cliente' : 'Nuevo cliente'} cerrar={cerrar} ancho={640}>
      <form className="formulario dos" onSubmit={enviar} noValidate>
        <div className="completo"><Campo etiqueta="Nombre completo o razón social" value={f.nombre} onChange={cambiar('nombre')} required autoFocus /></div>
        <Campo etiqueta="RUT" placeholder="12.345.678-9" value={f.rut} onChange={cambiar('rut')} />
        <label className="check centrar-vertical">
          <input type="checkbox" checked={f.es_empresa} onChange={(e) => setF({ ...f, es_empresa: e.target.checked })} />
          <span>Es empresa</span>
        </label>
        <Campo etiqueta="Correo" type="email" value={f.email} onChange={cambiar('email')} ayuda="Para darle acceso al portal" />
        <Campo etiqueta="Teléfono" type="tel" placeholder="+56 9 1234 5678" value={f.telefono} onChange={cambiar('telefono')} />
        <Campo etiqueta="Dirección" value={f.direccion} onChange={cambiar('direccion')} />
        <Selector etiqueta="Localidad" value={f.localidad_id} onChange={cambiar('localidad_id')}>
          <option value="">Sin indicar</option>
          {localidades?.map((l) => <option key={l.id} value={l.id}>{l.nombre} ({l.comuna})</option>)}
        </Selector>
        <Selector etiqueta="¿Cómo llegó?" value={f.origen} onChange={cambiar('origen')}>
          <option value="">Sin indicar</option>
          {[...new Set([...ORIGENES, ...(f.origen ? [f.origen] : [])])].map((o) => <option key={o}>{o}</option>)}
        </Selector>
        <div className="completo"><AreaTexto etiqueta="Notas" value={f.notas} onChange={cambiar('notas')} /></div>
        <div className="completo"><Aviso>{error}</Aviso></div>
        <div className="completo botones">
          <button type="button" className="boton secundario chico" onClick={cerrar}>Cancelar</button>
          <button className="boton primario chico" disabled={enviando}>{enviando ? 'Guardando…' : id ? 'Guardar cambios' : 'Crear cliente'}</button>
        </div>
      </form>
    </Modal>
  );
}
