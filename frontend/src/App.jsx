import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { SesionProvider, SoloRol } from './Sesion.jsx';
import { Encabezado } from './componentes.jsx';
import Login from './pages/Login.jsx';
import Registro from './pages/Registro.jsx';
import Clientes from './pages/admin/Clientes.jsx';
import ClienteForm from './pages/admin/ClienteForm.jsx';
import Instalaciones from './pages/admin/Instalaciones.jsx';
import InstalacionForm from './pages/admin/InstalacionForm.jsx';

const ENLACES_ADMIN = [
  ['/admin/clientes', 'Clientes'],
  ['/admin/instalaciones', 'Instalaciones'],
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
          </Route>

          <Route path="/cuenta" element={<Panel rol="cliente" enlaces={[['/cuenta', 'Mi cuenta']]} />}>
            <Route index element={<p>Bienvenido a tu cuenta ENINTI.</p>} />
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
