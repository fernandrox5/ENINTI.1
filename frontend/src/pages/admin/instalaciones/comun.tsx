// T-24: piezas compartidas de instalaciones y equipos
import { api } from '../../../api';
import { Campo, Selector, type Tono } from '../../../componentes';
import { TIPOS_EQUIPO, fechaCorta, mes } from '../../../formato';

export interface Opciones {
  localidades: { id: number; nombre: string; comuna: string }[];
  tecnicos: { id: number; nombre: string; empresa: string | null }[];
  planes: { id: number; codigo: string; nombre: string; frecuencia_pago: string; monto_clp: number; duracion_meses: number; mantenciones_por_anio: number }[];
  condiciones: { id: number; version: string; vigente_desde: string } | null;
}

export interface DatosEquipo {
  tipo: string; marca: string; modelo: string; cantidad: string; potencia_unitaria_w: string; capacidad_kwh: string;
  numero_serie: string; fecha_instalacion: string; garantia_hasta: string; vida_util_anios: string;
}
export const EQUIPO_VACIO: DatosEquipo = {
  tipo: 'panel', marca: '', modelo: '', cantidad: '1', potencia_unitaria_w: '', capacidad_kwh: '',
  numero_serie: '', fecha_instalacion: '', garantia_hasta: '', vida_util_anios: '',
};
// Vida útil típica por tipo, para sugerir
export const VIDA_UTIL: Record<string, string> = { panel: '25', inversor: '10', bateria: '10', estructura: '25', medidor: '15', otro: '' };

export const SISTEMAS_LARGO: Record<string, string> = { on_grid: 'On-grid (conectado a la red)', off_grid: 'Off-grid (aislado)', hibrido: 'Híbrido (red + baterías)' };

// "Monocristalino 450 W × 12", "Batería 5,1 kWh"
export function describirEquipo(e: { tipo: string; modelo?: string | null; potencia_unitaria_w?: string | number | null; capacidad_kwh?: string | number | null; cantidad?: number | string | null }) {
  const medida = e.capacidad_kwh ? `${Number(e.capacidad_kwh).toLocaleString('es-CL')} kWh` : e.potencia_unitaria_w ? `${Number(e.potencia_unitaria_w).toLocaleString('es-CL')} W` : '';
  // Si el modelo ya dice la medida ("Vertex 550 W"), no se repite
  const repetida = medida && e.modelo?.replace(/\s/g, '').toLowerCase().includes(medida.replace(/\s/g, '').toLowerCase());
  const base = [e.modelo || TIPOS_EQUIPO[e.tipo], repetida ? '' : medida].filter(Boolean).join(' · ');
  return Number(e.cantidad) > 1 ? `${base} × ${e.cantidad}` : base;
}

// Estado de la vida útil: "Bien · 2042", "Fin de vida mar 2027", "Vida útil cumplida", "Retirado"
export function vidaUtil(e: { activo: boolean; fin_vida_util?: string | null }): [Tono, string] {
  if (!e.activo) return ['neutra', 'Retirado'];
  if (!e.fin_vida_util) return ['neutra', 'Sin dato'];
  const hoy = new Date().toISOString().slice(0, 10);
  const enUnAnio = new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10);
  if (e.fin_vida_util < hoy) return ['mala', 'Vida útil cumplida'];
  if (e.fin_vida_util <= enUnAnio) return ['alerta', `Fin de vida ${mes(e.fin_vida_util).replace(/^(\w{3})\w*/, '$1')}`];
  return ['buena', `Bien · ${e.fin_vida_util.slice(0, 4)}`];
}

export const fechaOGuion = (f?: string | null) => (f ? fechaCorta(f) : '—');

// Campos de un equipo (agregar, alta y reemplazo)
export function CamposEquipo({ e, cambiar, fijarTipo }: { e: DatosEquipo; cambiar: (e: DatosEquipo) => void; fijarTipo?: boolean }) {
  const c = (k: keyof DatosEquipo) => (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const nuevo = { ...e, [k]: ev.target.value };
    if (k === 'tipo' && !e.vida_util_anios) nuevo.vida_util_anios = VIDA_UTIL[ev.target.value] ?? '';
    cambiar(nuevo);
  };
  const esBateria = e.tipo === 'bateria';
  return (
    <div className="formulario tres">
      <Selector etiqueta="Tipo" value={e.tipo} onChange={c('tipo')} disabled={fijarTipo}>
        {Object.entries(TIPOS_EQUIPO).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
      </Selector>
      <Campo etiqueta="Modelo o descripción" placeholder={esBateria ? 'Litio 5,1 kWh' : 'Monocristalino 450 W'} value={e.modelo} onChange={c('modelo')} />
      <Campo etiqueta="Marca" value={e.marca} onChange={c('marca')} />
      <Campo etiqueta="Cantidad" type="number" min="1" value={e.cantidad} onChange={c('cantidad')} />
      {esBateria
        ? <Campo etiqueta="Capacidad (kWh)" type="number" step="0.1" min="0" value={e.capacidad_kwh} onChange={c('capacidad_kwh')} />
        : <Campo etiqueta="Potencia unitaria (W)" type="number" min="0" value={e.potencia_unitaria_w} onChange={c('potencia_unitaria_w')} />}
      <Campo etiqueta="N° de serie" value={e.numero_serie} onChange={c('numero_serie')} />
      <Campo etiqueta="Fecha de instalación" type="date" value={e.fecha_instalacion} onChange={c('fecha_instalacion')} />
      <Campo etiqueta="Garantía hasta" type="date" value={e.garantia_hasta} onChange={c('garantia_hasta')} />
      <Campo etiqueta="Vida útil (años)" type="number" min="1" value={e.vida_util_anios} onChange={c('vida_util_anios')} />
    </div>
  );
}

// Convierte el formulario a lo que espera la API (números vacíos → null)
export const equipoParaApi = (e: DatosEquipo) => Object.fromEntries(Object.entries(e).map(([k, v]) => [k, v === '' ? null : v]));

// Sube un archivo a Supabase Storage (URL firmada) y lo registra como documento de la instalación
export async function subirArchivo(instalacionId: number, archivo: File, datos: { nombre: string; tipo: string; visible_cliente: boolean; mantencion_id?: number }) {
  if (archivo.size > 20 * 1024 * 1024) throw new Error(`${archivo.name} pesa más de 20 MB`);
  const { ruta, url } = await api<{ ruta: string; url: string }>(`/admin/instalaciones/${instalacionId}/documentos/subida`, { method: 'POST', body: { archivo: archivo.name } });
  const cuerpo = new FormData();
  cuerpo.append('cacheControl', '3600');
  cuerpo.append('', archivo);
  const r = await fetch(url, { method: 'PUT', headers: { 'x-upsert': 'false' }, body: cuerpo });
  if (!r.ok) throw new Error(`No se pudo subir ${archivo.name}`);
  return api<{ id: number }>(`/admin/instalaciones/${instalacionId}/documentos`, { method: 'POST', body: { ...datos, ruta } });
}
