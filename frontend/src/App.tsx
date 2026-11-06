import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { SesionProvider, ConSesion } from './sesion';
import Login from './pages/Login';
import Inicio from './pages/Inicio';
import Proximamente from './pages/Proximamente';

export default function App() {
  return (
    <SesionProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/inicio" element={<ConSesion><Inicio /></ConSesion>} />
          <Route path="/registro" element={<Proximamente titulo="Crear cuenta" />} />
          <Route path="/recuperar" element={<Proximamente titulo="Recuperar contraseña" />} />
          <Route path="/ayuda" element={<Proximamente titulo="Ayuda" />} />
          <Route path="/contacto" element={<Proximamente titulo="Contacto" />} />
          <Route path="/terminos" element={<Proximamente titulo="Términos de uso" />} />
          <Route path="/privacidad" element={<Proximamente titulo="Política de privacidad" />} />
          <Route path="*" element={<Navigate to="/inicio" replace />} />
        </Routes>
      </BrowserRouter>
    </SesionProvider>
  );
}
