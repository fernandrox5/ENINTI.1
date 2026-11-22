// Casos borde con el escenario semilla (Regla 5) y control de acceso (OWASP A01).
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { levantar, ADMIN, mockSupabase } from '../comun.js';
import { control } from './control.js';

vi.mock('@supabase/server/core', () => mockSupabase());
vi.mock('../../src/services/correo.js', async (o) => ({ ...(await o()), enviarCorreo: async () => ({}) }));
vi.mock('../../src/services/flow.js', async (o) => ({ ...(await o()), estadoPago: async () => ({ status: 1 }), estadoPorOrden: async () => ({ status: 1 }),
  crearEnlace: async ({ orden }) => ({ url: 'https://flow.test/pagar', token: `tok-${orden}`, flowOrder: 1000 }) }));

const CLIENTE_UNO = '00000000-0000-0000-0000-0000000c0001';
const CLIENTE_DOS = '00000000-0000-0000-0000-0000000c0002';
const TECNICO_A = '00000000-0000-0000-0000-0000000d0001';
const TECNICO_B = '00000000-0000-0000-0000-0000000d0002';
let t, admin;
const id = async (sql) => (await t.base.db.query(sql)).rows[0].id;

beforeAll(async () => {
  t = await levantar({ puerto: 55433 });
  admin = t.como(ADMIN);
  // Cuentas de dos clientes y dos técnicos (el trigger de auth.users las une a su ficha por correo)
  await t.base.db.exec(`
    insert into tecnicos (nombre, rut, email) values ('Técnico A', '10000013-K', 'tec.a@pruebas.test'), ('Técnico B', '10000004-0', 'tec.b@pruebas.test');
    insert into auth.users (id, email, email_confirmed_at) values
      ('${CLIENTE_UNO}', 'uno@pruebas.test', now()), ('${CLIENTE_DOS}', 'dos@pruebas.test', now()),
      ('${TECNICO_A}', 'tec.a@pruebas.test', now()), ('${TECNICO_B}', 'tec.b@pruebas.test', now());
    insert into mantenciones (instalacion_id, tipo, estado, fecha_programada, tecnico_id)
      select i.id, 'correctiva', 'programada', '2026-12-05', (select id from tecnicos where nombre = 'Técnico A')
      from instalaciones i where i.nombre like 'P02%';`);
}, 60000);
afterAll(async () => t?.cerrar());

describe('Regla 5 · Registrar y anular un pago se refleja de inmediato', () => {
  let pagoId;
  it('CP-PAG-10 · Registrar noviembre de la de $20.000 (pagado el 01-11): Cobrado este mes sube a $120.000 y ya no está pendiente', async () => {
    const v6 = await id("select id from suscripciones where codigo = 'SUS-P-V6'");
    const r = await admin.post('/api/admin/pagos', { suscripcion_id: v6, periodos: ['2026-11-01'], monto_periodo: 20000, medio_pago: 'efectivo', fecha_pago: '2026-11-01' });
    expect(r.status).toBe(201);
    pagoId = r.body.ids?.[0] ?? r.body.id ?? (await id(`select id from pagos where suscripcion_id = ${v6}`));
    const inicio = (await admin.get('/api/admin/inicio')).body;
    expect(await control(t.base.db, 'cobrado_mes')).toBe(120000);
    expect(inicio.cobrado_mes).toBe(120000);
    expect(inicio.pagos_pendientes).toHaveLength(0);
    expect((await admin.get('/api/admin/pagos/resumen?mes=2026-11')).body.cobrado).toBe(120000);
  });
  it('CP-PAG-11 · Anular ese pago: vuelve a $100.000 y a 1 pendiente', async () => {
    expect((await admin.post(`/api/admin/pagos/${pagoId}/anular`, { motivo: 'Prueba' })).status).toBe(200);
    const inicio = (await admin.get('/api/admin/inicio')).body;
    expect(inicio.cobrado_mes).toBe(100000);
    expect(inicio.pagos_pendientes).toHaveLength(1);
    // El pago anulado no se borra: queda registrado con su motivo (A08)
    const { rows: [p] } = await t.base.db.query(`select estado, motivo_anulacion from pagos where id = ${pagoId}`);
    expect(p).toEqual({ estado: 'anulado', motivo_anulacion: 'Prueba' });
  });
  it('CP-PAG-12 · No se puede registrar un mes que no corresponde (adelantado)', async () => {
    const v1 = await id("select id from suscripciones where codigo = 'SUS-P-V1'");
    const r = await admin.post('/api/admin/pagos', { suscripcion_id: v1, periodos: ['2027-01-01'], monto_periodo: 15000, medio_pago: 'efectivo' });
    expect(r.status).toBe(409);
  });
});

