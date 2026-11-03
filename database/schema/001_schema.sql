-- ============================================================
-- ENINTI · Modelo de datos (PostgreSQL)
-- Derivado del diagrama de casos de uso.
-- Terminología: "instalación" = planta fotovoltaica del cliente.
-- ============================================================

-- Borra el modelo anterior (incluida la tabla "planta" del primer repositorio)
DROP TABLE IF EXISTS contacto, notificacion, mantencion_pieza, pieza, mantencion,
  solicitud_mantencion, pago, cuota, medio_pago, aceptacion_condiciones,
  suscripcion, instalacion, planta, cliente, comuna, usuario CASCADE;

-- Usuario registrado (Iniciar sesión). Rol: administrador, cliente o técnico.
CREATE TABLE usuario (
  id             SERIAL PRIMARY KEY,
  nombre         VARCHAR(120) NOT NULL,
  correo         VARCHAR(150) NOT NULL UNIQUE,
  password_hash  VARCHAR(100) NOT NULL,
  telefono       VARCHAR(20),
  rol            VARCHAR(15)  NOT NULL CHECK (rol IN ('administrador', 'cliente', 'tecnico')),
  activo         BOOLEAN      NOT NULL DEFAULT TRUE,
  creado_en      TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- Localidades donde opera ENINTI (calendario por comuna).
CREATE TABLE comuna (
  id      SERIAL PRIMARY KEY,
  nombre  VARCHAR(60) NOT NULL UNIQUE
);

-- Ficha del cliente (Gestionar clientes). El administrador puede crearlo
-- antes de que se registre; al registrarse se vincula por RUT con su usuario.
CREATE TABLE cliente (
  id          SERIAL PRIMARY KEY,
  usuario_id  INT UNIQUE REFERENCES usuario(id) ON DELETE SET NULL,
  rut         VARCHAR(12)  NOT NULL UNIQUE,
  nombre      VARCHAR(120) NOT NULL,
  correo      VARCHAR(150),
  telefono    VARCHAR(20),
  direccion   VARCHAR(200),
  creado_en   TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- Instalación fotovoltaica con su ficha técnica y ubicación.
CREATE TABLE instalacion (
  id                 SERIAL PRIMARY KEY,
  cliente_id         INT NOT NULL REFERENCES cliente(id) ON DELETE CASCADE,
  comuna_id          INT NOT NULL REFERENCES comuna(id),
  direccion          VARCHAR(200) NOT NULL,
  referencia         VARCHAR(200),
  latitud            NUMERIC(9, 6),
  longitud           NUMERIC(9, 6),
  potencia_kw        NUMERIC(6, 2),
  inversor           VARCHAR(120),
  paneles            VARCHAR(120),
  cantidad_paneles   INT CHECK (cantidad_paneles >= 0),
  baterias           VARCHAR(120),
  fecha_instalacion  DATE,
  creado_en          TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Una suscripción por instalación (plan básico: $15.000 mensuales, 2 mantenciones al año).
CREATE TABLE suscripcion (
  id                    SERIAL PRIMARY KEY,
  instalacion_id        INT NOT NULL REFERENCES instalacion(id) ON DELETE CASCADE,
  fecha_inicio          DATE NOT NULL DEFAULT CURRENT_DATE,
  cuota_mensual         INT  NOT NULL DEFAULT 15000 CHECK (cuota_mensual > 0),
  dia_cobro             INT  NOT NULL DEFAULT 5 CHECK (dia_cobro BETWEEN 1 AND 28),
  mantenciones_anuales  INT  NOT NULL DEFAULT 2,
  estado                VARCHAR(15) NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa', 'cancelada')),
  fecha_cancelacion     DATE,
  creado_en             TIMESTAMP NOT NULL DEFAULT NOW()
);
-- Solo una suscripción activa por instalación
CREATE UNIQUE INDEX suscripcion_activa_unica ON suscripcion (instalacion_id) WHERE estado = 'activa';

-- Aceptar condiciones del servicio (incluido en Registrarse).
CREATE TABLE aceptacion_condiciones (
  id           SERIAL PRIMARY KEY,
  usuario_id   INT NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  version      VARCHAR(20) NOT NULL,
  aceptado_en  TIMESTAMP   NOT NULL DEFAULT NOW()
);

-- Inscribir medio de pago. Solo se guarda el token de la pasarela, nunca la tarjeta (RNF-03).
CREATE TABLE medio_pago (
  id              SERIAL PRIMARY KEY,
  cliente_id      INT NOT NULL REFERENCES cliente(id) ON DELETE CASCADE,
  pasarela        VARCHAR(30)  NOT NULL,
  token_pasarela  VARCHAR(200) NOT NULL,
  tipo_tarjeta    VARCHAR(30),
  ultimos_digitos CHAR(4),
  activo          BOOLEAN   NOT NULL DEFAULT TRUE,
  creado_en       TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Cuota mensual generada para cada suscripción activa (base para deuda e impagos).
CREATE TABLE cuota (
  id                 SERIAL PRIMARY KEY,
  suscripcion_id     INT  NOT NULL REFERENCES suscripcion(id) ON DELETE CASCADE,
  periodo            DATE NOT NULL,              -- primer día del mes cobrado
  monto              INT  NOT NULL,
  fecha_vencimiento  DATE NOT NULL,
  estado             VARCHAR(15) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'pagada')),
  UNIQUE (suscripcion_id, periodo)
);

-- Pago de una cuota: manual (transferencia/efectivo) o cobro automático por la pasarela.
CREATE TABLE pago (
  id                SERIAL PRIMARY KEY,
  cuota_id          INT NOT NULL REFERENCES cuota(id) ON DELETE CASCADE,
  monto             INT NOT NULL CHECK (monto > 0),
  fecha_pago        DATE NOT NULL DEFAULT CURRENT_DATE,
  medio             VARCHAR(15) NOT NULL CHECK (medio IN ('transferencia', 'efectivo', 'tarjeta')),
  origen            VARCHAR(15) NOT NULL CHECK (origen IN ('manual', 'automatico')),
  estado            VARCHAR(15) NOT NULL DEFAULT 'aprobado' CHECK (estado IN ('aprobado', 'rechazado')),
  referencia        VARCHAR(100),               -- n° de transferencia o código de autorización
  registrado_por    INT REFERENCES usuario(id), -- administrador que registró el pago manual
  creado_en         TIMESTAMP NOT NULL DEFAULT NOW()
);
-- Una cuota no puede tener dos pagos aprobados
CREATE UNIQUE INDEX pago_aprobado_unico ON pago (cuota_id) WHERE estado = 'aprobado';

-- Solicitar mantención (cliente) / Consultar solicitudes (administrador).
CREATE TABLE solicitud_mantencion (
  id               SERIAL PRIMARY KEY,
  instalacion_id   INT NOT NULL REFERENCES instalacion(id) ON DELETE CASCADE,
  motivo           TEXT NOT NULL,
  fecha_preferida  DATE,
  estado           VARCHAR(15) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'agendada', 'rechazada')),
  creado_en        TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Mantención programada, asignada a un técnico y registrada al ejecutarse.
-- Depende de la suscripción: una instalación sin suscripción no tiene mantenciones.
CREATE TABLE mantencion (
  id                SERIAL PRIMARY KEY,
  suscripcion_id    INT NOT NULL REFERENCES suscripcion(id) ON DELETE CASCADE,
  tecnico_id        INT REFERENCES usuario(id),
  solicitud_id      INT UNIQUE REFERENCES solicitud_mantencion(id) ON DELETE SET NULL,
  tipo              VARCHAR(15) NOT NULL DEFAULT 'preventiva' CHECK (tipo IN ('preventiva', 'correctiva')),
  fecha_programada  DATE NOT NULL,
  fecha_ejecucion   DATE,
  estado            VARCHAR(15) NOT NULL DEFAULT 'programada' CHECK (estado IN ('programada', 'en_curso', 'finalizada', 'cancelada')),
  actividades       TEXT,
  observaciones     TEXT,
  creado_en         TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Catálogo de piezas y materiales.
CREATE TABLE pieza (
  id           SERIAL PRIMARY KEY,
  nombre       VARCHAR(120) NOT NULL UNIQUE,
  descripcion  VARCHAR(200),
  unidad       VARCHAR(20) NOT NULL DEFAULT 'unidad'
);

-- Registrar piezas utilizadas e instaladas en cada mantención.
CREATE TABLE mantencion_pieza (
  id             SERIAL PRIMARY KEY,
  mantencion_id  INT NOT NULL REFERENCES mantencion(id) ON DELETE CASCADE,
  pieza_id       INT NOT NULL REFERENCES pieza(id),
  cantidad       INT NOT NULL CHECK (cantidad > 0),
  tipo           VARCHAR(15) NOT NULL CHECK (tipo IN ('prevista', 'instalada'))
);

-- Notificar morosidad al administrador / mantención próxima al cliente (Temporizador).
CREATE TABLE notificacion (
  id          SERIAL PRIMARY KEY,
  usuario_id  INT NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  tipo        VARCHAR(25) NOT NULL CHECK (tipo IN ('morosidad', 'mantencion_proxima')),
  mensaje     TEXT NOT NULL,
  leida       BOOLEAN   NOT NULL DEFAULT FALSE,
  creado_en   TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Enviar formulario de contacto (Visitante).
CREATE TABLE contacto (
  id         SERIAL PRIMARY KEY,
  nombre     VARCHAR(120) NOT NULL,
  correo     VARCHAR(150) NOT NULL,
  telefono   VARCHAR(20),
  mensaje    TEXT NOT NULL,
  creado_en  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_instalacion_cliente ON instalacion (cliente_id);
CREATE INDEX idx_cuota_estado ON cuota (estado, fecha_vencimiento);
CREATE INDEX idx_pago_fecha ON pago (fecha_pago);
CREATE INDEX idx_mantencion_fecha ON mantencion (fecha_programada);
