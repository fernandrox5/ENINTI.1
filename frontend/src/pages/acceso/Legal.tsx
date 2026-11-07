// Términos de uso y política de privacidad (texto base del prototipo; ENINTI debe validarlo)
import { Volver } from '../../componentes';

const TEXTOS = {
  terminos: {
    titulo: 'Términos de uso',
    puntos: [
      'Syntia es la plataforma que ENINTI usa para administrar las suscripciones de mantención de sus instalaciones solares.',
      'El Plan Básico tiene un valor de $15.000 mensuales por instalación, dura 12 meses e incluye dos mantenciones preventivas al año.',
      'Cada mes de contrato se paga por transferencia, depósito o efectivo. El cliente puede informar su pago con el comprobante desde la plataforma; ENINTI lo valida.',
      'Los meses no pagados quedan como deuda pendiente y se muestran en la plataforma. ENINTI puede enviar recordatorios por correo.',
      'Las mantenciones preventivas se agendan al contratar y se coordinan según la localidad de la instalación.',
      'Al terminar el plazo, la suscripción vence. Para continuar se contrata una nueva.',
      'El cliente puede cancelar su suscripción. La cancelación no elimina los meses que ya estaban vencidos.',
      'El cliente es responsable de mantener su contraseña en reserva.',
    ],
  },
  privacidad: {
    titulo: 'Política de privacidad',
    puntos: [
      'ENINTI recopila tu nombre, correo, teléfono, RUT y la información de tus instalaciones solo para prestarte el servicio de mantención.',
      'Tus datos se guardan en servidores seguros y solo los ve el personal de ENINTI y los técnicos asignados a tus visitas.',
      'No compartimos tus datos con terceros para fines comerciales.',
      'Syntia no guarda datos de tarjetas de pago.',
      'Puedes pedir acceso, corrección o eliminación de tus datos escribiendo a ENINTI, conforme a la Ley N° 21.719 sobre protección de datos personales.',
    ],
  },
};

export default function Legal({ tipo }: { tipo: keyof typeof TEXTOS }) {
  const t = TEXTOS[tipo];
  return (
    <main className="acceso-pagina legal">
      <Volver />
      <h1 className="acceso-titulo">{t.titulo}</h1>
      <ol>{t.puntos.map((p) => <li key={p}>{p}</li>)}</ol>
      <p className="suave">Versión v1 · Texto de prueba del prototipo, sujeto a validación de ENINTI.</p>
    </main>
  );
}
