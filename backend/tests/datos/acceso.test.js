// CP-AUT · Inicio de sesión: límite de intentos (OWASP A07) y registro de intentos (A09).
// Supabase Auth se simula: la contraseña correcta es "Correcta123".
// También: aviso del portal cuando venció el plazo para pagar (DEF-07).
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { levantar, ADMIN } from '../comun.js';

vi.mock('@supabase/server/core', () => ({
  verifyCredentials: async ({ token }) => ({ data: { userClaims: { id: token } }, error: null }),
  createAdminClient: () => ({}),
  createContextClient: () => ({
    auth: {
      signInWithPassword: async ({ password }) => (password === 'Correcta123'
        ? { data: { session: { user: { id: '00000000-0000-0000-0000-00000000a001' }, access_token: 'tok', refresh_token: 'ref' } }, error: null }
        : { data: {}, error: { code: 'invalid_credentials' } }),
    },
  }),
}));
vi.mock('../../src/services/correo.js', async (o) => ({ ...(await o()), enviarCorreo: async () => ({}) }));

const SIETE = '00000000-0000-0000-0000-0000000c0007';
const SEIS = '00000000-0000-0000-0000-0000000c0006';
let t;
const ingresar = (password, correo = 'admin@pruebas.test') => request(t.app).post('/api/auth/login').send({ correo, password });

beforeAll(async () => {
  t = await levantar({ puerto: 55435 });
  await t.base.db.exec(`insert into auth.users (id, email, email_confirmed_at) values ('${SIETE}', 'siete@pruebas.test', now()), ('${SEIS}', 'seis@pruebas.test', now());`);
}, 60000);
afterAll(async () => t?.cerrar());

describe('CP-AUT · Límite de intentos de inicio de sesión', () => {
  it('CP-AUT-01 · Con la contraseña correcta se ingresa y el intento queda registrado', async () => {
    const r = await ingresar('Correcta123');
    expect(r.status).toBe(200);
    expect(r.body.usuario.rol).toBe('admin');
    const { rows } = await t.base.db.query("select exito from intentos_ingreso where correo = 'admin@pruebas.test'");
    expect(rows).toEqual([{ exito: true }]);
  });
  it('CP-AUT-02 · Cinco contraseñas incorrectas responden 401 y quedan registradas', async () => {
    for (let i = 0; i < 5; i++) expect((await ingresar('Incorrecta1')).status).toBe(401);
    const { rows: [r] } = await t.base.db.query("select count(*)::int n from intentos_ingreso where correo = 'admin@pruebas.test' and not exito");
    expect(r.n).toBe(5);
  });
  it('CP-AUT-03 · El sexto intento queda bloqueado (429), aunque la contraseña sea la correcta', async () => {
    const r = await ingresar('Correcta123');
    expect(r.status).toBe(429);
    expect(r.body.error).toMatch(/15 minutos/);
  });
  it('CP-AUT-04 · El bloqueo es por correo: otra cuenta puede ingresar', async () => {
    expect((await ingresar('Correcta123', 'otra@pruebas.test')).status).toBe(200);
  });
  it('CP-AUT-05 · Pasados 15 minutos se puede volver a intentar', async () => {
    await t.base.db.exec("update intentos_ingreso set creado = creado - interval '16 minutes' where correo = 'admin@pruebas.test'");
    expect((await ingresar('Correcta123')).status).toBe(200);
  });
  it('CP-AUT-06 · El correo se normaliza: mayúsculas y espacios cuentan como la misma cuenta', async () => {
    for (let i = 0; i < 5; i++) await ingresar('Incorrecta1', '  OTRA@Pruebas.test ');
    expect((await ingresar('Correcta123', 'otra@pruebas.test')).status).toBe(429);
  });
});

describe('DEF-07 · Aviso de pago en el portal', () => {
  it('CP-PAG-13 · Pasado el plazo, el aviso dice que venció (no "hoy es el último día")', async () => {
    const avisos = (await t.como(SIETE).get('/api/portal/inicio')).body.avisos.filter((a) => a.tipo === 'deuda');
    expect(avisos).toHaveLength(1);
    expect(avisos[0].texto).toMatch(/Venció el plazo/);
    const pagos = (await t.como(SIETE).get('/api/portal/pagos')).body;
    expect(JSON.stringify(pagos)).toMatch(/"plazo_vencido":true/);
  });
  it('CP-PAG-14 · Dentro del plazo, el aviso dice cuántos días quedan', async () => {
    const avisos = (await t.como(SEIS).get('/api/portal/inicio')).body.avisos.filter((a) => a.tipo === 'deuda');
    expect(avisos[0].texto).toMatch(/tienes 5 días/);
  });
});
