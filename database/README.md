# Base de datos

PostgreSQL alojado en **Supabase**. Los usuarios se autentican con **Supabase Auth**.

Modelo: **Cliente → Instalación → Suscripción → { Pagos, Mantenciones }**

| Script | Qué hace |
|---|---|
| `schema/00_reiniciar.sql` | Borra todo lo que crean los scripts 01 y 02 (solo desarrollo). |
| `schema/01_esquema_eninti.sql` | Esquema completo: tipos, tablas, triggers, vistas, RLS, Storage y proceso diario con pg_cron. |
| `schema/02_ajustes.sql` | Ajustes de la revisión: documentos visibles para el cliente, motivos de rechazo y anulación de pagos, medio "depósito", días de gracia en la deuda, renovación con motivo, calificación única, datos del servicio en la mantención y versiones de las condiciones del servicio. |
| `seeds/03_datos_prueba.sql` | Datos de prueba ficticios: cliente moroso, suscripción por vencer, instalación sin suscripción y cliente recuperado. |

## Crear la base

Con `DATABASE_URL` (Session pooler) y las claves de Supabase en `backend/.env`:

```
npm run db:init --prefix backend
```

Ejecuta los scripts en orden y crea los usuarios de prueba en Supabase Auth. **Borra todo lo anterior**, así que úsalo solo en desarrollo.

También se pueden ejecutar a mano en Supabase → SQL Editor (01, 02 y 03, en ese orden), pero así no se crean los usuarios de prueba.

## Reglas del modelo

1. La suscripción es de la **instalación**, no del cliente.
2. No existe "renovar": se **cierra** o **vence** una suscripción y se **crea** otra nueva (`suscripcion_anterior_id` guarda el historial).
3. Máximo una suscripción vigente por instalación.
4. Vigente mientras hoy ≤ `fecha_termino`. El proceso diario (`fn_proceso_diario`, pg_cron) pasa a vencidas las que terminaron y genera los avisos.
5. La instalación nace sin suscripción.
6. La deuda no se guarda: `v_suscripciones_estado` la calcula según los periodos de contrato que ya debían pagarse. Un periodo recién empezado se adeuda solo cuando pasan los días de gracia (`configuracion.dias_gracia_pago`).
7. Al crear una suscripción vigente se agendan solas sus mantenciones preventivas (Plan Básico: meses 3 y 9).

## Usuarios y roles

Cada usuario de `auth.users` tiene un registro en `perfiles` con su rol (`admin`, `cliente` o `tecnico`). Lo crea un trigger al registrarse, y al confirmar el correo se vincula con su ficha de `clientes` o `tecnicos` según el correo. Solo un administrador puede cambiar el rol.

El backend se conecta como dueño de las tablas, así que las políticas RLS no lo limitan. Las RLS protegen el acceso directo con la clave publicable: el administrador ve todo, el cliente solo lo suyo y el técnico sus mantenciones.

## Tablas

| Tabla | Para qué sirve |
|---|---|
| `perfiles` | Usuario de la plataforma (enlazado a `auth.users`) y su rol |
| `localidades` | Poblados atendidos (Calama, Chiu Chiu, Caspana…) |
| `clientes` | Ficha del cliente; se vincula a su perfil al registrarse |
| `tecnicos` | Técnicos y empresas subcontratistas |
| `instalaciones` | Planta fotovoltaica: ubicación y ficha técnica (código `INS-0001`) |
| `equipos` | Paneles, inversores, baterías… de cada instalación, con vida útil y retiro |
| `tipos_suscripcion` | Planes (hoy solo el Básico está activo) |
| `suscripciones` | Compromiso de pago de una instalación por un plazo (código `SUS-2026-00001`) y aceptación de condiciones |
| `pagos` | Pago de un periodo de la suscripción (manual o con comprobante) |
| `solicitudes` | Pedidos del cliente: mantención, emergencia o consulta |
| `mantenciones` | Visitas programadas y realizadas, técnico y calificación |
| `documentos` | Planos, fotos y contratos guardados en Storage |
| `gestiones` | Llamadas y contactos para retener o recuperar clientes |
| `notificaciones` | Cola de correos que genera el proceso diario |
| `configuracion` | Correo del administrador, días de aviso, versión de condiciones |
| `condiciones_servicio` | Versiones de las condiciones del servicio (vigencia y PDF); cada suscripción guarda la que aceptó el cliente |

Vistas principales: `v_suscripciones_estado`, `v_morosos`, `v_por_vencer`, `v_instalaciones_sin_suscripcion`, `v_historial_retencion`, `v_pagos_por_mes`, `v_calendario_mantenciones`, `v_resumen_admin`.
