// Exactitud de datos (Estándar de Pruebas ENINTI, sección 5).
// Escenario semilla fijo al 30-11-2026 en una base PostgreSQL en memoria. Cada cifra se compara con
// el valor esperado de la guía (Regla 2) y con su consulta SQL de control (Regla 3), antes y después
// del proceso diario de cobros. Flow y el correo se simulan: no sale nada a internet.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { crearBase, cargarSql } from '../db/base.js';
import { control } from './control.js';

const ADMIN = '00000000-0000-0000-0000-00000000a001';

// Sesión: el token de prueba es el id del perfil (sin llamar a Supabase)
vi.mock('@supabase/server/core', () => ({
  verifyCredentials: async ({ token }) => ({ data: { userClaims: { id: token } }, error: null }),
  createAdminClient: () => ({}),
  createContextClient: () => ({}),
}));
// Flow simulado: crear un enlace de pago responde como Flow; consultar un pago dice "pendiente"
vi.mock('../../src/services/flow.js', async (original) => ({
  ...(await original()),
  crearEnlace: async ({ orden }) => ({ url: 'https://flow.test/pagar', token: `tok-${orden}`, flowOrder: 1000 }),
  estadoPago: async () => ({ status: 1 }),
  estadoPorOrden: async () => ({ status: 1 }),
}));
vi.mock('../../src/services/correo.js', async (original) => ({ ...(await original()), enviarCorreo: async () => ({}) }));

let base, app, cobros;
const get = async (ruta) => {
  const r = await request(app).get(ruta).set('Authorization', `Bearer ${ADMIN}`);
  if (r.status !== 200) throw new Error(`${ruta} respondió ${r.status}: ${JSON.stringify(r.body)}`);
  return r;
};
const sql = (nombre) => control(base.db, nombre);

beforeAll(async () => {
  // "Hoy" del backend (JavaScript) y de la base (fn_hoy): 30-11-2026, mediodía en Chile
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-30T12:00:00-03:00'));
  base = await crearBase({ hoy: '2026-11-30', puerto: 55432 });
  await cargarSql(base.db, 'backend/tests/datos/seed_pruebas.sql');
  Object.assign(process.env, {
    DATABASE_URL: base.url, MAIL_ENABLED: 'false', SUPABASE_URL: 'http://supabase.test',
    SUPABASE_SECRET_KEY: 'prueba', SUPABASE_PUBLISHABLE_KEY: 'prueba',
  });
  app = (await import('../../src/app.js')).default;
  cobros = await import('../../src/services/cobros.js');
}, 60000);

afterAll(async () => {
  vi.useRealTimers();
  const { pool } = await import('../../src/config/db.js');
  await pool.end();
  await base?.cerrar();
});

describe('Antes del proceso de cobros (Regla 2)', () => {
  let inicio, resumen, reportes;
  beforeAll(async () => {
    inicio = (await get('/api/admin/inicio')).body;
    resumen = (await get('/api/admin/pagos/resumen?mes=2026-11')).body;
    reportes = (await get('/api/admin/reportes?periodo=6')).body;
  });

  it('CP-DAT-10 · Suscripciones activas = 7', async () => {
    expect(await sql('activas')).toBe(7);
    expect(inicio.vigentes).toBe(7);
  });
  it('CP-DAT-11 · Ingreso mensual = $120.000 (4 × 15.000 + 25.000 + 20.000 + 15.000)', async () => {
    expect(await sql('ingreso_mensual')).toBe(120000);
    expect(inicio.ingreso_mensual).toBe(120000);
  });
  it('CP-DAT-12 · Pagos pendientes = 1 dentro del plazo + 1 por cerrarse', async () => {
    expect(await sql('pendientes_en_plazo')).toBe(1);
    expect(await sql('pendientes_por_cerrar')).toBe(1);
    expect(inicio.pagos_pendientes).toHaveLength(1);
    expect(inicio.pagos_pendientes[0].monto).toBe(20000);
    // La que ya pasó el plazo también debe verse (para cerrarla o cobrarla), separada de las que están en plazo
    expect(inicio.por_cerrar ?? []).toHaveLength(1);
  });
  it('CP-DAT-13 · Cobrado este mes = $100.000 en Inicio y en Pagos (por fecha de pago)', async () => {
    expect(await sql('cobrado_mes')).toBe(100000);
    expect(inicio.cobrado_mes).toBe(100000);
    expect(resumen.cobrado).toBe(100000);
  });
  it('CP-DAT-14 · Pagado en noviembre (Reportes) = $85.000 (por mes que cubre)', async () => {
    expect(await sql('pagado_mes_reportes')).toBe(85000);
    expect(reportes.meses.find((m) => m.mes === '2026-11').pagado).toBe(85000);
  });
  it('CP-DAT-15 · Instalaciones sin suscripción = 4', async () => {
    expect(await sql('sin_suscripcion')).toBe(4);
    expect(inicio.sin_plan).toBe(4);
  });
  it('CP-DAT-16 · Por validar = 0', async () => {
    expect(await sql('por_validar')).toBe(0);
    expect(resumen.por_validar).toBe(0);
  });
});