describe('OWASP A01 · Control de acceso', () => {
  it('CP-SEG-01 · Sin sesión, la API privada responde 401', async () => {
    expect((await t.como('').get('/api/admin/inicio')).status).toBe(401);
  });
  it('CP-SEG-02 · Un cliente no puede entrar al panel del administrador ni al del técnico', async () => {
    expect((await t.como(CLIENTE_UNO).get('/api/admin/inicio')).status).toBe(403);
    expect((await t.como(CLIENTE_UNO).get('/api/admin/clientes')).status).toBe(403);
    expect((await t.como(CLIENTE_UNO).get('/api/tecnico/visitas')).status).toBe(403);
  });
  it('CP-SEG-03 · Un cliente no ve la instalación de otro cambiando el ID en la URL', async () => {
    const deDos = await id("select id from instalaciones where nombre like 'P02%'");
    const propia = await id("select id from instalaciones where nombre like 'P01%'");
    expect((await t.como(CLIENTE_UNO).get(`/api/portal/instalaciones/${propia}`)).status).toBe(200);
    expect((await t.como(CLIENTE_UNO).get(`/api/portal/instalaciones/${deDos}`)).status).toBe(404);
  });
  it('CP-SEG-04 · Un cliente no ve la mantención de otro', async () => {
    const m = await id("select m.id from mantenciones m join instalaciones i on i.id = m.instalacion_id where i.nombre like 'P02%'");
    expect((await t.como(CLIENTE_DOS).get(`/api/portal/mantenciones/${m}`)).status).toBe(200);
    expect((await t.como(CLIENTE_UNO).get(`/api/portal/mantenciones/${m}`)).status).toBe(404);
  });
  it('CP-SEG-05 · Un cliente solo ve sus propios pagos', async () => {
    const r = (await t.como(CLIENTE_UNO).get('/api/portal/pagos')).body;
    const texto = JSON.stringify(r);
    expect(texto).toContain('SUS-P-V1');
    expect(texto).not.toContain('SUS-P-V2');
  });
  it('CP-SEG-06 · Un técnico no ve la visita asignada a otro técnico', async () => {
    const m = await id("select m.id from mantenciones m join instalaciones i on i.id = m.instalacion_id where i.nombre like 'P02%'");
    expect((await t.como(TECNICO_A).get(`/api/tecnico/visitas/${m}`)).status).toBe(200);
    expect([403, 404]).toContain((await t.como(TECNICO_B).get(`/api/tecnico/visitas/${m}`)).status);
  });
  it('CP-SEG-07 · El cliente no puede fijar el monto al contratar (A06): el monto sale del plan', async () => {
    const libre = await id("select id from instalaciones where nombre like 'P11%'");
    // P11 es del Cliente Dos. Se intenta contratar enviando un monto inventado
    await t.base.db.exec("update instalaciones set cliente_id = (select id from clientes where nombre = 'Cliente Uno') where nombre like 'P11%'");
    const plan = await id("select id from tipos_suscripcion where codigo = 'BASICA'");
    await t.como(CLIENTE_UNO).post('/api/portal/planes/contratar', { tipo_suscripcion_id: plan, instalacion_id: libre, acepto_condiciones: true, medio: 'flow', monto: 1, monto_pactado: 1 });
    const { rows } = await t.base.db.query(`select monto_pactado from suscripciones where instalacion_id = ${libre}`);
    for (const s of rows) expect(s.monto_pactado).toBe(15000);
  });
});
