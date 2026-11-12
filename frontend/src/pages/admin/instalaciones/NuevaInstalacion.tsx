// T-24 · Mockups 066 a 071: asistente de alta — cliente, instalación, equipos, suscripción y confirmar.
// Al confirmar puede enviar la invitación al portal (acceso por invitación).
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Check, Plus, Search, Trash2 } from 'lucide-react';
import { api } from '../../../api';
import { useDatos } from '../../../useDatos';
import { Aviso, Campo, Selector, Volver } from '../../../componentes';
import { TIPOS_EQUIPO, formatearRut, hoyISO } from '../../../formato';
import { CamposEquipo, EQUIPO_VACIO, SISTEMAS_LARGO, describirEquipo, equipoParaApi, type DatosEquipo, type Opciones } from './comun';
import { CamposInstalacion, type DatosInstalacion } from './InstalacionFicha';
import { Pasos } from './ReemplazarEquipo';

interface ClienteBuscado { id: number; nombre: string; rut: string | null; localidad: string | null; portal: string }
interface ClienteFicha { id: number; nombre: string; rut: string | null; email: string | null; direccion: string | null; localidad_id: number | null; acceso_activado: string | null }
interface Resultado { cliente_id: number; instalacion_id: number; codigo: string; mantenciones: number; invitacion: { enviada: boolean; correo?: string; error?: string; aviso?: boolean } | null }

const CLIENTE_VACIO = { nombre: '', rut: '', email: '', telefono: '', direccion: '', localidad_id: '', es_empresa: false, origen: '' };
const INSTALACION_VACIA: DatosInstalacion = {
  nombre: '', direccion: '', localidad_id: '', latitud: '', longitud: '', fecha_instalacion: hoyISO(), potencia_kwp: '', tipo_sistema: '',
  instalada_por_eninti: true, instalador_id: '', notas: '',
};