describe('Consistencia entre pantallas (Regla 4)', () => {
  it('CP-DAT-17 · Suma de "Pagos del mes" = Cobrado este mes = total del Excel del mes', async () => {
    const lista = (await get('/api/admin/pagos?mes=2026-11')).body;
    const excel = (await get('/api/admin/pagos/excel?mes=2026-11')).text.replace(/^﻿/, '').trim().split('\r\n').slice(1);
    const totalExcel = excel.reduce((a, l) => a + Number(l.split(';')[7].replace(/"/g, '')), 0);
    const cobrado = (await get('/api/admin/inicio')).body.cobrado_mes;
    expect(lista.monto).toBe(cobrado);
    expect(totalExcel).toBe(cobrado);
  });
  it('CP-DAT-18 · Activas del Inicio = vigentes del listado de Suscripciones', async () => {
    const listado = (await get('/api/admin/suscripciones?vista=vigentes')).body;
    expect(listado.total).toBe((await get('/api/admin/inicio')).body.vigentes);
  });
  it('CP-DAT-19 · Sin suscripción del Inicio = filtro "sin suscripción" de Instalaciones', async () => {
    const listado = (await get('/api/admin/instalaciones?filtro=sin')).body;
    expect(listado.total).toBe((await get('/api/admin/inicio')).body.sin_plan);
  });
});

describe('Casos borde (Regla 5)', () => {
  it('CP-DAT-20 · El pago de las 23:30 del 30-11 (hora de Chile) cuenta en noviembre, no en diciembre', async () => {
    const nov = (await get('/api/admin/pagos?mes=2026-11')).body.pagos.map((p) => p.suscripcion ?? p.suscripcion_codigo ?? p.codigo);
    const dic = (await get('/api/admin/pagos?mes=2026-12')).body.pagos.map((p) => p.suscripcion ?? p.suscripcion_codigo ?? p.codigo);
    expect(nov).toContain('SUS-P-V4');
    expect(dic).not.toContain('SUS-P-V4');
  });
  it('CP-DAT-21 · Cerradas y vencidas fuera de los conteos de activas', async () => {
    const listado = (await get('/api/admin/suscripciones?vista=vigentes')).body.suscripciones.map((s) => s.codigo);
    expect(listado).not.toContain('SUS-P-C1');
    expect(listado).not.toContain('SUS-P-F1');
    expect(listado).not.toContain('SUS-P-E1');
  });
});

describe('Después del proceso de cobros (Regla 2)', () => {
  let inicio, resultado;
  beforeAll(async () => {
    resultado = await cobros.ejecutarCobros();
    inicio = (await get('/api/admin/inicio')).body;
  });

  it('CP-SUS-10 · El proceso cierra por falta de pago la de plazo vencido y deja con enlace la que está en plazo', async () => {
    expect(resultado).toEqual(expect.arrayContaining([
      expect.objectContaining({ suscripcion: 'SUS-P-V7', accion: 'cerrar', estado: 'cerrada' }),
      expect.objectContaining({ suscripcion: 'SUS-P-V6', accion: 'enlace' }),
    ]));
    const { rows: [v7] } = await base.db.query("SELECT estado, motivo_cierre FROM suscripciones WHERE codigo = 'SUS-P-V7'");
    expect(v7).toEqual({ estado: 'cerrada', motivo_cierre: 'Falta de pago' });
  });
  it('CP-DAT-30 · Suscripciones activas = 6', async () => {
    expect(await sql('activas')).toBe(6);
    expect(inicio.vigentes).toBe(6);
  });
  it('CP-DAT-31 · Ingreso mensual = $105.000', async () => {
    expect(await sql('ingreso_mensual')).toBe(105000);
    expect(inicio.ingreso_mensual).toBe(105000);
  });
  it('CP-DAT-32 · Pagos pendientes = 1 (solo la que está dentro del plazo)', async () => {
    expect(await sql('pendientes_en_plazo')).toBe(1);
    expect(await sql('pendientes_por_cerrar')).toBe(0);
    expect(inicio.pagos_pendientes).toHaveLength(1);
  });
  it('CP-DAT-33 · Cobrado este mes sigue en $100.000', async () => {
    expect(await sql('cobrado_mes')).toBe(100000);
    expect(inicio.cobrado_mes).toBe(100000);
  });
  it('CP-DAT-34 · Instalaciones sin suscripción = 5', async () => {
    expect(await sql('sin_suscripcion')).toBe(5);
    expect(inicio.sin_plan).toBe(5);
  });
});
