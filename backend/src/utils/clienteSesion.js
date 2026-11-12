// Ficha del cliente que tiene la sesión abierta (el portal nunca recibe un cliente_id del navegador).
import { pool } from '../config/db.js';
import { ErrorHttp } from './validar.js';

// Si la cuenta no está vinculada a una ficha, se busca la ficha con el mismo correo y se vincula.
// Pasa cuando se corrige el correo después de enviar la invitación: la ficha queda apuntando a la
// cuenta del correo anterior, que nunca se activó.
export async function clienteDeSesion(req, columnas = 'c.id') {
  const sql = `SELECT ${columnas} FROM clientes c LEFT JOIN localidades l ON l.id = c.localidad_id WHERE c.perfil_id = $1`;
  let { rows: [c] } = await pool.query(sql, [req.usuario.id]);
  if (!c && req.usuario.rol === 'cliente') {
    const { rowCount } = await pool.query(
      `UPDATE clientes c SET perfil_id = $1
       WHERE lower(c.email) = (SELECT lower(email) FROM auth.users WHERE id = $1)
         AND (c.perfil_id IS NULL OR NOT EXISTS (
               SELECT 1 FROM auth.users u WHERE u.id = c.perfil_id AND u.email_confirmed_at IS NOT NULL AND lower(u.email) = lower(c.email)))`,
      [req.usuario.id]);
    if (rowCount) ({ rows: [c] } = await pool.query(sql, [req.usuario.id]));
  }
  if (!c) throw new ErrorHttp(404, 'Tu cuenta no está asociada a un cliente. Escríbenos para revisarlo.');
  return c;
}
