// Pruebas unitarias: validación de datos de personas (RUT, teléfono, correo).
// Estándar de Pruebas ENINTI · módulo CLI. Los RUT esperados se calcularon a mano con el módulo 11.
import { describe, it, expect } from 'vitest';
import { normalizarRut, rutValido, telefonoValido, correoValido } from '../../src/utils/validar.js';

describe('CP-CLI-01 · RUT: dígito verificador (módulo 11)', () => {
  it('acepta un RUT válido con puntos y guion', () => expect(normalizarRut('12.345.678-5')).toBe('12345678-5'));
  it('acepta DV K en mayúscula y minúscula (10.000.013-K)', () => {
    expect(normalizarRut('10.000.013-K')).toBe('10000013-K');
    expect(normalizarRut('10000013k')).toBe('10000013-K');
  });
  it('acepta DV 0 (10.000.004-0)', () => expect(normalizarRut('10000004-0')).toBe('10000004-0'));
  it('rechaza un DV incorrecto', () => expect(normalizarRut('12.345.678-9')).toBeNull());
  it('rechaza texto que no es RUT', () => expect(normalizarRut('abc')).toBeNull());
});

describe('CP-CLI-02 · RUT obligatorio y real', () => {
  it('rechaza RUT vacío', () => expect(() => rutValido('')).toThrow('obligatorio'));
  it('rechaza RUT de relleno 11.111.111-1 aunque su DV sea correcto', () => expect(() => rutValido('11.111.111-1')).toThrow('no es real'));
  it('acepta el RUT de relleno si es el que ya tenía guardado (datos antiguos)', () => expect(rutValido('11.111.111-1', { actual: '11111111-1' })).toBe('11111111-1'));
});

describe('CP-CLI-03 · Teléfono chileno', () => {
  it('guarda 9 dígitos como +56XXXXXXXXX', () => expect(telefonoValido('9 1234 5678')).toBe('+56912345678'));
  it('acepta el formato con +56 y espacios', () => expect(telefonoValido('+56 9 1234 5678')).toBe('+56912345678'));
  it('el teléfono es opcional', () => expect(telefonoValido('')).toBeNull());
  it('rechaza un número incompleto', () => expect(() => telefonoValido('1234')).toThrow('no es válido'));
});

describe('CP-CLI-04 · Formato de correo', () => {
  it('acepta un correo normal', () => expect(correoValido('cliente@empresa.cl')).toBe(true));
  it('rechaza sin dominio', () => expect(correoValido('cliente@')).toBe(false));
  it('rechaza con espacios', () => expect(correoValido('cli ente@empresa.cl')).toBe(false));
});
