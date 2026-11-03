// RF-09: inscripción del medio de pago en ambiente de pruebas.
// PASARELA=transbank → Webpay Oneclick Mall, ambiente de integración de Transbank (requiere internet)
// PASARELA=simulada  → pasarela local que imita el mismo flujo, para demos sin conexión
// En ningún caso pasan datos de tarjeta por el servidor de ENINTI (RNF-03).
import crypto from 'node:crypto';
import tbk from 'transbank-sdk';

const MODO = process.env.PASARELA === 'transbank' ? 'transbank' : 'simulada';

function oneclick() {
  return new tbk.Oneclick.MallInscription(new tbk.Options(
    tbk.IntegrationCommerceCodes.ONECLICK_MALL,
    tbk.IntegrationApiKeys.WEBPAY,
    tbk.Environment.Integration
  ));
}

// Inscripciones simuladas en curso: token → resultado elegido en la página de prueba
const simuladas = new Map();

export const pasarela = {
  modo: MODO,
  nombre: MODO === 'transbank' ? 'Transbank Oneclick (integración)' : 'Pasarela simulada',

  // Devuelve el token y la URL a la que el navegador debe enviar TBK_TOKEN por POST
  async iniciar({ usuario, correo, urlRetorno }) {
    if (MODO === 'transbank') {
      const r = await oneclick().start(usuario, correo, urlRetorno);
      return { token: r.token, url: r.url_webpay };
    }
    const token = crypto.randomBytes(24).toString('hex');
    simuladas.set(token, { urlRetorno, resultado: null });
    return { token, url: '/api/pasarela/simulada' };
  },

  // Confirma la inscripción. Devuelve null si el cliente la rechazó o anuló.
  async finalizar(token) {
    if (MODO === 'transbank') {
      const r = await oneclick().finish(token);
      if (r.response_code !== 0) return null;
      return {
        tokenPasarela: r.tbk_user,
        tipoTarjeta: r.card_type,
        ultimosDigitos: String(r.card_number || '').slice(-4),
      };
    }
    const s = simuladas.get(token);
    simuladas.delete(token);
    if (!s?.resultado || s.resultado.aprobada !== true) return null;
    return {
      tokenPasarela: 'sim_' + crypto.randomBytes(16).toString('hex'),
      tipoTarjeta: s.resultado.tipo,
      ultimosDigitos: s.resultado.ultimos,
    };
  },

  async eliminar({ tokenPasarela, usuario }) {
    if (MODO === 'transbank') await oneclick().delete(tokenPasarela, usuario);
  },

  // Solo modo simulado
  simulada: {
    existe: (token) => simuladas.has(token),
    responder(token, resultado) {
      const s = simuladas.get(token);
      if (!s) return null;
      s.resultado = resultado;
      return s.urlRetorno;
    },
  },
};
