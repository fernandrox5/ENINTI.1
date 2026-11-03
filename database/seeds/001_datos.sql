-- Datos de prueba ficticios (RNF-04). No corresponden a clientes reales.
-- Contraseñas: administrador Admin123 · clientes Cliente123 · técnicos Tecnico123

INSERT INTO comuna (nombre) VALUES
  ('Calama'), ('Chiu Chiu'), ('Lasana'), ('Caspana'), ('Toconce'), ('Tocopilla'), ('María Elena');

INSERT INTO usuario (nombre, correo, password_hash, telefono, rol) VALUES
  ('Administrador ENINTI', 'admin@eninti.cl',  '$2b$10$vxEUwpsyZezdwuNQ8SMNCuhxAuaNQZyOMUElCKTC2Z0a7cvRMIWU2', '+56911111111', 'administrador'),
  ('Pedro Técnico',        'tecnico@eninti.cl', '$2b$10$QqqVjLAZghqKEALGcwWKyO9sDLqLQx8.kj9UaXUXBvIV98eWesadS', '+56922222222', 'tecnico'),
  ('María Rojas',          'maria.rojas@correo.cl', '$2b$10$kbWEZ584PBBG55pZ4wFVr.st7TXSsdcKUF9K2qtowLqS8aZpSADei', '+56933333333', 'cliente'),
  ('Juan Pérez',           'juan.perez@correo.cl',  '$2b$10$kbWEZ584PBBG55pZ4wFVr.st7TXSsdcKUF9K2qtowLqS8aZpSADei', '+56944444444', 'cliente');

INSERT INTO cliente (usuario_id, rut, nombre, correo, telefono, direccion) VALUES
  (3,    '11111111-1', 'María Rojas',    'maria.rojas@correo.cl', '+56933333333', 'Av. Granaderos 1200, Calama'),
  (4,    '22222222-2', 'Juan Pérez',     'juan.perez@correo.cl',  '+56944444444', 'Calle Principal s/n, Chiu Chiu'),
  (NULL, '33333333-3', 'Rosa Mamani',    NULL,                    '+56955555555', 'Pasaje Los Andes 45, Caspana'),
  (NULL, '44444444-4', 'Luis Ramírez',   'luis.ramirez@correo.cl', '+56966666666', 'Av. 18 de Septiembre 890, Tocopilla');

INSERT INTO instalacion (cliente_id, comuna_id, direccion, referencia, latitud, longitud, potencia_kw, inversor, paneles, cantidad_paneles, baterias, fecha_instalacion) VALUES
  (1, 1, 'Av. Granaderos 1200',          'Casa esquina, portón verde',  -22.4560, -68.9290, 3.00, 'Growatt MIN 3000TL-X', 'JA Solar 550 W', 6,  NULL,                   '2025-11-10'),
  (1, 1, 'Parcela 12, sector Topáter',   'Bodega al fondo del terreno', -22.4700, -68.9100, 5.50, 'Huawei SUN2000-5KTL', 'Longi 550 W',    10, '2 × Pylontech 3,5 kWh', '2026-03-02'),
  (2, 2, 'Calle Principal s/n',          'Frente a la iglesia',         -22.3380, -68.6490, 2.20, 'Victron MultiPlus 3000', 'Trina 550 W',  4,  '1 × Victron 200 Ah',    '2025-08-20'),
  (3, 4, 'Pasaje Los Andes 45',          'Al lado de la posta',         -22.1330, -68.2160, 1.60, 'Must PV1800',          'Canadian 400 W', 4, '2 × Ritar 150 Ah',      '2026-01-15'),
  (4, 6, 'Av. 18 de Septiembre 890',     'Edificio azul, techo',        -22.0920, -70.1980, 4.40, 'Fronius Primo 4.0',    'JA Solar 550 W', 8,  NULL,                   '2026-07-05');

INSERT INTO suscripcion (instalacion_id, fecha_inicio, cuota_mensual, dia_cobro) VALUES
  (1, '2026-05-01', 15000, 5),
  (2, '2026-06-01', 15000, 5),
  (3, '2026-04-01', 15000, 10),
  (4, '2026-07-01', 15000, 5),
  (5, '2026-08-01', 15000, 5);

INSERT INTO pieza (nombre, descripcion, unidad) VALUES
  ('Fusible DC 15 A',          'Fusible para string de paneles', 'unidad'),
  ('Conector MC4',             'Par macho/hembra',               'par'),
  ('Cable solar 6 mm²',        'Cable rojo/negro',               'metro'),
  ('Protector de sobretensión', 'DPS DC 1000 V',                  'unidad'),
  ('Limpiador de paneles',     'Detergente neutro',              'litro');

INSERT INTO usuario (nombre, correo, password_hash, telefono, rol) VALUES
  ('Carla Técnica', 'carla@eninti.cl', '$2b$10$QqqVjLAZghqKEALGcwWKyO9sDLqLQx8.kj9UaXUXBvIV98eWesadS', '+56977777777', 'tecnico');

-- María y Juan ya aceptaron las condiciones del servicio
INSERT INTO aceptacion_condiciones (usuario_id, version, aceptado_en) VALUES
  (3, '2026-11', '2026-11-01 10:00'),
  (4, '2026-11', '2026-11-01 11:30');

-- Mantenciones: algunas ya ejecutadas y otras programadas
INSERT INTO mantencion (instalacion_id, tecnico_id, tipo, fecha_programada, fecha_ejecucion, estado, actividades, observaciones) VALUES
  (1, 2, 'preventiva', '2026-05-20', '2026-05-20', 'finalizada', 'Limpieza de paneles, revisión de conexiones y medición de voltaje', 'Sistema en buen estado'),
  (3, 2, 'preventiva', '2026-06-12', '2026-06-12', 'finalizada', 'Limpieza de paneles y revisión del banco de baterías', 'Se recomienda revisar baterías en la próxima visita'),
  (1, 2,    'preventiva', '2026-11-18', NULL, 'programada', NULL, NULL),
  (2, 2,    'preventiva', '2026-11-18', NULL, 'programada', NULL, NULL),
  (3, 5,    'preventiva', '2026-11-25', NULL, 'programada', NULL, NULL),
  (4, 5,    'preventiva', '2026-11-25', NULL, 'programada', NULL, NULL),
  (5, NULL, 'preventiva', '2026-12-03', NULL, 'programada', NULL, NULL);
