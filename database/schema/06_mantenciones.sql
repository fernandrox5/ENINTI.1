-- =====================================================================
--  ENINTI · Plataforma de suscripciones de mantención solar
--  Script 06 — Agenda de mantenciones (se ejecuta después del 05).
--  Solo agrega columnas: no modifica datos existentes.
--
--    1. motivo_cancelacion: una mantención no se borra, se cancela con motivo
--    2. notas: indicaciones para el técnico al agendar (acceso, contacto…)
-- =====================================================================

alter table public.mantenciones
  add column if not exists motivo_cancelacion text,
  add column if not exists notas text;

-- Fin del script 06
