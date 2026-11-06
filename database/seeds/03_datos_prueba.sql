-- =====================================================================
--  ENINTI · Script 03 — Datos de prueba ficticios (RNF-04). No son clientes reales.
--  Se ejecuta después de los scripts 01 y 02. Las fechas son relativas a hoy,
--  así los casos se mantienen sin importar el día en que se cargue:
--
--    · María  — Casa Granaderos: al día y su suscripción VENCE EN 2 DÍAS
--               Parcela Topáter: al día (pagos por depósito)
--    · Juan   — Casa Chiu Chiu: MOROSO (pagó 3 de 7 meses), un pago rechazado
--               y un depósito por validar
--    · Rosa   — Casa Caspana: su suscripción venció, se perdió y se RECUPERÓ
--               (historial encadenado), hoy al día
--    · Luis   — Edificio Tocopilla: moroso
--               Bodega Tocopilla: instalación SIN SUSCRIPCIÓN
--
--  Los usuarios de acceso (Supabase Auth) los crea "npm run db:init" después de
--  este script: el trigger los vincula por correo con su ficha de cliente o técnico.
-- =====================================================================

insert into public.tecnicos (nombre, empresa, rut, telefono, email, es_subcontratista) values
  ('Pedro Técnico', 'ENINTI',          '15555555-5', '+56922222222', 'tecnico@eninti.cl', false),
  ('Carla Técnica', 'Solar Norte SpA', '16666666-6', '+56977777777', 'carla@eninti.cl',   true);

insert into public.clientes (rut, nombre, email, telefono, direccion, localidad_id, origen)
select v.rut, v.nombre, v.email, v.telefono, v.direccion, l.id, v.origen
from (values
  ('11111111-1', 'María Rojas',  'maria.rojas@correo.cl',  '+56933333333', 'Av. Granaderos 1200, Calama',         'Calama',    'Boca a boca'),
  ('22222222-2', 'Juan Pérez',   'juan.perez@correo.cl',   '+56944444444', 'Calle Principal s/n, Chiu Chiu',      'Chiu Chiu', 'Instagram'),
  ('33333333-3', 'Rosa Mamani',  null,                     '+56955555555', 'Pasaje Los Andes 45, Caspana',        'Caspana',   'Referido'),
  ('44444444-4', 'Luis Ramírez', 'luis.ramirez@correo.cl', '+56966666666', 'Av. 18 de Septiembre 890, Tocopilla', 'Tocopilla', 'Boca a boca')
) as v (rut, nombre, email, telefono, direccion, localidad, origen)
join public.localidades l on l.nombre = v.localidad;

insert into public.instalaciones (cliente_id, nombre, direccion, localidad_id, latitud, longitud,
                                  fecha_instalacion, potencia_kwp, tipo_sistema, instalada_por_eninti, instalador_id, notas)
select c.id, v.nombre, v.direccion, l.id, v.lat, v.lon, v.fecha::date, v.kwp, v.tipo, v.eninti, t.id, v.notas
from (values
  ('11111111-1', 'Casa Granaderos',    'Av. Granaderos 1200',        'Calama',    -22.4560, -68.9290, '2025-10-20', 3.00, 'on_grid',  true,  'tecnico@eninti.cl', 'Casa esquina, portón verde'),
  ('11111111-1', 'Parcela Topáter',    'Parcela 12, sector Topáter', 'Calama',    -22.4700, -68.9100, '2026-05-20', 5.50, 'hibrido',  true,  'tecnico@eninti.cl', 'Bodega al fondo del terreno'),
  ('22222222-2', 'Casa Chiu Chiu',     'Calle Principal s/n',        'Chiu Chiu', -22.3380, -68.6490, '2025-08-20', 2.20, 'off_grid', true,  'carla@eninti.cl',   'Frente a la iglesia'),
  ('33333333-3', 'Casa Caspana',       'Pasaje Los Andes 45',        'Caspana',   -22.1330, -68.2160, '2025-02-15', 1.60, 'off_grid', true,  'carla@eninti.cl',   'Al lado de la posta'),
  ('44444444-4', 'Edificio Tocopilla', 'Av. 18 de Septiembre 890',   'Tocopilla', -22.0920, -70.1980, '2026-07-05', 4.40, 'on_grid',  true,  'tecnico@eninti.cl', 'Edificio azul, techo'),
  ('44444444-4', 'Bodega Tocopilla',   'Calle Bolívar 1450',         'Tocopilla', -22.0880, -70.1950, '2024-03-10', 2.75, 'on_grid',  false, null,                'Planta de otro instalador; cotizó mantención')
) as v (rut, nombre, direccion, localidad, lat, lon, fecha, kwp, tipo, eninti, tecnico, notas)
join public.clientes c    on c.rut = v.rut
join public.localidades l on l.nombre = v.localidad
left join public.tecnicos t on t.email = v.tecnico;

