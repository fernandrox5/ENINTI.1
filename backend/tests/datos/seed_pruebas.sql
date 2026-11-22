-- Escenario semilla del Estándar de Pruebas ENINTI (sección 5, Regla 1). Fecha de corte: 30-11-2026.
-- Solo se carga en la base de pruebas en memoria. Todos los datos son ficticios (.test).
--
--   11 instalaciones activas · 10 suscripciones: 7 vigentes, 1 cancelada por el cliente,
--   1 cerrada por falta de pago, 1 vencida.
--   Vigentes con noviembre pagado: 5 (cuatro de $15.000 y una de $25.000)
--   Vigente con noviembre sin pagar dentro del plazo (día 3 de 7): 1 de $20.000 (contrato del 28)
--   Vigente con noviembre sin pagar y plazo vencido: 1 de $15.000 (contrato del 15)
--   Pago atrasado: la cancelada pagó octubre ($15.000) el 02-11
--   Pago de borde: uno de los de $15.000 se pagó el 30-11 a las 23:30 hora de Chile

-- Administrador de las pruebas (el trigger de auth.users crea su perfil)
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values ('00000000-0000-0000-0000-00000000a001', 'admin@pruebas.test', now(), '{"nombre": "Admin Pruebas"}');
update public.perfiles set rol = 'admin' where id = '00000000-0000-0000-0000-00000000a001';

insert into public.clientes (rut, nombre, email, telefono, localidad_id) values
  ('10000013-K', 'Cliente Uno',    'uno@pruebas.test',    '+56911111111', 1),
  ('10000004-0', 'Cliente Dos',    'dos@pruebas.test',    '+56922222222', 1),
  ('12345678-5', 'Cliente Tres',   'tres@pruebas.test',   '+56933333333', 1),
  ('15000000-9', 'Cliente Cuatro', 'cuatro@pruebas.test', '+56944444444', 1),
  ('20000001-3', 'Cliente Cinco',  'cinco@pruebas.test',  '+56955555555', 1),
  ('10000009-1', 'Cliente Seis',   'seis@pruebas.test',   '+56966666666', 1),
  ('10000003-2', 'Cliente Siete',  'siete@pruebas.test',  '+56977777777', 1),
  ('10000005-9', 'Cliente Ocho',   'ocho@pruebas.test',   '+56988888888', 1);

-- 11 instalaciones activas (el código INS-#### lo pone el trigger)
insert into public.instalaciones (cliente_id, nombre, direccion, potencia_kwp, tipo_sistema)
select c.id, x.nombre, 'Calle de prueba 123', 3.5, 'on_grid'
from (values
  ('Cliente Uno',    'P01 V1 noviembre pagado'),
  ('Cliente Dos',    'P02 V2 noviembre pagado'),
  ('Cliente Tres',   'P03 V3 noviembre pagado'),
  ('Cliente Cuatro', 'P04 V4 pago de borde'),
  ('Cliente Cinco',  'P05 V5 $25.000 pagado'),
  ('Cliente Seis',   'P06 V6 $20.000 dentro del plazo'),
  ('Cliente Siete',  'P07 V7 plazo vencido'),
  ('Cliente Ocho',   'P08 cancelada por el cliente'),
  ('Cliente Ocho',   'P09 cerrada por falta de pago'),
  ('Cliente Uno',    'P10 vencida'),
  ('Cliente Dos',    'P11 nunca suscrita')
) x(cliente, nombre) join public.clientes c on c.nombre = x.cliente;

-- Suscripciones (plan mensual de 12 meses; el monto se pacta por suscripción)
insert into public.suscripciones (codigo, instalacion_id, tipo_suscripcion_id, fecha_inicio, monto_pactado)
select x.codigo, i.id, (select id from public.tipos_suscripcion where codigo = 'BASICA'), x.inicio::date, x.monto
from (values
  ('SUS-P-V1', 'P01 V1 noviembre pagado',          '2026-11-02', 15000),
  ('SUS-P-V2', 'P02 V2 noviembre pagado',          '2026-10-10', 15000),
  ('SUS-P-V3', 'P03 V3 noviembre pagado',          '2026-11-05', 15000),
  ('SUS-P-V4', 'P04 V4 pago de borde',             '2026-11-20', 15000),
  ('SUS-P-V5', 'P05 V5 $25.000 pagado',            '2026-11-08', 25000),
  ('SUS-P-V6', 'P06 V6 $20.000 dentro del plazo',  '2026-11-28', 20000),
  ('SUS-P-V7', 'P07 V7 plazo vencido',             '2026-11-15', 15000),
  ('SUS-P-C1', 'P08 cancelada por el cliente',     '2026-09-03', 15000),
  ('SUS-P-F1', 'P09 cerrada por falta de pago',    '2026-08-12', 15000),
  ('SUS-P-E1', 'P10 vencida',                      '2025-11-01', 15000)
) x(codigo, instalacion, inicio, monto) join public.instalaciones i on i.nombre = x.instalacion;

-- Pagos (fecha_pago en hora de Chile)
insert into public.pagos (suscripcion_id, periodo, monto, medio_pago, estado, fecha_pago)
select s.id, x.periodo::date, x.monto, 'deposito', 'pagado', (x.pagado_el || ' America/Santiago')::timestamptz
from (values
  ('SUS-P-V1', '2026-11-01', 15000, '2026-11-02 10:00'),
  ('SUS-P-V2', '2026-10-01', 15000, '2026-10-10 10:00'),
  ('SUS-P-V2', '2026-11-01', 15000, '2026-11-10 10:00'),
  ('SUS-P-V3', '2026-11-01', 15000, '2026-11-05 10:00'),
  ('SUS-P-V4', '2026-11-01', 15000, '2026-11-30 23:30'),   -- pago de borde
  ('SUS-P-V5', '2026-11-01', 25000, '2026-11-08 10:00'),
  ('SUS-P-C1', '2026-09-01', 15000, '2026-09-03 10:00'),
  ('SUS-P-C1', '2026-10-01', 15000, '2026-11-02 10:00'),   -- pago atrasado: octubre pagado el 02-11
  ('SUS-P-F1', '2026-08-01', 15000, '2026-08-12 10:00'),
  ('SUS-P-F1', '2026-09-01', 15000, '2026-09-12 10:00')
) x(codigo, periodo, monto, pagado_el) join public.suscripciones s on s.codigo = x.codigo;

-- La vencida pagó sus 12 meses, cada uno el día que partía (ninguno en noviembre de 2026)
insert into public.pagos (suscripcion_id, periodo, monto, medio_pago, estado, fecha_pago)
select s.id, g::date, 15000, 'deposito', 'pagado', (g::date::text || ' 10:00 America/Santiago')::timestamptz
from public.suscripciones s, generate_series('2025-11-01'::date, '2026-10-01'::date, interval '1 month') g
where s.codigo = 'SUS-P-E1';

-- Cierres: la cancelada queda cubierta hasta el fin de octubre pagado (02-11); la impaga se cerró al vencer su plazo
select public.fn_cerrar_suscripcion((select id from public.suscripciones where codigo = 'SUS-P-C1'), 'Cancelada por el cliente: prueba', '2026-11-03');
select public.fn_cerrar_suscripcion((select id from public.suscripciones where codigo = 'SUS-P-F1'), 'Falta de pago', '2026-10-12');
