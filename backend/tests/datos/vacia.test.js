// Regla 5 · Base vacía y contrato del día 31.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { levantar, ADMIN, mockSupabase } from '../comun.js';

vi.mock('@supabase/server/core', () => mockSupabase());
vi.mock('../../src/services/correo.js', async (o) => ({ ...(await o()), enviarCorreo: async () => ({}) }));

let t;
beforeAll(async () => { t = await levantar({ puerto: 55434, semilla: false }); }, 60000);
afterAll(async () => t?.cerrar());

const sinValoresRaros = (obj) => expect(JSON.stringify(obj)).not.toMatch(/NaN|undefined|Infinity/);

describe('Base vacía', () => {
  it('CP-DAT-40 · El Inicio responde con 0 y $0', async () => {
    const r = await t.como(ADMIN).get('/api/admin/inicio');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ vigentes: 0, ingreso_mensual: 0, cobrado_mes: 0, sin_plan: 0, semana: 0 });
    expect(r.body.pagos_pendientes).toEqual([]);
    sinValoresRaros(r.body);
  });
  it('CP-DAT-41 · Pagos y Reportes responden sin errores ni NaN', async () => {
    const pagos = await t.como(ADMIN).get('/api/admin/pagos/resumen');
    expect(pagos.status).toBe(200);
    expect(pagos.body).toMatchObject({ cobrado: 0, por_validar: 0, fallidos: 0 });
    for (const p of ['6', '12', 'todo']) {
      const rep = await t.como(ADMIN).get(`/api/admin/reportes?periodo=${p}`);
      expect(rep.status).toBe(200);
      sinValoresRaros(rep.body);
    }
  });
});

describe('Contrato del día 31', () => {
  it('CP-SUS-11 · En meses cortos el cobro cae en una fecha válida y no se salta ningún mes', async () => {
    const { db } = t.base;
    await db.exec(`insert into clientes (nombre, email) values ('Cliente 31', 'c31@pruebas.test');
      insert into instalaciones (cliente_id, nombre, direccion) select id, 'Día 31', 'Calle 31' from clientes where nombre = 'Cliente 31';
      insert into suscripciones (codigo, instalacion_id, tipo_suscripcion_id, fecha_inicio)
        select 'SUS-P-31', i.id, (select id from tipos_suscripcion where codigo = 'BASICA'), '2026-01-31' from instalaciones i where i.nombre = 'Día 31';`);
    const { periodosSinPagar } = await import('../../src/services/cobros.js');
    const sus = (await db.query("select id from suscripciones where codigo = 'SUS-P-31'")).rows[0].id;
    const periodos = await periodosSinPagar(sus);
    const meses = periodos.map((p) => p.periodo.slice(0, 7));
    expect(meses).toEqual(['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12']);
    // Cada fecha de cobro existe en el calendario (febrero no tiene 31)
    for (const p of periodos) expect(new Date(`${p.inicio}T12:00:00Z`).toISOString().slice(0, 10)).toBe(p.inicio);
    expect(periodos[1].inicio).toBe('2026-02-28');
  });
});
