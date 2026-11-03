-- Pagos de prueba. Se ejecuta después de generar las cuotas.
-- Resultado esperado: María al día en la instalación 1 y con deuda en la 2,
-- Juan con deuda de varios meses, Rosa al día, Luis con un mes vencido.

WITH pagadas AS (
  SELECT c.id, c.monto, c.periodo, s.instalacion_id
  FROM cuota c JOIN suscripcion s ON s.id = c.suscripcion_id
  WHERE c.periodo < date_trunc('month', CURRENT_DATE)   -- el mes en curso aún no se paga
    AND ((s.instalacion_id = 1)
     OR (s.instalacion_id = 2 AND c.periodo <= '2026-08-01')
     OR (s.instalacion_id = 3 AND c.periodo <= '2026-06-01')
     OR (s.instalacion_id = 4)
     OR (s.instalacion_id = 5 AND c.periodo <= '2026-09-01'))
)
INSERT INTO pago (cuota_id, monto, fecha_pago, medio, origen, referencia, registrado_por)
SELECT id, monto, periodo + 4,
       CASE WHEN instalacion_id IN (3, 4) THEN 'efectivo' ELSE 'transferencia' END,
       'manual',
       CASE WHEN instalacion_id IN (3, 4) THEN NULL ELSE 'TRF-' || id END,
       1
FROM pagadas;

UPDATE cuota SET estado = 'pagada'
WHERE id IN (SELECT cuota_id FROM pago WHERE estado = 'aprobado');
