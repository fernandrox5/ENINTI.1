import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

// En el celular las tablas se muestran como tarjetas: cada celda lleva el nombre de su columna (data-label)
function etiquetarTablas() {
  document.querySelectorAll<HTMLTableElement>('.tabla table').forEach((t) => {
    const nombres = [...t.querySelectorAll('thead th')].map((th) => th.textContent?.trim() ?? '');
    t.querySelectorAll('tbody tr').forEach((tr) => [...tr.children].forEach((td, k) => {
      if (td.getAttribute('data-label') !== nombres[k]) td.setAttribute('data-label', nombres[k] ?? '');
    }));
  });
}
let pendiente = 0;
new MutationObserver(() => { cancelAnimationFrame(pendiente); pendiente = requestAnimationFrame(etiquetarTablas); })
  .observe(document.body, { childList: true, subtree: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