export default function NuevaInstalacion() {
  const [params] = useSearchParams();
  const { datos: op } = useDatos<Opciones>('/admin/instalaciones/opciones');
  const [paso, setPaso] = useState(0);
  const [modoCliente, setModoCliente] = useState<'nuevo' | 'existente'>(params.get('cliente') ? 'existente' : 'nuevo');
  const [cliente, setCliente] = useState(CLIENTE_VACIO);
  const [existente, setExistente] = useState<ClienteFicha | null>(null);
  const [inst, setInst] = useState<DatosInstalacion>(INSTALACION_VACIA);
  const [equipos, setEquipos] = useState<DatosEquipo[]>([]);
  const [borrador, setBorrador] = useState<DatosEquipo | null>(null);
  const [invitar, setInvitar] = useState(true);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  // Cliente preseleccionado desde su ficha (?cliente=id)
  useEffect(() => {
    const id = params.get('cliente');
    if (id) api<ClienteFicha>(`/admin/clientes/${id}`).then(elegirExistente).catch(() => {});
  }, [params]);

  function elegirExistente(c: ClienteFicha) {
    setExistente(c);
    setInst((i) => ({ ...i, direccion: i.direccion || c.direccion || '', localidad_id: i.localidad_id || (c.localidad_id ? String(c.localidad_id) : '') }));
  }

  const correo = modoCliente === 'nuevo' ? cliente.email.trim() : existente?.email ?? '';
  const yaActivo = modoCliente === 'existente' && Boolean(existente?.acceso_activado);
  const nombreCliente = modoCliente === 'nuevo' ? cliente.nombre : existente?.nombre ?? '';
  const c = (k: keyof DatosInstalacion) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setInst({ ...inst, [k]: e.target.value });

  const continuar = () => {
    setError('');
    if (paso === 0) {
      if (modoCliente === 'existente' && !existente) return setError('Busca y elige el cliente');
      if (modoCliente === 'nuevo' && !cliente.nombre.trim()) return setError('El nombre del cliente es obligatorio');
      if (modoCliente === 'nuevo' && !inst.direccion) setInst({ ...inst, direccion: cliente.direccion, localidad_id: inst.localidad_id || cliente.localidad_id });
    }
    if (paso === 1 && !inst.direccion.trim()) return setError('La dirección de la instalación es obligatoria');
    if (paso === 2 && borrador) return setError('Agrega o descarta el equipo que estás escribiendo');
    setPaso(paso + 1);
  };

  const crear = async () => {
    setError('');
    setGuardando(true);
    try {
      const r = await api<Resultado>('/admin/instalaciones/alta', {
        method: 'POST',
        body: {
          cliente: modoCliente === 'existente' ? { id: existente!.id } : { ...cliente, localidad_id: cliente.localidad_id || null },
          instalacion: inst,
          equipos: equipos.map(equipoParaApi),
          invitar: invitar && Boolean(correo) && !yaActivo,
        },
      });
      setResultado(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  };

  if (resultado) {
    return (
      <>
        <h1 className="titulo-pagina">Nueva instalación</h1>
        <div className="tarjeta asistente centrado">
          <span className="icono-circulo chico"><Check size={30} /></span>
          <h2>Instalación creada · {resultado.codigo}</h2>
          <p className="suave">
            {nombreCliente} ya tiene su instalación.{resultado.invitacion?.enviada ? (resultado.invitacion.aviso ? ` Le avisamos por correo a ${resultado.invitacion.correo}.` : ` Le enviamos la invitación a ${resultado.invitacion.correo}.`) : ''}
          </p>
          {resultado.invitacion && !resultado.invitacion.enviada && <Aviso>La instalación quedó creada, pero no se pudo enviar la invitación: {resultado.invitacion.error}. Puedes reenviarla desde la ficha del cliente.</Aviso>}
          <div className="acciones centro">
            <Link to={`/admin/clientes/${resultado.cliente_id}`} className="boton secundario chico">Ver cliente</Link>
            <Link to={`/admin/instalaciones/${resultado.instalacion_id}`} className="boton primario chico">Ver instalación</Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Volver a="/admin/instalaciones" texto="Instalaciones" />
      <h1 className="titulo-pagina">Nueva instalación</h1>
      <Pasos pasos={['Cliente', 'Instalación', 'Equipos', 'Confirmar']} actual={paso} />

      {paso === 0 && (
        <div className="tarjeta asistente">
          <header>
            <h2>Cliente</h2>
            <div className="segmentos chicos">
              <button type="button" className={modoCliente === 'nuevo' ? 'activo' : ''} onClick={() => setModoCliente('nuevo')}>Cliente nuevo</button>
              <button type="button" className={modoCliente === 'existente' ? 'activo' : ''} onClick={() => setModoCliente('existente')}>Cliente existente</button>
            </div>
          </header>
          {modoCliente === 'nuevo' ? (
            <div className="formulario tres">
              <Campo etiqueta="Nombre o razón social" value={cliente.nombre} onChange={(e) => setCliente({ ...cliente, nombre: e.target.value })} />
              <Campo etiqueta="RUT" placeholder="16.432.778-1" value={cliente.rut} onChange={(e) => setCliente({ ...cliente, rut: e.target.value })} onBlur={() => setCliente({ ...cliente, rut: formatearRut(cliente.rut) })} />
              <Campo etiqueta="Correo" type="email" value={cliente.email} onChange={(e) => setCliente({ ...cliente, email: e.target.value })} ayuda="Para enviarle el acceso al portal" />
              <Campo etiqueta="Teléfono" type="tel" placeholder="+56 9 8765 4321" value={cliente.telefono} onChange={(e) => setCliente({ ...cliente, telefono: e.target.value })} />
              <Campo etiqueta="Dirección" value={cliente.direccion} onChange={(e) => setCliente({ ...cliente, direccion: e.target.value })} />
              <Selector etiqueta="Localidad" value={cliente.localidad_id} onChange={(e) => setCliente({ ...cliente, localidad_id: e.target.value })}>
                <option value="">Sin indicar</option>
                {op?.localidades.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
              </Selector>
            </div>
          ) : (
            <BuscarCliente elegido={existente} elegir={(id) => api<ClienteFicha>(`/admin/clientes/${id}`).then(elegirExistente)} />
          )}
        </div>
      )}

      {paso === 1 && (
        <div className="tarjeta asistente">
          <h2>Instalación</h2>
          <div className="formulario dos">
            <CamposInstalacion f={inst} c={c} setF={setInst} op={op} codigo="INS-…" />
          </div>
        </div>
      )}

      {paso === 2 && (
        <div className="tarjeta asistente">
          <header>
            <h2>Equipos instalados</h2>
            {!borrador && <button type="button" className="boton primario mini" onClick={() => setBorrador({ ...EQUIPO_VACIO, fecha_instalacion: inst.fecha_instalacion, vida_util_anios: '25' })}><Plus size={16} /> Agregar equipo</button>}
          </header>
          {equipos.length === 0 && !borrador && <p className="suave">Sin equipos todavía (puedes agregarlos después).</p>}
          <ul className="lista-equipos">
            {equipos.map((e, k) => (
              <li key={k}>
                <strong>{TIPOS_EQUIPO[e.tipo]}</strong><span>{describirEquipo({ ...e, cantidad: e.cantidad })}</span><span className="suave">{e.marca || '—'}</span>
                <span className="suave">{e.vida_util_anios ? `Vida útil ${e.vida_util_anios} años` : ''}</span>
                <button type="button" className="icono-boton chico" aria-label="Quitar" onClick={() => setEquipos(equipos.filter((_, j) => j !== k))}><Trash2 size={16} /></button>
              </li>
            ))}
          </ul>
          {borrador && (
            <div className="borrador">
              <CamposEquipo e={borrador} cambiar={setBorrador} />
              <div className="botones">
                <button type="button" className="boton secundario mini" onClick={() => setBorrador(null)}>Descartar</button>
                <button type="button" className="boton primario mini" onClick={() => { setEquipos([...equipos, borrador]); setBorrador(null); }}>Agregar a la lista</button>
              </div>
            </div>
          )}
        </div>
      )}

      {paso === 3 && (
        <div className="tarjeta asistente">
          <h2>Revisa antes de crear</h2>
          <dl className="datos columnas dos">
            <div><dt>Cliente</dt><dd>{nombreCliente}{modoCliente === 'nuevo' && cliente.rut ? ` · ${cliente.rut}` : existente?.rut ? ` · ${existente.rut}` : ''}{modoCliente === 'nuevo' ? ' (nuevo)' : ''}</dd></div>
            <div><dt>Equipos</dt><dd>{equipos.length ? `${equipos.length} tipos · ${equipos.reduce((s, e) => s + Number(e.cantidad || 1), 0)} unidades` : 'Sin equipos'}</dd></div>
            <div><dt>Instalación</dt><dd>{inst.nombre || inst.direccion}</dd></div>
            <div><dt>Sistema</dt><dd>{[inst.tipo_sistema && SISTEMAS_LARGO[inst.tipo_sistema], inst.potencia_kwp && `${inst.potencia_kwp} kWp`].filter(Boolean).join(' · ') || '—'}</dd></div>
          </dl>
          
          {yaActivo ? (
            <p className="suave nota">El cliente ya tiene cuenta: verá la instalación al ingresar.</p>
          ) : correo ? (
            <label className="check arriba"><input type="checkbox" checked={invitar} onChange={(e) => setInvitar(e.target.checked)} /> <span>Enviar invitación al portal a <strong>{correo}</strong></span></label>
          ) : (
            <p className="suave nota">Sin correo: podrás invitarlo después desde su ficha.</p>
          )}
        </div>
      )}

      <Aviso>{error}</Aviso>
      <div className="asistente-botones">
        {paso === 0
          ? <Link to="/admin/instalaciones" className="boton suave chico">Cancelar</Link>
          : <button type="button" className="boton suave chico" onClick={() => setPaso(paso - 1)}>Atrás</button>}
        {paso < 3
          ? <button type="button" className="boton primario chico" onClick={continuar}>Continuar</button>
          : <button type="button" className="boton primario chico" disabled={guardando} onClick={crear}>{guardando ? 'Creando…' : 'Crear instalación'}</button>}
      </div>
    </>
  );
}

function BuscarCliente({ elegido, elegir }: { elegido: ClienteFicha | null; elegir: (id: number) => void }) {
  const [q, setQ] = useState('');
  const [lista, setLista] = useState<ClienteBuscado[]>([]);
  useEffect(() => {
    const t = setTimeout(() => api<{ clientes: ClienteBuscado[] }>(`/admin/clientes?filtro=activos&q=${encodeURIComponent(q.trim())}`).then((r) => setLista(r.clientes)).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="formulario">
      <label className="buscador-icono"><Search size={18} /><input className="buscador" type="search" placeholder="Buscar por nombre, RUT o correo" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      <div className="opciones-radio">
        {lista.slice(0, 6).map((c) => (
          <label key={c.id} className={elegido?.id === c.id ? 'elegida' : ''}>
            <input type="radio" name="cliente" checked={elegido?.id === c.id} onChange={() => elegir(c.id)} />
            <span><strong>{c.nombre}</strong><small>{[c.rut, c.localidad].filter(Boolean).join(' · ') || 'Sin RUT'}</small></span>
          </label>
        ))}
        {lista.length === 0 && <p className="suave">No hay clientes que coincidan.</p>}
      </div>
    </div>
  );
}
