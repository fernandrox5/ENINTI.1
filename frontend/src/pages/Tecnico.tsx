// El panel del técnico es una fase futura del proyecto
import { Marca, Titulo } from '../componentes';
import { useSesion } from '../sesion';

export default function Tecnico() {
  const { usuario, salir } = useSesion();
  return (
    <main className="acceso-pagina">
      <Marca sub="Técnico" />
      <Titulo fuerte={`Hola, ${usuario?.nombre.split(' ')[0]}.`} suave="Tu panel llega pronto." />
      <p className="acceso-texto">Por ahora ENINTI te avisa por correo de las mantenciones que tienes asignadas.</p>
      <button type="button" className="boton secundario" onClick={salir}>Cerrar sesión</button>
    </main>
  );
}
