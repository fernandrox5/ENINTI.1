// Cliente de la API de Flow (https://www.flow.cl/docs/api.html). Cada llamada va firmada con
// HMAC-SHA256 de los parámetros ordenados usando FLOW_SECRET_KEY. Flow guarda la tarjeta: Syntia
// solo recibe el tipo y los últimos 4 dígitos.
import crypto from 'node:crypto';
import { ErrorHttp } from '../utils/validar.js';

// Estados de un pago en Flow
export const ESTADO_FLOW = { 1: 'pendiente', 2: 'pagado', 3: 'rechazado', 4: 'anulado' };

const config = () => {
  const { FLOW_API_KEY: apiKey, FLOW_SECRET_KEY: secreto, FLOW_API_URL: url } = process.env;
  if (!apiKey || !secreto || !url) throw new ErrorHttp(503, 'Los pagos en línea no están configurados (faltan las variables FLOW_*)');
  return { apiKey, secreto, url: url.replace(/\/$/, '') };
};

function firmar(params, secreto) {
  const texto = Object.keys(params).sort().map((k) => k + params[k]).join('');
  return crypto.createHmac('sha256', secreto).update(texto).digest('hex');
}

async function llamar(metodo, ruta, datos = {}) {
  const { apiKey, secreto, url } = config();
  const params = Object.fromEntries(Object.entries({ ...datos, apiKey }).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, String(v)]));
  const cuerpo = new URLSearchParams({ ...params, s: firmar(params, secreto) });
  let res;
  try {
    res = metodo === 'GET'
      ? await fetch(`${url}${ruta}?${cuerpo}`, { signal: AbortSignal.timeout(20000) })
      : await fetch(`${url}${ruta}`, { method: 'POST', body: cuerpo, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(20000) });
  } catch (err) {
    // Flow se queda sin responder cuando el correo del cliente no existe (por ejemplo, un dominio inventado)
    if (err?.name === 'TimeoutError') throw new ErrorHttp(502, 'Flow no respondió. Revisa que el correo del cliente sea un correo real e intenta de nuevo.');
    throw new ErrorHttp(502, 'No se pudo conectar con Flow. Intenta de nuevo en unos minutos.');
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new ErrorHttp(502, `Flow respondió: ${json.message || `error ${res.status}`}`);
    err.flow = json;
    throw err;
  }
  return json;
}

// Clientes y tarjetas
export const crearCliente = ({ nombre, email, externalId }) => llamar('POST', '/customer/create', { name: nombre, email, externalId });
export const inscribirTarjeta = (customerId, urlRetorno) => llamar('POST', '/customer/register', { customerId, url_return: urlRetorno });
export const estadoInscripcion = (token) => llamar('GET', '/customer/getRegisterStatus', { token });
export const eliminarTarjeta = (customerId) => llamar('POST', '/customer/unRegister', { customerId });

// Cobro directo a la tarjeta inscrita (responde con el estado del pago)
export const cobrarTarjeta = ({ customerId, monto, asunto, orden }) =>
  llamar('POST', '/customer/charge', { customerId, amount: monto, subject: asunto, commerceOrder: orden, currency: 'CLP' });

// Enlace de pago (transferencia, Webpay u otros medios de Flow)
export const crearEnlace = ({ orden, asunto, monto, email, urlConfirmacion, urlRetorno }) =>
  llamar('POST', '/payment/create', {
    commerceOrder: orden, subject: asunto, currency: 'CLP', amount: monto, email, paymentMethod: 9,
    urlConfirmation: urlConfirmacion, urlReturn: urlRetorno, timeout: 7 * 24 * 3600,
  });
export const estadoPago = (token) => llamar('GET', '/payment/getStatus', { token });
export const estadoPorOrden = (commerceOrder) => llamar('GET', '/payment/getStatusByCommerceId', { commerceId: commerceOrder });
