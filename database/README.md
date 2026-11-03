# Base de datos

PostgreSQL. El modelo se derivó del diagrama de casos de uso.

- `schema/001_schema.sql` — creación de las 15 tablas.
- `seeds/001_datos.sql` — datos de prueba ficticios (RNF-04).
- `seeds/002_pagos.sql` — pagos de prueba (se cargan después de generar las cuotas).
- Diagrama ER: `docs/diagramas/modelo_er.drawio` (editable) y `modelo_er.png`.

## Crear la base local

```
createdb eninti
npm run db:init --prefix backend
```

`db:init` borra y vuelve a crear todas las tablas, así que úsalo solo en desarrollo.

## Tablas

| Tabla | Para qué sirve | Caso de uso |
|---|---|---|
| `usuario` | Cuentas de acceso con rol administrador, cliente o técnico | Iniciar sesión |
| `cliente` | Ficha del cliente; se vincula a su usuario al registrarse | Gestionar clientes, Registrarse |
| `comuna` | Localidades donde opera ENINTI | Calendario por comuna |
| `instalacion` | Ubicación y ficha técnica de cada instalación | Gestionar instalaciones, Consultar ficha técnica y ubicación |
| `suscripcion` | Plan contratado por instalación (una activa por instalación) | Cancelar suscripción |
| `cuota` | Cobro mensual generado por cada suscripción | Consultar impagas, estado de pagos |
| `pago` | Pago de una cuota, manual o automático | Registrar pago manual, Cobro automático, Historial |
| `medio_pago` | Token de la pasarela (nunca la tarjeta, RNF-03) | Inscribir medio de pago |
| `aceptacion_condiciones` | Registro de la aceptación de condiciones | Aceptar condiciones del servicio |
| `solicitud_mantencion` | Mantenciones pedidas por el cliente | Solicitar / Consultar solicitudes |
| `mantencion` | Visita programada, técnico asignado y registro de lo ejecutado | Calendario, Asignar, Registrar mantención |
| `pieza` | Catálogo de piezas y materiales | Registrar piezas |
| `mantencion_pieza` | Piezas previstas e instaladas en cada mantención | Registrar piezas |
| `notificacion` | Avisos de morosidad y de mantención próxima | Notificaciones (Temporizador) |
| `contacto` | Mensajes del formulario público | Enviar formulario de contacto |

## Reglas del modelo

- La deuda no se guarda: se calcula a partir de las cuotas vencidas (`fecha_vencimiento` anterior a hoy) que siguen pendientes.
- Las cuotas se generan solas, mes a mes, desde el inicio de la suscripción.
- Una cuota solo puede tener un pago aprobado.
