// WhatsApp y teléfono de ENINTI (se editan en Configuración → General). Se piden una sola vez.
import { useEffect, useState } from 'react';

interface Contacto { whatsapp: string | null; telefono: string | null }
let cache: Promise<Contacto> | null = null;
const cargar = () => (cache ??= fetch(`${import.meta.env.VITE_API_URL ?? ''}/api/contacto`).then((r) => r.json()).catch(() => ({ whatsapp: null, telefono: null })));

// Enlace de WhatsApp de ENINTI con un mensaje opcional; null si aún no está configurado
export function useWhatsapp(texto?: string) {
  const [numero, setNumero] = useState<string | null>(null);
  useEffect(() => { cargar().then((c) => setNumero(c.whatsapp)); }, []);
  if (!numero) return null;
  return `https://wa.me/${numero.replace(/\D/g, '')}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`;
}
