# Syntia · Plataforma de suscripciones de mantención solar

Syntia es una plataforma web para empresas que instalan y mantienen sistemas solares fotovoltaicos. Centraliza las suscripciones de mantención de cada instalación: pagos, mantenciones, equipos y documentos. Además entrega al dueño la información para decidir: quién no ha pagado, qué suscripciones vencen, qué clientes se perdieron y qué equipos hay que reemplazar.

Su primer cliente es **ENINTI**, empresa solar de Calama (Región de Antofagasta).

- **Portal del cliente:** instalaciones, suscripción, pagos y mantenciones, pensado primero para el celular.
- **Panel de administración:** clientes, instalaciones, suscripciones, pagos, calendario de mantenciones, seguimiento y reportes.
- **Avisos automáticos:** correos de vencimiento, pagos atrasados y mantenciones próximas.

## Modelo de negocio

```
Cliente ─< Instalación ─< Suscripción ─< { Pagos, Mantenciones }
```

- Un cliente tiene una o más instalaciones.
- Una instalación tiene muchas suscripciones en el tiempo, pero **solo una vigente**. Puede existir sin suscripción, y así se detectan las instalaciones sin cobertura.
- Renovar o cambiar de plan **cierra** la suscripción actual con su motivo y **crea** una nueva enlazada a la anterior. Así queda el historial de clientes perdidos y recuperados.
- Nada se borra: los pagos se anulan, las suscripciones se cierran y los equipos se retiran, siempre con motivo.

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | React + TypeScript + Vite + React Router |
| Backend | Node.js + Express |
| Base de datos | Supabase · PostgreSQL con RLS, vistas y triggers |
| Autenticación | Supabase Auth (tokens verificados con JWKS) |
| Archivos | Supabase Storage (documentos, comprobantes y condiciones del servicio) |
| Procesos programados | pg_cron (proceso diario de vencimientos y avisos) |
| Correo | Nodemailer + SMTP de Gmail |
| Despliegue | Vercel: sitio estático, API como función serverless y Vercel Cron · desarrollo (`develop`) y producción (`main`) |

## Estructura

```
├── frontend/          # Aplicación web (portal del cliente y panel de administración)
├── api/               # Función de Vercel que expone la API de Express
├── backend/           # API REST y envío de correos
│   ├── src/
│   └── scripts/       # db:init y tareas de mantenimiento
├── database/
│   ├── schema/        # 00 reinicio · 01 esquema · 02 ajustes
│   └── seeds/         # 03 datos de prueba
└── docs/              # Diagramas y documentación técnica
```

El detalle de la base de datos (tablas, vistas, reglas y seguridad) está en [database/README.md](database/README.md).

## Puesta en marcha

Requisitos: Node.js 22 y un proyecto en Supabase.

```bash
npm run install:all                     # instala dependencias (raíz, backend y frontend)
cp backend/.env.example backend/.env    # completar con los datos del proyecto Supabase
npm run db:init --prefix backend        # crea el esquema y carga datos de prueba (borra lo anterior)
npm run dev                             # backend en :3001 y frontend en :5173
```

Abre http://localhost:5173.

### Variables de entorno (`backend/.env`)

| Variable | Descripción |
|---|---|
| `PORT` | Puerto de la API (por defecto 3001) |
| `DATABASE_URL` | Conexión a PostgreSQL de Supabase (Session pooler) |
| `SUPABASE_URL` | URL del proyecto Supabase |
| `SUPABASE_PUBLISHABLE_KEY` | Clave publicable (inicio de sesión) |
| `SUPABASE_SECRET_KEY` | Clave secreta, **solo en el backend** |
| `SUPABASE_JWKS_URL` | Claves públicas para verificar los tokens |
| `GMAIL_USER` · `GMAIL_APP_PASSWORD` | Cuenta de Gmail y contraseña de aplicación para enviar los avisos |
| `MAIL_REDIRECT` | Solo desarrollo: todos los correos llegan a esta dirección |
| `ADMIN_EMAIL` | Correo del administrador que recibe los avisos (lo guarda `db:init`) |
| `CRON_SECRET` | Secreto con el que Vercel Cron llama a `/api/cron/avisos` |
| `CORS_ORIGINS` | Solo si el frontend se publica en otro dominio que la API (separados por coma) |