insert into public.equipos (instalacion_id, tipo, marca, modelo, cantidad, potencia_unitaria_w, capacidad_kwh,
                            fecha_instalacion, garantia_hasta, vida_util_anios)
select i.id, v.tipo::public.tipo_equipo, v.marca, v.modelo, v.cantidad, v.w, v.kwh, i.fecha_instalacion,
       (i.fecha_instalacion + make_interval(years => v.garantia))::date, v.vida
from (values
  ('Casa Granaderos',    'panel',    'JA Solar',  'JAM72S30 550 W',  6,  550,  null, 12, 25),
  ('Casa Granaderos',    'inversor', 'Growatt',   'MIN 3000TL-X',    1,  3000, null, 5,  10),
  ('Parcela Topáter',    'panel',    'Longi',     'Hi-MO 5 550 W',   10, 550,  null, 12, 25),
  ('Parcela Topáter',    'inversor', 'Huawei',    'SUN2000-5KTL',    1,  5000, null, 5,  10),
  ('Parcela Topáter',    'bateria',  'Pylontech', 'US3000C',         2,  null, 3.5,  5,  10),
  ('Casa Chiu Chiu',     'panel',    'Trina',     'Vertex 550 W',    4,  550,  null, 12, 25),
  ('Casa Chiu Chiu',     'inversor', 'Victron',   'MultiPlus 3000',  1,  3000, null, 5,  10),
  ('Casa Chiu Chiu',     'bateria',  'Victron',   'Gel 200 Ah',      1,  null, 2.4,  1,  2),   -- cerca del fin de su vida útil
  ('Casa Caspana',       'panel',    'Canadian',  'HiKu 400 W',      4,  400,  null, 12, 25),
  ('Casa Caspana',       'inversor', 'Must',      'PV1800',          1,  1800, null, 2,  8),
  ('Casa Caspana',       'bateria',  'Ritar',     'DG12-150 150 Ah', 2,  null, 1.8,  1,  2),   -- cerca del fin de su vida útil
  ('Edificio Tocopilla', 'panel',    'JA Solar',  'JAM72S30 550 W',  8,  550,  null, 12, 25),
  ('Edificio Tocopilla', 'inversor', 'Fronius',   'Primo 4.0',       1,  4000, null, 7,  12),
  ('Bodega Tocopilla',   'panel',    'Jinko',     'Tiger 460 W',     6,  460,  null, 12, 25),
  ('Bodega Tocopilla',   'inversor', 'SMA',       'Sunny Boy 3.0',   1,  3000, null, 5,  10)
) as v (instalacion, tipo, marca, modelo, cantidad, w, kwh, garantia, vida)
join public.instalaciones i on i.nombre = v.instalacion;

-- ---------------------------------------------------------------------
-- Suscripciones del Plan Básico (12 meses). La antigua de Casa Caspana se
-- inserta primero: como ya terminó, entra como "vencida", y la nueva queda
-- encadenada a ella (suscripcion_anterior_id) = cliente recuperado.
-- ---------------------------------------------------------------------
insert into public.suscripciones (instalacion_id, tipo_suscripcion_id, fecha_inicio)
select i.id, (select id from public.tipos_suscripcion where codigo = 'BASICA'),
       (public.fn_hoy() - interval '20 months')::date
from public.instalaciones i where i.nombre = 'Casa Caspana';

insert into public.suscripciones (instalacion_id, tipo_suscripcion_id, fecha_inicio)
select i.id, (select id from public.tipos_suscripcion where codigo = 'BASICA'), v.inicio
from (values
  ('Casa Granaderos',    (public.fn_hoy() + 2 - interval '12 months')::date),   -- vence en 2 días
  ('Parcela Topáter',    (public.fn_hoy() - interval '5 months')::date),
  ('Casa Chiu Chiu',     (public.fn_hoy() - interval '7 months')::date),
  ('Casa Caspana',       (public.fn_hoy() - interval '4 months')::date),        -- recuperada
  ('Edificio Tocopilla', (public.fn_hoy() - interval '3 months')::date)
) as v (instalacion, inicio)
join public.instalaciones i on i.nombre = v.instalacion;

-- ---------------------------------------------------------------------
-- Pagos: un pago por cada periodo de contrato ya iniciado; "cuantos" limita
-- cuántos periodos pagó (null = todos).
-- ---------------------------------------------------------------------
insert into public.pagos (suscripcion_id, periodo, monto, fecha_pago, medio_pago, estado, referencia_externa)
select s.id, date_trunc('month', p.ini)::date, s.monto_pactado,
       (least(p.ini + 3, public.fn_hoy()) + time '12:00') at time zone 'America/Santiago',
       v.medio::public.medio_pago, 'pagado',
       case when v.medio <> 'efectivo' then upper(left(v.medio, 3)) || '-' || s.id || '-' || to_char(p.ini, 'YYYYMM') end
