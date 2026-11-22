// Pruebas unitarias: formato de cifras y estados que ve el usuario.
// Estándar de Pruebas ENINTI · Regla 5 (formato CLP) y módulo DAT.
import { describe, it, expect } from 'vitest';
import { pesos, fechaCorta, formatearRut } from './formato';
import { estadoSuscripcion, situacionInstalacion } from './estados';

describe('CP-DAT-01 · Formato CLP: punto de miles, sin decimales', () => {
  it('$85.000', () => expect(pesos(85000)).toBe('$85.000'));
  it('$1.234.567', () => expect(pesos(1234567)).toBe('$1.234.567'));
  it('cero, vacío o nulo se muestran como $0 (nunca NaN)', () => {
    expect(pesos(0)).toBe('$0');
    expect(pesos(null)).toBe('$0');
    expect(pesos(undefined)).toBe('$0');
  });
  it('un monto con decimales se redondea al peso (el CLP no tiene decimales)', () => expect(pesos(1500.6)).toBe('$1.501'));
  it('acepta el monto como texto (así llegan los numeric de la base)', () => expect(pesos('15000')).toBe('$15.000'));
});

describe('CP-DAT-02 · Fechas y RUT en pantalla', () => {
  it('fecha corta sin hora', () => expect(fechaCorta('2026-11-30T23:30:00')).toMatch(/^30 nov\.? 2026$/));
  it('fecha vacía se muestra como guion', () => expect(fechaCorta(null)).toBe('—'));
  it('RUT con puntos, guion y K mayúscula', () => expect(formatearRut('10000013k')).toBe('10.000.013-K'));
});

describe('CP-SUS-01 · Estado de la suscripción que ve el administrador', () => {
  it('vigente con un mes adeudado: pago pendiente', () => expect(estadoSuscripcion({ estado: 'vigente', periodos_adeudados: 1, dias_restantes: 200 })[1]).toBe('Vigente · pago pendiente'));
  it('vigente al día con más de 30 días: vigente', () => expect(estadoSuscripcion({ estado: 'vigente', periodos_adeudados: 0, dias_restantes: 200 })[1]).toBe('Vigente'));
  it('vencida no dice "al día"', () => expect(estadoSuscripcion({ estado: 'vencida', dias_restantes: -3 })[1]).toBe('Vencida'));
  it('cerrada muestra su motivo', () => expect(estadoSuscripcion({ estado: 'cerrada', motivo_cierre: 'Falta de pago' })[1]).toBe('Cerrada · falta de pago'));
});

describe('CP-SUS-02 · Situación de la instalación que ve el cliente', () => {
  it('sin suscripción', () => expect(situacionInstalacion({ suscripcion_id: null })[1]).toBe('Sin suscripción'));
  it('con mes adeudado: pago pendiente', () => expect(situacionInstalacion({ suscripcion_id: 1, periodos_adeudados: 1, dias_restantes: 100 })[1]).toBe('Pago pendiente'));
  it('al día', () => expect(situacionInstalacion({ suscripcion_id: 1, periodos_adeudados: 0, pagos_por_validar: 0, dias_restantes: 100 })[1]).toBe('Al día'));
});
