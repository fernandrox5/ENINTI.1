import { Link } from 'react-router-dom';

export function Marca() {
  return (
    <Link to="/" className="marca" aria-label="Syntia, ir al inicio">
      <span className="marca-sol" aria-hidden="true" />
      Syntia
    </Link>
  );
}
