// Mockup 033: menú "Más" del portal en el celular
import { Link } from 'react-router-dom';
import { Inbox, Tag, User, MessageCircle, LogOut, ChevronRight } from 'lucide-react';
import { useSesion } from '../../sesion';
import { Titulo } from '../../componentes';
import { useWhatsapp } from '../../contacto';


export default function Mas() {
  const { usuario, salir } = useSesion();
  const wa = useWhatsapp();
  return (
    <section className="pagina-portal">
      <Titulo fuerte="Más" />
      <p className="suave">{usuario?.nombre}</p>
      <ul className="lista-menu">
        <li><Link to="/portal/solicitudes"><Inbox size={20} /> Mis solicitudes <ChevronRight size={18} /></Link></li>
        <li><Link to="/portal/planes"><Tag size={20} /> Planes <ChevronRight size={18} /></Link></li>
        <li><Link to="/portal/perfil"><User size={20} /> Mi perfil <ChevronRight size={18} /></Link></li>
        {wa && <li><a href={wa} target="_blank" rel="noreferrer"><MessageCircle size={20} /> Escribir por WhatsApp <ChevronRight size={18} /></a></li>}
        <li><button type="button" className="rojo" onClick={salir}><LogOut size={20} /> Cerrar sesión</button></li>
      </ul>
    </section>
  );
}
