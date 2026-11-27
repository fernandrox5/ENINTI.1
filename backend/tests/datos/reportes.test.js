// Exactitud del módulo Reportes (Estándar de Pruebas ENINTI, sección 5).
// Escenario semilla al 30-11-2026 más tres casos que reproducen lo encontrado en la revisión de Reportes:
//   R-1 · un pago registrado para un mes en que la suscripción ya estaba cerrada (no debe tapar meses impagos)
//   R-2 · meses que empiezan justo el día del cierre o término (el cobro no los cobra: no son deuda)
//   R-3 · una suscripción que se cerró el mismo día en que empezó (no pagó el primer mes)
//   R-4 · una cancelación con fecha de cierre futura (no cuenta todavía, ni en el total ni en los motivos)
// Los valores esperados se calcularon a mano a partir de la semilla (Regla 2).
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { levantar, ADMIN, mockSupabase } from '../comun.js';

vi.mock('@supabase/server/core', () => mockSupabase());
vi.mock('../../src/services/correo.js', async (original) => ({ ...(await original()), enviarCorreo: async () => ({}) }));

let t, rep;
const mes = (m) => rep.meses.find((x) => x.mes === m);

beforeAll(async () => {
  t = await levantar({ puerto: 55437 });
  await t.base.db.exec(`
    -- R-3: contrató el 10-11 y se cerró ese mismo día por no pagar el primer mes
    insert into public.suscripciones (codigo, instalacion_id, tipo_suscripcion_id, fecha_inicio, monto_pactado)
    select 'SUS-P-N1', i.id, (select id from public.tipos_suscripcion where codigo = 'BASICA'), '2026-11-10', 15000
    from public.instalaciones i where i.nombre = 'P11 nunca suscrita';
    select public.fn_cerrar_suscripcion((select id from public.suscripciones where codigo = 'SUS-P-N1'), 'Falta de pago', '2026-11-10');
    -- R-1: pago de noviembre para la suscripción cerrada el 12-10 (no le tocaba pagar)
    insert into public.pagos (suscripcion_id, periodo, monto, medio_pago, estado, fecha_pago)
    select id, '2026-11-01', 15000, 'deposito', 'pagado', '2026-11-20 10:00 America/Santiago' from public.suscripciones where codigo = 'SUS-P-F1';
    -- R-4: cancelada hoy, con el servicio cubierto hasta el 02-12
    select public.fn_cerrar_suscripcion((select id from public.suscripciones where codigo = 'SUS-P-V1'), 'Cancelada por el cliente: prueba futura', '2026-12-02');
  `);
  const r = await t.como(ADMIN).get('/api/admin/reportes?periodo=6');
  if (r.status !== 200) throw new Error(`reportes respondió ${r.status}: ${JSON.stringify(r.body)}`);
  rep = r.body;
}, 60000);

afterAll(async () => t?.cerrar());

describe('Reportes · Pagado vs. esperado', () => {
  it('CP-REP-01 · Esperado mes a mes = los cobros que tocaban (misma regla del proceso de cobros)', () => {
    expect(rep.desde.slice(0, 10)).toBe('2026-06-01');
    expect(rep.meses.map((m) => [m.mes, m.esperado])).toEqual([
      ['2026-06', 15000], ['2026-07', 15000], ['2026-08', 30000], ['2026-09', 45000], ['2026-10', 45000], ['2026-11', 120000],
    ]);
    expect(rep.resumen.esperado).toBe(270000);
  });

  it('CP-REP-02 · Un mes que empieza el día del cierre o término no se espera (R-2)', () => {
    // La vencida termina el 01-11 y la cancelada cierra el 03-11: ninguna debe noviembre
    expect(mes('2026-11').esperado).toBe(120000);
    // La cerrada por falta de pago cierra el 12-10: no debe octubre
    expect(mes('2026-10').esperado).toBe(45000);
  });

  it('CP-REP-03 · Faltó se cuenta cobro por cobro: un pago de más no tapa un impago (R-1)', () => {
    const nov = mes('2026-11');
    expect(nov.pagado).toBe(100000);   // 85.000 de la semilla + el pago de la cerrada
    expect(nov.cubierto).toBe(85000);  // solo los cobros que tocaban y se pagaron
    expect(nov.falto).toBe(15000);     // V7: contrato del 15, plazo de 7 días vencido
    expect(nov.en_plazo).toBe(20000);  // V6: contrato del 28, va en el día 2
    expect(rep.resumen.falto).toBe(15000);
    expect(rep.resumen.en_plazo).toBe(20000);
    expect(rep.resumen.cubierto).toBe(235000);
    expect(rep.resumen.cubierto + rep.resumen.falto + rep.resumen.en_plazo).toBe(rep.resumen.esperado);
  });

  it('CP-REP-04 · Ingreso mensual al inicio del periodo = las vigentes al 01-06', () => {
    expect(rep.resumen.ingreso_inicio).toBe(15000);
  });
});

describe('Reportes · Suscripciones nuevas y canceladas', () => {
  it('CP-REP-05 · La que no pagó el primer mes no es nueva ni cancelada; se informa aparte (R-3)', () => {
    expect(rep.meses.map((m) => [m.mes, m.altas, m.bajas, m.sin_empezar])).toEqual([
      ['2026-06', 0, 0, 0], ['2026-07', 0, 0, 0], ['2026-08', 1, 0, 0], ['2026-09', 1, 0, 0], ['2026-10', 1, 1, 0], ['2026-11', 6, 1, 1],
    ]);
    expect(rep.resumen.sin_empezar).toBe(1);
  });

  it('CP-REP-06 · Retención = (1 al inicio + 9 nuevas − 2 cerradas) ÷ 10 = 80 %', () => {
    expect([rep.resumen.altas, rep.resumen.bajas, rep.resumen.retencion]).toEqual([9, 2, 80]);
  });

  it('CP-REP-07 · Motivos de cancelación suman lo mismo que las canceladas; la de cierre futuro aún no cuenta (R-4)', () => {
    expect(rep.motivos).toEqual([{ motivo: 'Falta de pago', n: 1 }, { motivo: 'prueba', n: 1 }]);
    expect(rep.motivos.reduce((a, m) => a + m.n, 0)).toBe(rep.resumen.bajas);
  });
});
