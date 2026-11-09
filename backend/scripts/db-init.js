// Crea (o vuelve a crear) el esquema en Supabase y carga los datos de prueba: npm run db:init
// ¡Borra todo lo anterior! Úsalo solo en desarrollo.
//   1. 00_reiniciar.sql   borra tablas, vistas y tipos del esquema
//   2. 01_esquema_eninti  esquema completo (tablas, triggers, vistas, RLS, storage, pg_cron)
//   3. 02_ajustes.sql     ajustes de la revisión (9 puntos)
//   4. 03_datos_prueba    datos de prueba ficticios
//   5. 04_pagos_flow.sql  tarjetas inscritas y cobros en línea con Flow
//   6. 05_plazo_pago.sql  días de plazo antes de cerrar por falta de pago
//   7. 06_mantenciones    motivo de cancelación y notas de la mantención
//   5. usuarios de prueba en Supabase Auth (el trigger los vincula por correo)
import { readFile } from 'node:fs/promises';

if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes('PEGA_AQUI')) {
  console.error('✘ Falta DATABASE_URL. Copia backend/.env.example como backend/.env y pon la contraseña de la base de Supabase.');
  process.exit(1);
}
// La contraseña de los usuarios de prueba vive solo en .env (y no en el repositorio, que es público)
const DEMO_PASSWORD = process.env.DEMO_PASSWORD?.trim();
if (!DEMO_PASSWORD || DEMO_PASSWORD.length < 8) {
  console.error('✘ Falta DEMO_PASSWORD (mínimo 8 caracteres) en backend/.env: es la contraseña de los usuarios de prueba.');
  process.exit(1);
}

const { pool } = await import('../src/config/db.js');
const { supabase } = await import('../src/config/supabase.js');

const AYUDA = {
  '28P01': 'La contraseña de DATABASE_URL en backend/.env no es correcta (Supabase → Project Settings → Database).',
  XX000: 'Supabase no reconoce el usuario o la región de DATABASE_URL. Copia la cadena del Session pooler desde "Connect".',
  ENOTFOUND: 'No se encontró el servidor de DATABASE_URL. Revisa el host del pooler y tu conexión a internet.',
  ETIMEDOUT: 'No se pudo conectar a Supabase a tiempo. Revisa el host y el puerto de DATABASE_URL.',
};

// Versión de las condiciones del servicio que aceptaron los clientes de prueba (condiciones_servicio)
const VERSION_CONDICIONES = 'v1';

const sql = (ruta) => readFile(new URL(`../../database/${ruta}`, import.meta.url), 'utf8');

const USUARIOS = [
  { email: 'admin@eninti.cl', nombre: 'Administrador ENINTI', telefono: '+56911111111', admin: true },
  { email: 'tecnico@eninti.cl', nombre: 'Pedro Técnico', telefono: '+56922222222' },
  { email: 'carla@eninti.cl', nombre: 'Carla Técnica', telefono: '+56977777777' },
  { email: 'maria.rojas@correo.cl', nombre: 'María Rojas', telefono: '+56933333333', condiciones: true },
  { email: 'juan.perez@correo.cl', nombre: 'Juan Pérez', telefono: '+56944444444', condiciones: true },
];

// Borra de Supabase Auth los usuarios de prueba que existan de una ejecución anterior
async function borrarUsuariosDePrueba() {
  const correos = new Set(USUARIOS.map((u) => u.email));
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const u of data.users.filter((x) => correos.has(x.email))) {
      const { error: e } = await supabase.auth.admin.deleteUser(u.id);
      if (e) throw e;
    }
    if (data.users.length < 1000) break;
  }
}

try {
  console.log('… Conectando a Supabase');
  await pool.query('SELECT 1');
  await pool.query(await sql('schema/00_reiniciar.sql'));
  await borrarUsuariosDePrueba();
  console.log('✔ Esquema anterior borrado');
  await pool.query(await sql('schema/01_esquema_eninti.sql'));
  // 02 va aparte: agrega un valor al enum medio_pago que el 03 usa (no puede ser la misma transacción)
  await pool.query(await sql('schema/02_ajustes.sql'));
  console.log('✔ Esquema creado');
  await pool.query(await sql('seeds/03_datos_prueba.sql'));
  console.log('✔ Datos de prueba cargados');
  await pool.query(await sql('schema/04_pagos_flow.sql'));
  console.log('✔ Pagos en línea (Flow)');
  await pool.query(await sql('schema/05_plazo_pago.sql'));
  await pool.query(await sql('schema/06_mantenciones.sql'));

  for (const u of USUARIOS) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: u.email,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: {
        nombre: u.nombre,
        telefono: u.telefono,
        ...(u.condiciones && { condiciones_version: VERSION_CONDICIONES, condiciones_at: new Date().toISOString() }),
      },
    });
    if (error) throw error;
    if (u.admin) await pool.query("UPDATE perfiles SET rol = 'admin' WHERE id = $1", [data.user.id]);
    if (u.condiciones) {
      // el trigger del script 02 completa condiciones_id según la versión
      await pool.query(
        `UPDATE suscripciones s SET acepto_condiciones_at = now(), version_condiciones = $2
         FROM instalaciones i JOIN clientes c ON c.id = i.cliente_id
         WHERE s.instalacion_id = i.id AND c.perfil_id = $1 AND s.estado = 'vigente'`,
        [data.user.id, VERSION_CONDICIONES]
      );
    }
  }
  if (process.env.ADMIN_EMAIL) {
    await pool.query("UPDATE configuracion SET valor = $1 WHERE clave = 'email_admin'", [process.env.ADMIN_EMAIL.trim()]);
    console.log(`✔ Avisos del administrador a ${process.env.ADMIN_EMAIL.trim()}`);
  }
  const { rows } = await pool.query('SELECT rol, count(*)::int AS n FROM perfiles GROUP BY rol ORDER BY rol');
  console.log('✔ Usuarios de prueba creados:', rows.map((r) => `${r.n} ${r.rol}`).join(', '));
} catch (err) {
  console.error('✘ Error al inicializar la base:', AYUDA[err.code] || err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
