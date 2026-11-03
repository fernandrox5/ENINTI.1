import express from 'express';
import health from './routes/health.js';
import auth from './routes/auth.js';
import clientes from './routes/clientes.js';
import instalaciones from './routes/instalaciones.js';
import pagos from './routes/pagos.js';
import cuenta from './routes/cuenta.js';
import mantenciones from './routes/mantenciones.js';
import pasarelaRutas from './routes/pasarela.js';
import { autenticar, permitir } from './middleware/auth.js';

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false })); // retorno de la pasarela (POST de formulario)

app.use('/api/health', health);
app.use('/api/auth', auth);
app.use('/api/pasarela', pasarelaRutas);

// Administrador
app.use('/api/clientes', autenticar, permitir('administrador'), clientes);
app.use('/api/instalaciones', autenticar, permitir('administrador'), instalaciones);
app.use('/api/pagos', autenticar, permitir('administrador'), pagos);
app.use('/api/mantenciones', autenticar, permitir('administrador'), mantenciones);

// Cliente
app.use('/api/cuenta', autenticar, permitir('cliente'), cuenta);

app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// Errores: los ErrorHttp se informan al usuario; el resto se registra
app.use((err, req, res, next) => {
  if (err.status) return res.status(err.status).json({ error: err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Datos mal formados' });
  console.error(err);
  res.status(500).json({ error: 'Ocurrió un error en el servidor' });
});

export default app;
