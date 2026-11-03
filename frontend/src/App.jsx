import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { SesionProvider, SoloRol } from './Sesion.jsx';
import { Encabezado } from './componentes.jsx';
import Login from './pages/Login.jsx';
import Registro from './pages/Registro.jsx';
import Clientes from './pages/admin/Clientes.jsx';
import ClienteForm from './pages/admin/ClienteForm.jsx';
import Instalaciones from './pages/admin/Instalaciones.jsx';
import InstalacionForm from './pages/admin/InstalacionForm.jsx';
import Impagos from './pages/admin/Impagos.jsx';
import PagosMes from './pages/admin/PagosMes.jsx';
import MiCuenta from './pages/cliente/MiCuenta.jsx';
import FichaInstalacion from './pages/cliente/FichaInstalacion.jsx';
import MedioPago from './pages/cliente/MedioPago.jsx';
import Calendario from './pages/admin/Calendario.jsx';

const ENLACES_ADMIN = [
  ['/admin/clientes', 'Clientes'],
  ['/admin/instalaciones', 'Instalaciones'],
  ['/admin/mantenciones', 'Mantenciones'],
  ['/admin/impagos', 'Impagos'],
  ['/admin/pagos', 'Pagos del mes'],
];

const ENLACES_CLIENTE = [
  ['/cuenta', 'Mi cuenta'],
  ['/cuenta/medio-pago', 'Medio de pago'],
];

function Panel({ rol, enlaces }) {
  return (
    <SoloRol rol={rol}>
      <Encabezado enlaces={enlaces} />
      <main className="contenedor"><Outlet /></main>
    </SoloRol>
  );
}

export default function App() {
  return (
    <SesionProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/registro" element={<Registro />} />

          <Route path="/admin" element={<Panel rol="administrador" enlaces={ENLACES_ADMIN} />}>
            <Route index element={<Navigate to="clientes" replace />} />
            <Route path="clientes" element={<Clientes />} />
            <Route path="clientes/:id" element={<ClienteForm />} />
            <Route path="instalaciones" element={<Instalaciones />} />
            <Route path="instalaciones/nueva" element={<InstalacionForm />} />
            <Route path="instalaciones/:id" element={<InstalacionForm />} />
            <Route path="mantenciones" element={<Calendario />} />
            <Route path="impagos" element={<Impagos />} />
            <Route path="pagos" element={<PagosMes />} />
          </Route>

          <Route path="/cuenta" element={<Panel rol="cliente" enlaces={ENLACES_CLIENTE} />}>
            <Route index element={<MiCuenta />} />
            <Route path="instalaciones/:id" element={<FichaInstalacion />} />
            <Route path="medio-pago" element={<MedioPago />} />
          </Route>

          <Route path="/tecnico" element={<Panel rol="tecnico" />}>
            <Route index element={<p>El panel del técnico se desarrolla en el Sprint 4.</p>} />
          </Route>

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </SesionProvider>
  );
}
