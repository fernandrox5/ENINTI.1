// CP-SOL · Pedido de cotización desde el portal (DEF-10): el cliente pide cotizar la inversión que recomendó
// el técnico y el administrador debe verlo en Solicitudes, en el número del menú y en la campana.
// Antes la cotización quedaba guardada como "consulta" y la lista y la campana la escondían: el menú decía 1
// y la lista "No hay solicitudes pendientes".
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { levantar, ADMIN, mockSupabase } from '../comun.js';

vi.mock('@supabase/server/core', () => mockSupabase());
vi.mock('../../src/services/correo.js', async (o) => ({ ...(await o()), enviarCorreo: async () => ({}) }));

const TRES = '00000000-0000-0000-0000-0000000c0003';
let t, mantencion, solicitud;

beforeAll(async () => {
  t = await levantar({ puerto: 55438 });
  // Cuenta del Cliente Tres y una visita hecha en la que el técnico recomienda una inversión
  await t.base.db.exec(`insert into auth.users (id, email, email_confirmed_at) values ('${TRES}', 'tres@pruebas.test', now());`);
  const { rows: [m] } = await t.base.db.query(
    `insert into mantenciones (instalacion_id, suscripcion_id, tipo, estado, fecha_programada, fecha_realizada, requiere_inversion, detalle_inversion)
     select s.instalacion_id, s.id, 'correctiva', 'realizada', '2026-11-20', '2026-11-20', true, 'Inversor nuevo'
     from suscripciones s where s.codigo = 'SUS-P-V3' returning id`);
  mantencion = m.id;
}, 60000);
afterAll(async () => t?.cerrar());

describe('CP-SOL · Pedido de cotización', () => {
  it('CP-SOL-01 · El cliente pide la cotización desde su portal', async () => {
    const r = await t.como(TRES).post(`/api/portal/mantenciones/${mantencion}/cotizacion`, {});
    expect(r.status).toBe(201);
    solicitud = r.body.id;
    expect((await t.como(TRES).post(`/api/portal/mantenciones/${mantencion}/cotizacion`, {})).status).toBe(409); // no se duplica
  });

  it('CP-SOL-02 · El administrador la ve en Solicitudes pendientes y en el conteo', async () => {
    const r = await t.como(ADMIN).get('/api/admin/solicitudes');
    expect(r.status).toBe(200);
    const s = r.body.solicitudes.find((x) => x.id === solicitud);
    expect(s).toBeTruthy();
    expect(s.descripcion).toMatch(/^Cotización \(MNT-\d{4}\): el cliente pide cotizar "Inversor nuevo"/);
    expect(r.body.conteo.pendientes).toBe(r.body.solicitudes.length);
  });

  it('CP-SOL-03 · El número del menú coincide con las solicitudes nuevas de la lista', async () => {
    const [menu, lista] = await Promise.all([t.como(ADMIN).get('/api/admin/contadores'), t.como(ADMIN).get('/api/admin/solicitudes')]);
    expect(menu.body.solicitudes_nuevas).toBe(lista.body.solicitudes.filter((x) => x.estado === 'nueva').length);
    expect(menu.body.solicitudes_nuevas).toBeGreaterThan(0);
  });

  it('CP-SOL-04 · Aparece en la campana del administrador', async () => {
    const r = await t.como(ADMIN).get('/api/admin/notificaciones');
    expect(r.status).toBe(200);
    const lista = r.body.notificaciones ?? r.body;
    const n = lista.find((x) => x.clave === `sol-${solicitud}`);
    expect(n?.titulo).toMatch(/^Pide cotización: /);
  });
});