from (values
  ('Casa Granaderos',    null::int, 'transferencia'),
  ('Parcela Topáter',    null,      'deposito'),
  ('Casa Chiu Chiu',     3,         'efectivo'),
  ('Casa Caspana',       null,      'efectivo'),
  ('Edificio Tocopilla', 1,         'transferencia')
) as v (instalacion, cuantos, medio)
join public.instalaciones i on i.nombre = v.instalacion
join public.suscripciones s on s.instalacion_id = i.id
cross join lateral (
  select g, (s.fecha_inicio + make_interval(months => g))::date as ini
  from generate_series(0, 24) g
) p
where p.ini <= least(public.fn_hoy(), s.fecha_termino - 1)
  and (v.cuantos is null or p.g < v.cuantos);

-- Juan: una transferencia rechazada (con motivo) y un depósito informado por validar
insert into public.pagos (suscripcion_id, periodo, monto, medio_pago, estado, referencia_externa,
                          motivo_rechazo, observaciones)
select s.id, date_trunc('month', s.fecha_inicio + make_interval(months => v.mes))::date, s.monto_pactado,
       v.medio::public.medio_pago, v.estado::public.estado_pago, v.ref, v.motivo, v.obs
from (values
  (3, 'transferencia', 'rechazado', 'TRF-0099', 'El comprobante es de otro monto', 'Comprobante enviado por WhatsApp'),
  (4, 'deposito',      'pendiente', 'DEP-0412', null,                              'Depósito informado por el cliente')
) as v (mes, medio, estado, ref, motivo, obs)
join public.instalaciones i on i.nombre = 'Casa Chiu Chiu'
join public.suscripciones s on s.instalacion_id = i.id and s.estado = 'vigente';

-- ---------------------------------------------------------------------
-- Mantenciones: las preventivas las agendó el trigger al crear cada suscripción.
-- Las que ya pasaron quedan realizadas; las próximas con técnico asignado.
-- ---------------------------------------------------------------------
update public.mantenciones m
   set estado = 'realizada',
       fecha_realizada = m.fecha_programada,
       hora_inicio = '09:00', hora_fin = '11:00',
       tecnico_id = (select id from public.tecnicos where email = 'tecnico@eninti.cl'),
       trabajo_realizado = 'Limpieza de paneles, revisión de inversor y cableado, medición de voltaje',
       hallazgos = 'Sistema en buen estado'
 where m.estado = 'programada' and m.fecha_programada < public.fn_hoy();

-- Casa Chiu Chiu: la última visita detectó que hay que cambiar la batería
update public.mantenciones m
   set hallazgos = 'Batería con baja capacidad (60 %)',
       recomendaciones = 'Reemplazar la batería antes del invierno',
       requiere_inversion = true,
       detalle_inversion = 'Batería de litio 2,4 kWh: aprox. $650.000 instalada'
 where m.id = (select max(m2.id) from public.mantenciones m2
               join public.instalaciones i on i.id = m2.instalacion_id
               where i.nombre = 'Casa Chiu Chiu' and m2.estado = 'realizada');

-- María ya calificó sus visitas; las demás quedan por calificar (se califica una sola vez)
update public.mantenciones m
   set calificacion_cliente = 5, comentario_cliente = 'Muy puntual y ordenado'
 where m.estado = 'realizada'
   and m.instalacion_id in (select id from public.instalaciones where nombre = 'Casa Granaderos');

update public.mantenciones m
   set tecnico_id = (select id from public.tecnicos where email = 'carla@eninti.cl')
 where m.estado = 'programada'
   and m.instalacion_id in (select id from public.instalaciones where nombre in ('Casa Chiu Chiu', 'Casa Caspana'));

-- Visita correctiva cobrada aparte, en 7 días (genera el aviso de mantención próxima)
insert into public.mantenciones (instalacion_id, suscripcion_id, tipo, fecha_programada, tecnico_id,
                                 hallazgos, valor_servicio)
select i.id, s.id, 'correctiva', public.fn_hoy() + 7, t.id, 'Inversor muestra alarma de aislamiento', 35000
from public.instalaciones i
join public.suscripciones s on s.instalacion_id = i.id and s.estado = 'vigente'
join public.tecnicos t on t.email = 'tecnico@eninti.cl'
where i.nombre = 'Parcela Topáter';

-- Gestión de recuperación con Luis por la Bodega sin suscripción
insert into public.gestiones (cliente_id, tipo, motivo, resultado, fecha)
select c.id, 'llamada', 'Ofrecer Plan Básico para la Bodega Tocopilla', 'Pide cotización por correo',
       now() - interval '3 days'
from public.clientes c where c.rut = '44444444-4';

-- Fin del script 03
