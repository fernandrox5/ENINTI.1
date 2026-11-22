// Preparación común de las pruebas de integración: base en memoria, fecha fija y app de Express
// con Supabase, Flow y el correo simulados (no sale nada a internet).
import { vi } from 'vitest';
import request from 'supertest';
import { crearBase, cargarSql } from './db/base.js';

export const ADMIN = '00000000-0000-0000-0000-00000000a001';

export async function levantar({ puerto, semilla = true, hoy = '2026-11-30' }) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${hoy}T12:00:00-03:00`));
  const base = await crearBase({ hoy, puerto });
  if (semilla) await cargarSql(base.db, 'backend/tests/datos/seed_pruebas.sql');
  else await base.db.exec(`insert into auth.users (id, email, email_confirmed_at) values ('${ADMIN}', 'admin@pruebas.test', now());
                           update perfiles set rol = 'admin' where id = '${ADMIN}';`);
  Object.assign(process.env, {
    DATABASE_URL: base.url, MAIL_ENABLED: 'false', SUPABASE_URL: 'http://supabase.test',
    SUPABASE_SECRET_KEY: 'prueba', SUPABASE_PUBLISHABLE_KEY: 'prueba',
  });
  const app = (await import('../src/app.js')).default;
  const como = (token) => ({
    get: (ruta) => request(app).get(ruta).set('Authorization', `Bearer ${token}`),
    post: (ruta, body) => request(app).post(ruta).set('Authorization', `Bearer ${token}`).send(body),
  });
  const cerrar = async () => {
    vi.useRealTimers();
    const { pool } = await import('../src/config/db.js');
    await pool.end();
    await base.cerrar();
  };
  return { base, app, como, cerrar };
}

// Los mocks se declaran en cada archivo de prueba (vi.mock se eleva al inicio del archivo)
export const mockSupabase = () => ({
  verifyCredentials: async ({ token }) => ({ data: { userClaims: { id: token } }, error: null }),
  createAdminClient: () => ({}),
  createContextClient: () => ({}),
});
