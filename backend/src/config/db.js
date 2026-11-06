import pg from 'pg';

// Las columnas DATE se entregan como texto 'AAAA-MM-DD' para evitar desfases de zona horaria
pg.types.setTypeParser(1082, (valor) => valor);
// bigint (ids y conteos del esquema de Supabase) como número: los valores caben de sobra
pg.types.setTypeParser(20, (valor) => Number(valor));

// La base está en Supabase (PostgreSQL). Su conexión exige SSL; en local no se usa.
const local = /@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || '');

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 8000,
  ssl: local ? false : { rejectUnauthorized: false },
  // En Vercel cada función abre su propio pool: pocas conexiones (usar el Transaction pooler, puerto 6543)
  max: process.env.VERCEL ? 2 : 10,
});
