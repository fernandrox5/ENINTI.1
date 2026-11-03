// RF-19: texto de las condiciones del servicio
export default function Condiciones({ condiciones }) {
  if (!condiciones) return null;
  return (
    <div className="condiciones">
      <h3>{condiciones.titulo}</h3>
      <ol>
        {condiciones.clausulas.map((c) => <li key={c}>{c}</li>)}
      </ol>
      <small>Versión {condiciones.version}</small>
    </div>
  );
}
