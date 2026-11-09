-- =====================================================================
--  ENINTI · Plataforma de suscripciones de mantención solar
--  Script 05 — Plazo de pago (se ejecuta después del 04). Solo agrega
--  una opción de configuración; no modifica datos existentes.
--
--  El cobro es mensual y automático. Si el periodo en curso no se paga
--  dentro de este plazo, la suscripción se cierra sola con el motivo
--  "Falta de pago": no se acumula deuda ni se cobran meses atrás.
-- =====================================================================

insert into public.configuracion (clave, valor, descripcion)
values ('dias_plazo_pago', '7', 'Días para pagar el mes en curso antes de que la suscripción se cierre por falta de pago')
on conflict (clave) do nothing;

-- Fin del script 05
