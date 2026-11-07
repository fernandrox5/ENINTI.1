// Sección del Sprint 3 que aún no se construye: muestra su tarea del plan
import { Titulo } from '../componentes';

export default function EnConstruccion({ titulo, tarea }: { titulo: string; tarea: string }) {
  return (
    <section className="en-construccion">
      <Titulo fuerte={`${titulo}.`} suave="En construcción." />
      <p>Esta sección se habilita con la tarea <strong>{tarea}</strong> del plan.</p>
    </section>
  );
}
