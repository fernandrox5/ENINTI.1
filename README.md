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
| Técnico | tecnico@eninti.cl | Tecnico123 |

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

## Equipo

| Rol | Integrante |
|---|---|
| Product Owner | Jean (ENINTI) |
| Scrum Master | Cristofer Álvarez |
| Desarrollo | Cristofer Álvarez, Fernando Castillo |
| Docente | Juan José Godoy |
