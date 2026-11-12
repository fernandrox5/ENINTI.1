// T-32 · Informe de una mantención: la deja "realizada" (o corrige el informe). Lo usan el
// administrador y el técnico desde su panel; lo ve el cliente en su portal.
import { pool } from '../config/db.js';
import { ErrorHttp } from '../utils/validar.js';
import { notificar } from './notificar.js';

const vacio = (v) => (v === '' || v === undefined ? null : v);
const fechaValida = (f) => /^\d{4}-\d{2}-\d{2}$/.test(f || '') && !Number.isNaN(Date.parse(f));
const horaValida = (h) => /^\d{2}:\d{2}$/.test(h || '');
const hoyChile = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });

// tecnicoId fuerza el técnico (el técnico solo informa sus propias visitas)
export async function guardarInforme(id, b, { tecnicoId = null } = {}) {
  const fecha = vacio(b.fecha_realizada);
  if (!fechaValida(fecha)) throw new ErrorHttp(400, 'Indica la fecha en que se realizó');
  if (fecha > hoyChile()) throw new ErrorHttp(400, 'La fecha realizada no puede ser futura');
  const trabajo = String(b.trabajo_realizado || '').trim();
  if (trabajo.length < 5) throw new ErrorHttp(400, 'Describe el trabajo realizado');
  const [hi, hf] = [vacio(b.hora_inicio), vacio(b.hora_fin)];
  if ((hi && !horaValida(hi)) || (hf && !horaValida(hf))) throw new ErrorHttp(400, 'La hora no es válida');
  if (hi && hf && hf <= hi) throw new ErrorHttp(400, 'La hora de término debe ser posterior a la de inicio');
  const tecnico = tecnicoId ?? vacio(b.tecnico_id);
  if (!tecnico) throw new ErrorHttp(400, 'Indica el técnico que hizo la visita');
  const { rowCount: existe } = await pool.query('SELECT 1 FROM tecnicos WHERE id = $1 AND activo', [tecnico]);
  if (!existe) throw new ErrorHttp(400, 'El técnico no existe o está inactivo');
  const inversion = b.requiere_inversion === true;
  const detalle = String(b.detalle_inversion || '').trim();
  if (inversion && !detalle) throw new ErrorHttp(400, 'Indica qué inversión se recomienda');
  const costo = vacio(b.costo_adicional) ?? 0;
  if (!(Number.isInteger(Number(costo)) && Number(costo) >= 0)) throw new ErrorHttp(400, 'El costo adicional debe ser un número entero');
  const { rowCount } = await pool.query(
    `UPDATE mantenciones SET estado = 'realizada', fecha_realizada = $2, hora_inicio = $3, hora_fin = $4, tecnico_id = $5,
            trabajo_realizado = $6, hallazgos = $7, recomendaciones = $8, requiere_inversion = $9, detalle_inversion = $10, costo_adicional = $11
     WHERE id = $1 AND estado IN ('programada', 'realizada') ${tecnicoId ? 'AND tecnico_id = $5' : ''}`,
    [id, fecha, hi, hf, tecnico, trabajo, vacio(String(b.hallazgos || '').trim()), vacio(String(b.recomendaciones || '').trim()),
     inversion, inversion ? detalle : null, Number(costo)]);
  if (!rowCount) throw new ErrorHttp(409, tecnicoId ? 'Esta visita no está asignada a ti o fue cancelada' : 'Una mantención cancelada no lleva informe');
  await notificar('informe_listo', { mantencion_id: Number(id) });
  // La solicitud que originó la visita queda atendida al enviar el informe
  await pool.query(
    `UPDATE solicitudes SET estado = 'resuelta', atendida_at = coalesce(atendida_at, now())
     WHERE estado IN ('nueva', 'en_proceso') AND id = (SELECT solicitud_id FROM mantenciones WHERE id = $1)`, [id]);
}
