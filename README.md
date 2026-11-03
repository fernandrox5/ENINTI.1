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
| Frontend | React + Vite |
| Backend | Node.js + Express |
| Base de datos | PostgreSQL |
| Pagos | Webpay Plus o Flow (ambiente de pruebas) |

## Requisitos

- Node.js 20.6 o superior
- PostgreSQL 14 o superior

## Puesta en marcha

```
npm run install:all                 # solo la primera vez
cp backend/.env.example backend/.env  # y completar los datos de la base
npm run dev                         # backend (3001) y frontend (5173)
```

Abre http://localhost:5173. Para detener ambos: `Ctrl + C`.

## Equipo

| Rol | Integrante |
|---|---|
| Product Owner | Jean (ENINTI) |
| Scrum Master | Cristofer Álvarez |
| Desarrollo | Cristofer Álvarez, Fernando Castillo |
| Docente | Juan José Godoy |
