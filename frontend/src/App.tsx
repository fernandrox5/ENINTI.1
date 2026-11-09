import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { SesionProvider, ConSesion, SoloRol } from './sesion';
import Login from './pages/acceso/Login';
import PedirAcceso from './pages/acceso/PedirAcceso';
import RevisaCorreo from './pages/acceso/RevisaCorreo';
import Activar from './pages/acceso/Activar';
import Recuperar from './pages/acceso/Recuperar';
import NuevaContrasena from './pages/acceso/NuevaContrasena';
import Legal from './pages/acceso/Legal';
import Proximamente from './pages/Proximamente';
import InicioPorRol from './pages/InicioPorRol';
import Suscripciones from './pages/admin/suscripciones/Suscripciones';
import NuevaSuscripcion from './pages/admin/suscripciones/NuevaSuscripcion';
import SuscripcionDetalle from './pages/admin/suscripciones/SuscripcionDetalle';
import Pagos from './pages/admin/pagos/Pagos';
import RegistrarPago from './pages/admin/pagos/RegistrarPago';
import PagosPortal from './pages/portal/Pagos';
import InicioPortal from './pages/portal/Inicio';
import { Instalaciones as InstalacionesPortal, FichaInstalacion as FichaInstalacionPortal } from './pages/portal/Instalaciones';
import PlanesPortal from './pages/portal/Planes';
import PerfilPortal from './pages/portal/Perfil';
import Mantenciones from './pages/admin/mantenciones/Mantenciones';
import MantencionDetalle from './pages/admin/mantenciones/MantencionDetalle';
import { MantencionesPortal, MantencionPortal } from './pages/portal/Mantenciones';
import Solicitudes from './pages/admin/solicitudes/Solicitudes';
import { SolicitudesPortal, SolicitudPortal } from './pages/portal/Solicitudes';
import Seguimiento from './pages/admin/seguimiento/Seguimiento';
import InicioAdmin from './pages/admin/Inicio';
import Configuracion from './pages/admin/configuracion/Configuracion';
import EnConstruccion from './pages/EnConstruccion';
import { PanelTecnico, Visitas, VisitaTecnico } from './pages/tecnico/Tecnico';
import PanelAdmin from './layouts/PanelAdmin';
import PortalCliente from './layouts/PortalCliente';
import Mas from './pages/portal/Mas';
import Clientes from './pages/admin/clientes/Clientes';
import ClienteFicha from './pages/admin/clientes/ClienteFicha';
import Instalaciones from './pages/admin/instalaciones/Instalaciones';
import InstalacionFicha from './pages/admin/instalaciones/InstalacionFicha';
import NuevaInstalacion from './pages/admin/instalaciones/NuevaInstalacion';
import ReemplazarEquipo from './pages/admin/instalaciones/ReemplazarEquipo';

export default function App() {
  return (
    <SesionProvider>
      <BrowserRouter>
        <Routes>
          {/* Acceso (T-19): ingreso, acceso por invitación y recuperación */}
          <Route path="/login" element={<Login />} />
          <Route path="/acceso" element={<PedirAcceso />} />
          <Route path="/acceso/revisa-correo" element={<RevisaCorreo tipo="acceso" />} />
          <Route path="/registro" element={<Navigate to="/acceso" replace />} />
          <Route path="/activar" element={<Activar />} />
          <Route path="/recuperar" element={<Recuperar />} />
          <Route path="/recuperar/revisa-correo" element={<RevisaCorreo tipo="recuperar" />} />
          <Route path="/nueva-contrasena" element={<NuevaContrasena />} />
          <Route path="/terminos" element={<Legal tipo="terminos" />} />
          <Route path="/privacidad" element={<Legal tipo="privacidad" />} />
          <Route path="/ayuda" element={<Proximamente titulo="Ayuda" />} />
          <Route path="/contacto" element={<Proximamente titulo="Contacto" />} />
          <Route path="/inicio" element={<ConSesion><InicioPorRol /></ConSesion>} />

          {/* Panel de administración */}
          <Route path="/admin" element={<SoloRol rol="admin"><PanelAdmin /></SoloRol>}>
            <Route index element={<InicioAdmin />} />
            <Route path="clientes" element={<Clientes />} />
            <Route path="clientes/:id" element={<ClienteFicha />} />
            <Route path="instalaciones" element={<Instalaciones />} />
            <Route path="instalaciones/nueva" element={<NuevaInstalacion />} />
            <Route path="instalaciones/:id" element={<InstalacionFicha />} />
            <Route path="instalaciones/:id/reemplazar" element={<ReemplazarEquipo />} />
            <Route path="suscripciones" element={<Suscripciones />} />
            <Route path="suscripciones/nueva" element={<NuevaSuscripcion />} />
            <Route path="suscripciones/:id" element={<SuscripcionDetalle />} />
            <Route path="pagos" element={<Pagos />} />
            <Route path="pagos/registrar" element={<RegistrarPago />} />
            <Route path="mantenciones" element={<Mantenciones />} />
            <Route path="mantenciones/:id" element={<MantencionDetalle />} />
            <Route path="solicitudes" element={<Solicitudes />} />
            <Route path="seguimiento" element={<Seguimiento />} />
            <Route path="reportes/*" element={<EnConstruccion titulo="Reportes" tarea="T-35" />} />
            <Route path="configuracion" element={<Configuracion />} />
          </Route>

          {/* Portal del cliente */}
          <Route path="/portal" element={<SoloRol rol="cliente"><PortalCliente /></SoloRol>}>
            <Route index element={<InicioPortal />} />
            <Route path="instalaciones" element={<InstalacionesPortal />} />
            <Route path="instalaciones/:id" element={<FichaInstalacionPortal />} />
            <Route path="pagos" element={<PagosPortal />} />
            <Route path="mantenciones" element={<MantencionesPortal />} />
            <Route path="mantenciones/:id" element={<MantencionPortal />} />
            <Route path="solicitudes" element={<SolicitudesPortal />} />
            <Route path="solicitudes/:id" element={<SolicitudPortal />} />
            <Route path="planes" element={<PlanesPortal />} />
            <Route path="perfil" element={<PerfilPortal />} />
            <Route path="mas" element={<Mas />} />
          </Route>

          <Route path="/tecnico" element={<SoloRol rol="tecnico"><PanelTecnico /></SoloRol>}>
            <Route index element={<Visitas />} />
            <Route path="visitas/:id" element={<VisitaTecnico />} />
          </Route>
          <Route path="*" element={<Navigate to="/inicio" replace />} />
        </Routes>
      </BrowserRouter>
    </SesionProvider>
  );
}
