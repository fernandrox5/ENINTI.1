// Crea las tablas y carga los datos de prueba: npm run db:init
import { readFile } from 'node:fs/promises';

if (!process.env.DATABASE_URL) {
  console.error('✘ Falta DATABASE_URL. Copia backend/.env.example como backend/.env y pon tu contraseña de PostgreSQL.');
  process.exit(1);
}

const { pool } = await import('../src/config/db.js');
const { generarCuotas } = await import('../src/services/cuotas.js');

const sql = (ruta) => readFile(new URL(`../../database/${ruta}`, import.meta.url), 'utf8');

const AYUDA = {
  '28P01': 'La contraseña de DATABASE_URL en backend/.env no es correcta.',
  '3D000': 'La base indicada en DATABASE_URL no existe. Créala en pgAdmin o con: createdb -U postgres eninti',
  ECONNREFUSED: 'PostgreSQL no está encendido o no escucha en el puerto indicado (normalmente 5432).',
  ETIMEDOUT: 'No se pudo conectar a PostgreSQL a tiempo. Revisa el host y el puerto de DATABASE_URL.',
};

try {
  console.log('… Conectando a la base de datos');
  await pool.query('SELECT 1');
  await pool.query(await sql('schema/001_schema.sql'));
  console.log('✔ Tablas creadas');
  await pool.query(await sql('seeds/001_datos.sql'));
  const cuotas = await generarCuotas();
  console.log(`✔ Datos de prueba cargados (${cuotas} cuotas generadas)`);
  await pool.query(await sql('seeds/002_pagos.sql'));
  console.log('✔ Pagos de prueba cargados');
} catch (err) {
  console.error('✘ Error al inicializar la base:', AYUDA[err.code] || err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
