# ENINTI · Plataforma de suscripciones de mantención solar

Prototipo web para que **ENINTI** gestione las suscripciones de mantención de sus instalaciones fotovoltaicas: control de pagos, ficha técnica, calendario de mantenciones y panel del técnico.

Proyecto de Integración · Ingeniería en Informática · INACAP Calama · 2026

## Estructura

```
ENINTI.1/
├── frontend/   # Interfaz web (React + Vite)
├── backend/    # API REST (Node.js + Express)
├── database/   # Esquema y datos de prueba (PostgreSQL)
└── docs/       # Informes, planificación y diagramas
```

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | React + Vite + React Router |
| Backend | Node.js + Express, JWT y bcrypt |
| Base de datos | PostgreSQL |
| Pagos | Webpay Plus o Flow (ambiente de pruebas) |

## Requisitos

- Node.js 20.6 o superior
- PostgreSQL 14 o superior

## Puesta en marcha

```
npm run install:all                   # solo la primera vez
cp backend/.env.example backend/.env  # y completar los datos de la base
createdb eninti
npm run db:init --prefix backend      # crea las tablas y carga datos de prueba
npm run dev                           # backend (3001) y frontend (5173)
```

Abre http://localhost:5173. Para detener ambos: `Ctrl + C`.

### Usuarios de prueba

| Rol | Correo | Contraseña |
|---|---|---|
| Administrador | admin@eninti.cl | Admin123 |
| Cliente | maria.rojas@correo.cl | Cliente123 |
| Técnicos | tecnico@eninti.cl · carla@eninti.cl | Tecnico123 |

### Pasarela de pago (ambiente de pruebas)

En `backend/.env` se elige con `PASARELA`:

- `simulada`: pasarela local que imita el flujo de Webpay. Funciona sin internet y sirve para demostraciones.
- `transbank`: Webpay Oneclick en el ambiente de integración de Transbank (requiere internet). Usa las tarjetas de prueba que publica Transbank en su sitio para desarrolladores.

En ambos casos ENINTI solo guarda el token de la pasarela y los últimos 4 dígitos, nunca la tarjeta (RNF-03).

## Avance

| Sprint | Requerimiento | Estado |
|---|---|---|
| 1 | Configuración del entorno y repositorio | ✅ |
| 1 | Modelo de datos | ✅ |
| 1 | RF-08 · Registro y autenticación del cliente | ✅ |
| 1 | RF-02 · Administrar clientes e instalaciones | ✅ |
| 2 | RF-05 · Registrar pagos por transferencia o efectivo | ✅ |
| 2 | RF-01 · Suscripciones con pagos pendientes | ✅ |
| 2 | RF-10 · Meses pagados y deuda vigente | ✅ |
| 2 | RF-14 · Historial de pagos | ✅ |
| 2 | RF-04 · Listado mensual de pagos y exportación | ✅ |
| 3 | RF-13 · Ficha técnica de la instalación para el cliente | ✅ |
| 3 | RF-09 · Inscribir medio de pago en ambiente de pruebas | ✅ |
| 3 | RF-19 · Aceptación digital de condiciones | ✅ |
| 3 | RF-03 · Calendario de mantenciones por comuna y asignación de técnico | ✅ |
| 3 | RF-16 · Cancelación de la suscripción | ✅ |

## Equipo

| Rol | Integrante |
|---|---|
| Product Owner | Jean (ENINTI) |
| Scrum Master | Cristofer Álvarez |
| Desarrollo | Cristofer Álvarez, Fernando Castillo |
| Docente | Juan José Godoy |
