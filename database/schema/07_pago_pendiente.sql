-- 07 · Un solo criterio de "pago pendiente" en todo el sistema.
-- Con el cobro automático (como una suscripción de streaming) el mes se cobra el día que corresponde y,
-- si no se paga, hay un plazo (dias_plazo_pago) antes de cerrar el plan. Ya no hay días de gracia:
-- el mes queda pendiente desde su fecha de cobro, igual que en Seguimiento, Inicio y el portal.
update public.configuracion
   set valor = '0',
       descripcion = 'Días de gracia antes de considerar pendiente un mes (0: pendiente desde su fecha de cobro; el plazo para pagar es dias_plazo_pago)'
 where clave = 'dias_gracia_pago';