En Vercel el frontend y la API comparten dominio, así que `VITE_API_URL` (`frontend/.env`) queda vacía. Solo se usa si la API se publica aparte.

`.env` está en `.gitignore` y nunca se sube al repositorio. Las credenciales de cada ambiente se configuran en el servicio de despliegue.

### Usuarios de prueba

Los crea `npm run db:init`. Todos los datos son ficticios.

| Rol | Correo | Contraseña |
|---|---|---|
| Administrador | admin@eninti.cl | Admin123 |
| Cliente | maria.rojas@correo.cl · juan.perez@correo.cl | Cliente123 |
| Técnico | tecnico@eninti.cl · carla@eninti.cl | Tecnico123 |

Los datos de prueba incluyen los casos principales: un cliente moroso, una suscripción por vencer, una instalación sin suscripción y un cliente recuperado.

## Avisos por correo

1. **pg_cron** ejecuta `fn_proceso_diario()` todos los días a las 08:00 (hora de Chile). Pasa a vencidas las suscripciones que terminaron y deja en `notificaciones` los avisos del día: vencimiento próximo, suscripción vencida, pago atrasado y mantención próxima.
2. **Vercel Cron** llama a `/api/cron/avisos` a las 08:15. Ese endpoint envía los pendientes por SMTP de Gmail y marca el resultado con `fn_marcar_notificacion()`. Los que fallan se reintentan hasta 3 veces.

Para probarlo en local con los datos de prueba (con `MAIL_REDIRECT` todo llega a tu correo):

```bash
npm run avisos --prefix backend -- --generar   # genera los avisos de hoy y los envía
```

Ejemplo de asunto: *[Eninti] SUS-2026-00002 vence en 2 día(s) — María Rojas*.

## Despliegue (Vercel)

Un solo proyecto de Vercel conectado al repositorio, configurado en `vercel.json`:

| Ambiente | Rama | Uso |
|---|---|---|
| Producción | `main` | URL pública. Vercel Cron solo corre aquí |
| Desarrollo | `develop` | URL de vista previa para probar antes de pasar a producción |

Las variables de `backend/.env` se cargan en *Settings → Environment Variables* de Vercel, para Production y Preview. En Vercel, `DATABASE_URL` usa el **Transaction pooler** (puerto 6543). `MAIL_REDIRECT` va solo en Preview.

## Seguridad

- La autenticación la maneja Supabase Auth. El backend verifica cada token con las claves públicas del proyecto y carga el rol desde `perfiles`.
- Row Level Security en todas las tablas: el administrador ve todo, el cliente solo lo suyo y el técnico sus mantenciones.
- No se almacenan datos de tarjetas.
- Los datos personales se tratan conforme a la Ley N° 21.719.

## Hoja de ruta

| Etapa | Alcance | Estado |
|---|---|---|
| Base | Esquema en Supabase, ajustes y datos de prueba | ✅ |
| Base | Ingreso con Supabase Auth, ambientes de desarrollo y producción | 🔄 |
| Base | Proceso diario de avisos por correo | 🔄 |
| Núcleo | Registro, activación y recuperación de contraseña | ⏳ |
| Núcleo | Clientes, instalaciones, equipos y suscripciones | ⏳ |
| Núcleo | Pagos: registro, comprobantes, validación y deuda | ⏳ |
| Núcleo | Portal del cliente | ⏳ |
| Operación | Calendario de mantenciones, informes y calificación | ⏳ |
| Operación | Solicitudes y emergencias | ⏳ |
| Gestión | Seguimiento (morosos, por vencer, clientes a recuperar) y reportes | ⏳ |
| Gestión | Configuración: planes, técnicos, usuarios, avisos y condiciones | ⏳ |

## Equipo

| Integrante | Rol |
|---|---|
| Fernando Castillo | Desarrollo full stack · base de datos y backend |
| Cristofer Álvarez | Desarrollo full stack · frontend y avisos |
