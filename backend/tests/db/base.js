// Base de pruebas desechable: PostgreSQL en memoria (PGlite) con el esquema real de Syntia.
// Se expone por el protocolo de PostgreSQL en un puerto local, así el backend se conecta con el
// mismo driver "pg" que usa en producción. Nunca toca la base compartida.
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const RAIZ = new URL('../../../', import.meta.url);
// Mismo orden que backend/scripts/db-init.js, sin el reinicio (00) ni los datos demo (03)
const ESQUEMA = ['01_esquema_eninti', '02_ajustes', '04_pagos_flow', '05_plazo_pago', '06_mantenciones',
  '07_pago_pendiente', '08_avisos', '09_mantenciones_a_pedido', '10_notificaciones_leidas', '11_intentos_ingreso'];

const leer = (ruta) => readFile(new URL(ruta, RAIZ), 'utf8');

// Crea la base, carga el esquema y fija la fecha "hoy" del sistema (fn_hoy) en `hoy`
export async function crearBase({ hoy = '2026-11-30', puerto = 55432 } = {}) {
  const db = await PGlite.create();
  await db.exec(await leer('backend/tests/db/00_supabase_simulado.sql'));
  for (const f of ESQUEMA) {
    try {
      await db.exec(await leer(`database/schema/${f}.sql`));
    } catch (err) {
      throw new Error(`No se pudo cargar ${f}.sql: ${err.message}`);
    }
  }
  await fijarHoy(db, hoy);
  const servidor = new PGLiteSocketServer({ db, port: puerto, host: '127.0.0.1', maxConnections: 20 });
  await servidor.start();
  return { db, url: `postgresql://postgres@127.0.0.1:${puerto}/postgres`, cerrar: async () => { await servidor.stop(); await db.close(); } };
}

// La fecha de corte de las pruebas: todas las reglas de días usan fn_hoy()
export async function fijarHoy(db, hoy) {
  await db.exec(`create or replace function public.fn_hoy() returns date language sql stable as $$ select '${hoy}'::date $$;`);
}

export const cargarSql = async (db, ruta) => db.exec(await leer(ruta));
