// RF-08 · HU-7: registro e inicio de sesión
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../config/db.js';
import { autenticar, JWT_SECRET } from '../middleware/auth.js';
import { normalizarRut, correoValido, ErrorHttp } from '../utils/validar.js';

const router = Router();

function emitirToken(usuario) {
  const datos = { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol };
  return { token: jwt.sign(datos, JWT_SECRET, { expiresIn: '8h' }), usuario: datos };
}

// Registro del cliente. Si el administrador ya lo había creado (mismo RUT), se vincula.
router.post('/registro', async (req, res) => {
  const { nombre, rut, correo, telefono, password } = req.body;
  const rutNormal = normalizarRut(rut);
  if (!nombre?.trim()) throw new ErrorHttp(400, 'Ingresa tu nombre');
  if (!rutNormal) throw new ErrorHttp(400, 'El RUT no es válido');
  if (!correoValido(correo)) throw new ErrorHttp(400, 'El correo no es válido');
  if (!password || password.length < 8) throw new ErrorHttp(400, 'La contraseña debe tener al menos 8 caracteres');

  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const existeCorreo = await db.query('SELECT 1 FROM usuario WHERE lower(correo) = lower($1)', [correo]);
    if (existeCorreo.rowCount) throw new ErrorHttp(409, 'Ya existe una cuenta con ese correo');

    const { rows: [cliente] } = await db.query('SELECT id, usuario_id FROM cliente WHERE rut = $1', [rutNormal]);
    if (cliente?.usuario_id) throw new ErrorHttp(409, 'Ese RUT ya tiene una cuenta. Inicia sesión.');

    const hash = await bcrypt.hash(password, 10);
    const { rows: [usuario] } = await db.query(
      `INSERT INTO usuario (nombre, correo, password_hash, telefono, rol)
       VALUES ($1, lower($2), $3, $4, 'cliente') RETURNING id, nombre, rol`,
      [nombre.trim(), correo.trim(), hash, telefono || null]
    );

    if (cliente) {
      await db.query(
        'UPDATE cliente SET usuario_id = $1, correo = COALESCE(correo, lower($2)), telefono = COALESCE(telefono, $3) WHERE id = $4',
        [usuario.id, correo.trim(), telefono || null, cliente.id]
      );
    } else {
      await db.query(
        'INSERT INTO cliente (usuario_id, rut, nombre, correo, telefono) VALUES ($1, $2, $3, lower($4), $5)',
        [usuario.id, rutNormal, nombre.trim(), correo.trim(), telefono || null]
      );
    }
    await db.query('COMMIT');
    res.status(201).json(emitirToken(usuario));
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  } finally {
    db.release();
  }
});

router.post('/login', async (req, res) => {
  const { correo, password } = req.body;
  const { rows: [usuario] } = await pool.query(
    'SELECT id, nombre, rol, password_hash, activo FROM usuario WHERE lower(correo) = lower($1)',
    [correo || '']
  );
  const ok = usuario && (await bcrypt.compare(password || '', usuario.password_hash));
  if (!ok) throw new ErrorHttp(401, 'Correo o contraseña incorrectos');
  if (!usuario.activo) throw new ErrorHttp(403, 'Tu cuenta está desactivada');
  res.json(emitirToken(usuario));
});

router.get('/yo', autenticar, (req, res) => {
  res.json({ usuario: req.usuario });
});

export default router;
