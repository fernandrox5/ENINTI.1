// Mockups 053 y 096: registrar una gestión (llamada, WhatsApp, correo o visita) con el cliente
import { useState, type FormEvent } from 'react';
import { api } from '../../../api';
import { AreaTexto, Aviso, Campo, Modal, Selector } from '../../../componentes';
import { GESTIONES } from './Clientes';

export default function RegistrarGestion({ clienteId, clienteNombre, suscripcionId, motivoInicial, cerrar, listo }: {
  clienteId: number; clienteNombre: string; suscripcionId?: number; motivoInicial?: string; cerrar: () => void; listo: () => void;
}) {
  const [f, setF] = useState({ tipo: 'llamada', motivo: motivoInicial ?? '', resultado: '' });
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (!f.motivo.trim()) return setError('Indica el motivo');
    setEnviando(true);
    try {
      await api(`/admin/clientes/${clienteId}/gestiones`, { method: 'POST', body: { ...f, suscripcion_id: suscripcionId } });
      listo();
    } catch (err) {
      setError((err as Error).message);
      setEnviando(false);
    }
  };

  return (
    <Modal titulo={`Registrar gestión · ${clienteNombre}`} cerrar={cerrar}>
      <form className="formulario" onSubmit={enviar} noValidate>
        <Selector etiqueta="Tipo" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
          {Object.entries(GESTIONES).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </Selector>
        <Campo etiqueta="Motivo" placeholder="Ej.: pago pendiente, aviso de vencimiento" value={f.motivo} onChange={(e) => setF({ ...f, motivo: e.target.value })} />
        <AreaTexto etiqueta="Resultado" placeholder="Ej.: promete pagar esta semana" value={f.resultado} onChange={(e) => setF({ ...f, resultado: e.target.value })} />
        <Aviso>{error}</Aviso>
        <div className="botones">
          <button type="button" className="boton secundario chico" onClick={cerrar}>Cancelar</button>
          <button className="boton primario chico" disabled={enviando}>{enviando ? 'Guardando…' : 'Registrar gestión'}</button>
        </div>
      </form>
    </Modal>
  );
}
