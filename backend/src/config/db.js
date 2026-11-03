import pg from 'pg';

// Las columnas DATE se entregan como texto 'AAAA-MM-DD' para evitar desfases de zona horaria
pg.types.setTypeParser(1082, (valor) => valor);

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 8000,
});
