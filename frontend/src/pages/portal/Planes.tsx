// T-27 · Mockups 038 y 039: planes de mantención. El cliente contrata (o renueva una que venció) él
// mismo: elige la instalación, acepta las condiciones y paga el primer mes con su tarjeta inscrita
// o en Flow. Desde ahí el cobro es mensual y automático.
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Check, CreditCard, ExternalLink } from 'lucide-react';
import { api } from '../../api';
import { useDatos } from '../../useDatos';
import { Aviso, Cargando, Etiqueta, Modal, Selector, Titulo, Volver } from '../../componentes';
import { FRECUENCIAS, pesos } from '../../formato';

interface Plan { id: number; nombre: string; descripcion: string | null; frecuencia_pago: string; monto_clp: number; duracion_meses: number; mantenciones_por_anio: number; incluye_reposicion_equipos: boolean; tiempo_respuesta_horas: number | null }
interface Mia { id: number; codigo: string; nombre: string | null; plan: string | null; suscripcion_id: number | null; dias_restantes: number | null; ultima_suscripcion: { plan: string; estado: string } | null }
interface Datos { planes: Plan[]; instalaciones: Mia[]; tarjeta: { tipo: string | null; ultimos4: string | null } | null; condiciones: { version: string } | null; correo: boolean }

export default function Planes() {
  const [params] = useSearchParams();
  const { datos, error, cargando } = useDatos<Datos>('/portal/planes');
  const [elegido, setElegido] = useState<Plan | null>(null);
  if (cargando && !datos) return <Cargando />;
  if (!datos) return <Aviso>{error}</Aviso>;
  const libres = datos.instalaciones.filter((i) => !i.suscripcion_id);
  const pedida = datos.instalaciones.find((i) => String(i.id) === params.get('instalacion'));

  return (
    <div className="pagina-portal">
      <Volver />
      <Titulo fuerte="Planes" />
      {pedida && !pedida.suscripcion_id && (
        <p className="nota-info"><span>Eligiendo plan para <strong>{pedida.nombre || pedida.codigo}</strong>{pedida.ultima_suscripcion ? ` (antes tenía el ${pedida.ultima_suscripcion.plan})` : ''}.</span></p>
      )}
      <div className="grilla-3">
        {datos.planes.map((p) => {
          const mios = datos.instalaciones.filter((i) => i.plan === p.nombre);
          return (
            <section key={p.id} className={`tarjeta plan ${mios.length ? 'elegido' : ''}`}>
              <header className="tarjeta-cabecera"><h2>{p.nombre}</h2>{mios.length > 0 && <Etiqueta tono="alerta">Tu plan</Etiqueta>}</header>
              <strong className="pago-monto">{pesos(p.monto_clp)} <small>{FRECUENCIAS[p.frecuencia_pago]}</small></strong>
              <ul className="beneficios">
                <li><Check size={18} /> {p.mantenciones_por_anio} {p.mantenciones_por_anio === 1 ? 'mantención preventiva' : 'mantenciones preventivas'} al año</li>
                <li><Check size={18} /> Cobro automático mensual, sin trámites</li>
                {p.incluye_reposicion_equipos && <li><Check size={18} /> Incluye reposición de equipos</li>}
                {p.tiempo_respuesta_horas && <li><Check size={18} /> Respuesta en {p.tiempo_respuesta_horas} horas</li>}
              </ul>
              {mios.length > 0 && <p className="suave">Activo en {mios.map((i) => i.nombre || i.codigo).join(', ')}</p>}
              {libres.length > 0
                ? <button type="button" className="boton primario" onClick={() => setElegido(p)}>{libres.some((i) => i.ultima_suscripcion) && !libres.some((i) => !i.ultima_suscripcion) ? 'Renovar con este plan' : 'Contratar'}</button>
                : <p className="suave">Todas tus instalaciones tienen un plan vigente.</p>}
            </section>
          );
        })}
      </div>
      {elegido && <Contratar plan={elegido} datos={datos} inicial={pedida && !pedida.suscripcion_id ? pedida.id : libres[0]?.id} cerrar={() => setElegido(null)} />}
    </div>
  );
}

