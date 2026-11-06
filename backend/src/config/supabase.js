import { createAdminClient, createContextClient } from '@supabase/server/core';

// Cliente de Supabase con la clave secreta (SUPABASE_URL y SUPABASE_SECRET_KEY en .env).
// Solo se usa en el backend para administrar usuarios de Supabase Auth; nunca inicia sesión.
export const supabase = createAdminClient();

// Cliente nuevo con la clave publicable, sin sesión guardada, para iniciar o renovar
// la sesión de un usuario (uno por solicitud, así no se mezclan sesiones).
export const clienteAuth = () => createContextClient();
