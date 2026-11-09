// T-24 · Mockups 062 a 065: reemplazar equipo en tres pasos (equipo, motivo, equipo nuevo)
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Check, Info } from 'lucide-react';
import { api } from '../../../api';
import { useDatos } from '../../../useDatos';
import { AreaTexto, Aviso, Campo, Cargando, Etiqueta, Selector, Volver } from '../../../componentes';
import { TIPOS_EQUIPO, TIPOS_MANTENCION, fechaCorta, hoyISO } from '../../../formato';
import { CamposEquipo, EQUIPO_VACIO, VIDA_UTIL, describirEquipo, equipoParaApi, vidaUtil, type DatosEquipo } from './comun';
import type { FichaInstalacion } from './InstalacionFicha';

export const MOTIVOS_CAMBIO = ['Fin de vida útil', 'Falla', 'Daño (golpe, clima o robo)', 'Mejora o ampliación', 'Garantía', 'Otro'];

export function Pasos({ pasos, actual }: { pasos: string[]; actual: number }) {
  return (
    <ol className="pasos">
      {pasos.map((p, k) => (
        <li key={p} className={k === actual ? 'actual' : k < actual ? 'hecho' : ''}><span>{k + 1}</span>{p}</li>
      ))}
    </ol>
  );
}

export default function ReemplazarEquipo() {
  const { id } = useParams();
  const desdeMantencion = useSearchParams()[0].get('mantencion') ?? '';
  const { datos: i, error: errorCarga } = useDatos<FichaInstalacion>(`/admin/instalaciones/${id}`);
  const [paso, setPaso] = useState(0);
  const [equipoId, setEquipoId] = useState<number | null>(null);
  const [motivo, setMotivo] = useState({ motivo: MOTIVOS_CAMBIO[0], fecha_retiro: hoyISO(), mantencion_id: desdeMantencion, notas: '' });
  const [nuevo, setNuevo] = useState<DatosEquipo>(EQUIPO_VACIO);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  if (!i) return errorCarga ? <Aviso>{errorCarga}</Aviso> : <Cargando />;
  const activos = i.equipos.filter((e) => e.activo);
  const viejo = activos.find((e) => e.id === equipoId) ?? null;
  const nombreViejo = viejo ? describirEquipo(viejo) : '';

  const continuar = () => {
    setError('');
    if (paso === 0) {
      if (!viejo) return setError('Elige el equipo que se retira');
      setNuevo({ ...EQUIPO_VACIO, tipo: viejo.tipo, cantidad: String(viejo.cantidad), fecha_instalacion: motivo.fecha_retiro, vida_util_anios: VIDA_UTIL[viejo.tipo] ?? '' });
    }
    if (paso === 1 && !motivo.fecha_retiro) return setError('Indica la fecha de retiro');
    setPaso(paso + 1);
  };

  const guardar = async () => {
    setError('');
    setGuardando(true);
    try {
      await api(`/admin/instalaciones/${i.id}/equipos/${equipoId}/reemplazar`, {
        method: 'POST', body: { ...motivo, mantencion_id: motivo.mantencion_id || null, nuevo: equipoParaApi(nuevo) },
      });
      setPaso(3);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <>
      <Volver a={`/admin/instalaciones/${i.id}`} texto={`${i.nombre || i.direccion} · ${i.codigo}`} />
      <h1 className="titulo-pagina">Reemplazar equipo</h1>
      <Pasos pasos={['Equipo a cambiar', 'Motivo', 'Equipo nuevo']} actual={paso} />

      {paso === 0 && (
        <div className="tarjeta asistente">
          <h2>¿Qué equipo se retira?</h2>
          <div className="opciones-radio">
            {activos.map((e) => {
              const [t, v] = vidaUtil(e);
              return (
                <label key={e.id} className={equipoId === e.id ? 'elegida' : ''}>
                  <input type="radio" name="equipo" checked={equipoId === e.id} onChange={() => setEquipoId(e.id)} />
                  <span><strong>{TIPOS_EQUIPO[e.tipo]} · {describirEquipo(e)}</strong>
                    <small>{[e.marca, e.fecha_instalacion && `desde ${fechaCorta(e.fecha_instalacion)}`, e.numero_serie].filter(Boolean).join(' · ')}</small></span>
                  {t !== 'buena' && <Etiqueta tono={t}>{v}</Etiqueta>}
                </label>
              );
            })}
          </div>
        </div>
      )}

      {paso === 1 && (
        <div className="tarjeta asistente">
          <h2>¿Por qué se cambia {nombreViejo}?</h2>
          <div className="formulario dos">
            <Selector etiqueta="Motivo" value={motivo.motivo} onChange={(e) => setMotivo({ ...motivo, motivo: e.target.value })}>
              {MOTIVOS_CAMBIO.map((m) => <option key={m}>{m}</option>)}
            </Selector>
            <Campo etiqueta="Fecha de retiro" type="date" value={motivo.fecha_retiro} onChange={(e) => setMotivo({ ...motivo, fecha_retiro: e.target.value })} />
            <div className="completo">
              <Selector etiqueta="Mantención en que se cambió (opcional)" value={motivo.mantencion_id} onChange={(e) => setMotivo({ ...motivo, mantencion_id: e.target.value })}>
                <option value="">Ninguna</option>
                {i.mantenciones.filter((m) => m.estado !== 'cancelada').map((m) => (
                  <option key={m.id} value={m.id}>{fechaCorta(m.fecha_realizada ?? m.fecha_programada)} · {TIPOS_MANTENCION[m.tipo]} · {m.tecnico ?? 'sin técnico'}</option>
                ))}
              </Selector>
            </div>
            <div className="completo"><AreaTexto etiqueta="Notas (opcional)" placeholder="Capacidad medida 68 %. El cliente aceptó la cotización." value={motivo.notas} onChange={(e) => setMotivo({ ...motivo, notas: e.target.value })} /></div>
          </div>
        </div>
      )}

      {paso === 2 && (
        <div className="tarjeta asistente">
          <h2>Datos del equipo nuevo</h2>
          <CamposEquipo e={nuevo} cambiar={setNuevo} fijarTipo />
          <p className="nota-info"><Info size={16} /><span>{nombreViejo} quedará como <strong>retirado</strong> (no se borra).</span></p>
        </div>
      )}

      {paso === 3 ? (
        <div className="tarjeta asistente centrado">
          <span className="icono-circulo chico"><Check size={30} /></span>
          <h2>Reemplazo guardado</h2>
          <p className="suave">{nombreViejo} quedó retirado y el equipo nuevo ya aparece en los equipos de {i.nombre || i.codigo}.</p>
          <Link to={desdeMantencion ? `/admin/mantenciones/${desdeMantencion}` : `/admin/instalaciones/${i.id}`} className="boton primario chico">{desdeMantencion ? 'Volver a la mantención' : 'Volver a la instalación'}</Link>
        </div>
      ) : (
        <>
          <Aviso>{error}</Aviso>
          <div className="asistente-botones">
            {paso === 0
              ? <Link to={`/admin/instalaciones/${i.id}`} className="boton suave chico">Cancelar</Link>
              : <button type="button" className="boton suave chico" onClick={() => setPaso(paso - 1)}>Atrás</button>}
            {paso < 2
              ? <button type="button" className="boton primario chico" onClick={continuar}>Continuar</button>
              : <button type="button" className="boton primario chico" disabled={guardando} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar reemplazo'}</button>}
          </div>
        </>
      )}
    </>
  );
}