function Contratar({ plan, datos, inicial, cerrar }: { plan: Plan; datos: Datos; inicial?: number; cerrar: () => void }) {
  const navegar = useNavigate();
  const libres = datos.instalaciones.filter((i) => !i.suscripcion_id);
  const [instalacion, setInstalacion] = useState(String(inicial ?? ''));
  const [acepto, setAcepto] = useState(false);
  const [medio, setMedio] = useState(datos.tarjeta ? 'tarjeta' : 'flow');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const i = libres.find((x) => String(x.id) === instalacion);
  const dia = new Date().getDate();

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (!acepto) return setError('Debes aceptar las condiciones del servicio');
    setError('');
    setEnviando(true);
    try {
      const r = await api<{ suscripcion: { codigo: string }; url?: string; pagado?: boolean; error?: string | null }>('/portal/planes/contratar', {
        method: 'POST', body: { tipo_suscripcion_id: plan.id, instalacion_id: Number(instalacion), acepto_condiciones: true, medio },
      });
      if (r.url) { window.location.href = r.url; return; }
      navegar(`/portal/pagos?${r.pagado ? 'resultado=pagado' : 'resultado=pendiente'}`);
    } catch (err) { setError((err as Error).message); setEnviando(false); }
  };

  return (
    <Modal titulo={`Contratar ${plan.nombre}`} cerrar={cerrar} ancho={560}>
      <form className="formulario" onSubmit={enviar} noValidate>
        <Selector etiqueta="Instalación" value={instalacion} onChange={(e) => setInstalacion(e.target.value)}>
          {libres.map((x) => <option key={x.id} value={x.id}>{x.nombre || x.codigo}{x.ultima_suscripcion ? ` · antes con ${x.ultima_suscripcion.plan}` : ' · sin plan'}</option>)}
        </Selector>
        <dl className="datos lineas">
          <div><dt>Plan</dt><dd>{plan.nombre}</dd></div>
          <div><dt>Hoy pagas</dt><dd><strong>{pesos(plan.monto_clp)}</strong></dd></div>
          <div><dt>Después</dt><dd>{pesos(plan.monto_clp)} {FRECUENCIAS[plan.frecuencia_pago]}, el día {dia} de cada mes, automático</dd></div>
          <div><dt>Incluye</dt><dd>{plan.mantenciones_por_anio} mantenciones al año (se agendan solas)</dd></div>
        </dl>
        <h3 className="subtitulo">¿Cómo pagas?</h3>
        <div className="opciones-radio">
          {datos.tarjeta && (
            <label className={medio === 'tarjeta' ? 'elegida' : ''}>
              <input type="radio" name="medio" checked={medio === 'tarjeta'} onChange={() => setMedio('tarjeta')} />
              <span><strong><CreditCard size={15} /> {datos.tarjeta.tipo ?? 'Tarjeta'} ···· {datos.tarjeta.ultimos4}</strong><small>Se cobra ahora y después cada mes, sola</small></span>
            </label>
          )}
          <label className={medio === 'flow' ? 'elegida' : ''}>
            <input type="radio" name="medio" checked={medio === 'flow'} onChange={() => setMedio('flow')} />
            <span><strong><ExternalLink size={15} /> Pagar en Flow</strong><small>Tarjeta, transferencia u otros medios. {datos.tarjeta ? '' : 'Puedes inscribir tu tarjeta después en Pagos para que se cobre sola.'}</small></span>
          </label>
        </div>
        <label className="check">
          <input type="checkbox" checked={acepto} onChange={(e) => setAcepto(e.target.checked)} />
          <span>Acepto las <Link to="/terminos" target="_blank">condiciones del servicio</Link>{datos.condiciones ? ` (versión ${datos.condiciones.version})` : ''}. Puedo cancelar cuando quiera desde el portal.</span>
        </label>
        {!datos.correo && <Aviso>Para pagar en línea necesitamos tu correo. Escríbenos para agregarlo.</Aviso>}
        <Aviso>{error}</Aviso>
        <div className="botones">
          <button type="button" className="boton suave chico" onClick={cerrar}>Cancelar</button>
          <button className="boton primario chico" disabled={enviando || !i || !acepto || !datos.correo}>
            {enviando ? 'Procesando…' : medio === 'tarjeta' ? `Pagar ${pesos(plan.monto_clp)} y activar` : 'Ir a pagar'}</button>
        </div>
      </form>
    </Modal>
  );
}
