// RF-19: condiciones del servicio. Al cambiar el texto, sube la versión
// para que los clientes deban aceptarlas de nuevo.
// Texto de prueba para el prototipo: debe validarlo ENINTI antes de usarse.
export const CONDICIONES = {
  version: '2026-11',
  titulo: 'Condiciones del servicio de mantención ENINTI',
  clausulas: [
    'El plan básico tiene un valor de $15.000 mensuales por cada instalación y considera dos mantenciones preventivas al año.',
    'La cuota se cobra cada mes en el día de cobro indicado en la suscripción, mediante el medio de pago inscrito o por transferencia o efectivo.',
    'Las cuotas no pagadas quedan como deuda pendiente y se informan en "Mi cuenta".',
    'Las mantenciones se coordinan según la comuna de la instalación. El cliente puede solicitar una visita desde la plataforma.',
    'El cliente puede cancelar su suscripción en cualquier momento desde "Mi cuenta". La cancelación no elimina las cuotas que ya estaban vencidas.',
    'ENINTI no almacena los datos de la tarjeta: la inscripción y los cobros los realiza la pasarela de pago.',
    'Los datos personales se usan solo para prestar el servicio, conforme a la Ley N° 21.719 sobre protección de datos personales.',
  ],
};
