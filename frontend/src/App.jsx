import { useEffect, useState } from 'react';

export default function App() {
  const [estado, setEstado] = useState(null);

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then(setEstado)
      .catch(() => setEstado({ api: 'sin conexión', db: '—' }));
  }, []);

  return (
    <main className="contenedor">
      <h1>ENINTI</h1>
      <p>Plataforma de suscripciones de mantención solar</p>
      <ul>
        <li>API: {estado ? estado.api : 'verificando…'}</li>
        <li>Base de datos: {estado ? estado.db : 'verificando…'}</li>
      </ul>
    </main>
  );
}
