import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { SesionProvider, ConSesion, SoloRol } from './sesion';
import Login from './pages/acceso/Login';
import Registro from './pages/acceso/Registro';
import RevisaCorreo from './pages/acceso/RevisaCorreo';
import Activar from './pages/acceso/Activar';
import Recuperar from './pages/acceso/Recuperar';
import NuevaContrasena from './pages/acceso/NuevaContrasena';
import Legal from './pages/acceso/Legal';
import Proximamente from './pages/Proximamente';
import InicioPorRol from './pages/InicioPorRol';
import EnConstruccion from './pages/EnConstruccion';
import Tecnico from './pages/Tecnico';
import PanelAdmin from './layouts/PanelAdmin';
import PortalCliente from './layouts/PortalCliente';
import Mas from './pages/portal/Mas';

export default function App() {
  return (
    <SesionProvider>
      <BrowserRouter>
        <Routes>
          {/* Acceso (T-19) */}
          <Route path="/login" element={<Login />} />
          <Route path="/registro" element={<Registro />} />
          <Route path="/registro/revisa-correo" element={<RevisaCorreo tipo="activar" />} />
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
            <Route index element={<EnConstruccion titulo="Inicio" tarea="T-36" />} />
            <Route path="clientes/*" element={<EnConstruccion titulo="Clientes" tarea="T-22" />} />
            <Route path="instalaciones/*" element={<EnConstruccion titulo="Instalaciones" tarea="T-24" />} />
            <Route path="suscripciones/*" element={<EnConstruccion titulo="Suscripciones" tarea="T-21" />} />
            <Route path="pagos/*" element={<EnConstruccion titulo="Pagos" tarea="T-23, T-25 y T-26" />} />
            <Route path="mantenciones/*" element={<EnConstruccion titulo="Mantenciones" tarea="T-28 y T-32" />} />
            <Route path="solicitudes/*" element={<EnConstruccion titulo="Solicitudes" tarea="T-29" />} />
            <Route path="seguimiento/*" element={<EnConstruccion titulo="Seguimiento" tarea="T-30" />} />
            <Route path="reportes/*" element={<EnConstruccion titulo="Reportes" tarea="T-35" />} />
            <Route path="configuracion/*" element={<EnConstruccion titulo="Configuración" tarea="T-33" />} />
          </Route>

          {/* Portal del cliente */}
          <Route path="/portal" element={<SoloRol rol="cliente"><PortalCliente /></SoloRol>}>
            <Route index element={<EnConstruccion titulo="Inicio" tarea="T-27" />} />
            <Route path="instalaciones/*" element={<EnConstruccion titulo="Instalaciones" tarea="T-27" />} />
            <Route path="pagos/*" element={<EnConstruccion titulo="Pagos" tarea="T-25" />} />
            <Route path="mantenciones/*" element={<EnConstruccion titulo="Mantenciones" tarea="T-31" />} />
            <Route path="solicitudes/*" element={<EnConstruccion titulo="Mis solicitudes" tarea="T-29" />} />
            <Route path="planes" element={<EnConstruccion titulo="Planes" tarea="T-21" />} />
            <Route path="perfil" element={<EnConstruccion titulo="Mi perfil" tarea="T-27" />} />
            <Route path="mas" element={<Mas />} />
          </Route>

          <Route path="/tecnico" element={<SoloRol rol="tecnico"><Tecnico /></SoloRol>} />
          <Route path="*" element={<Navigate to="/inicio" replace />} />
        </Routes>
      </BrowserRouter>
    </SesionProvider>
  );
}
