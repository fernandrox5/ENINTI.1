// Crea las tablas y carga los datos de prueba: npm run db:init
import { readFile } from 'node:fs/promises';
import { pool } from '../src/config/db.js';
import { generarCuotas } from '../src/services/cuotas.js';

const sql = (ruta) => readFile(new URL(`../../database/${ruta}`, import.meta.url), 'utf8');

try {
  await pool.query(await sql('schema/001_schema.sql'));
  console.log('✔ Tablas creadas');
  await pool.query(await sql('seeds/001_datos.sql'));
  const cuotas = await generarCuotas();
  console.log(`✔ Datos de prueba cargados (${cuotas} cuotas generadas)`);
  await pool.query(await sql('seeds/002_pagos.sql'));
  console.log('✔ Pagos de prueba cargados');
} catch (err) {
  console.error('✘ Error al inicializar la base:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
