// ===== WHITELIST DE NÚMEROS AUTORIZADOS =====
// Solo estos números recibirán respuestas automáticas (FUTURO)
// Formato: '5491112345678@c.us' (número completo con @c.us)
const AUTHORIZED_NUMBERS = [
  '5491100000001@c.us',      // Agustin Iglesias
  '5491100000002@c.us',      // Bot "En Palabras"
  // Agregar más números aquí según sea necesario
];





/**
 * Verifica si un número está autorizado para recibir auto-respuestas
 * @param {string} phoneNumber - Número en formato '5491112345678@c.us'
 * @returns {boolean}
 */
function isAuthorizedNumber(phoneNumber) {
  return AUTHORIZED_NUMBERS.includes(phoneNumber);
}

/**
 * Maneja los mensajes entrantes de WhatsApp
 * @param {Object} message - Objeto del mensaje de whatsapp-web.js
 * @param {string} webhookUrl - URL del webhook de Vercel
 */
export async function handleIncomingMessage(message, webhookUrl) {
  try {
    const isGroup = message.from.includes('@g.us');
    
    // Extraer información del mensaje
    const messageData = {
      from: message.from,
      fromName: message._data.notifyName || 'Desconocido',
      message: message.body,
      timestamp: new Date().toISOString(),
      isGroup: isGroup,
      messageId: message.id._serialized,
      hasMedia: message.hasMedia,
      type: message.type
    };

    console.log('📤 Enviando mensaje al webhook:', messageData);

    // Enviar a tu backend en Vercel si está configurado
    if (webhookUrl) {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Source': 'whatsapp-bot'
        },
        body: JSON.stringify(messageData)
      });

      if (!response.ok) {
        console.error(`❌ Error al enviar al webhook: ${response.status} ${response.statusText}`);
      } else {
        console.log('✅ Mensaje enviado al webhook exitosamente');
      }
    }

    // ===== LÓGICA DE AUTO-RESPUESTA (DESHABILITADA - SOLO LOGS) =====
    
    // Ignorar mensajes de grupos
    if (isGroup) {
      console.log('⏭️  Mensaje de grupo recibido (sin auto-respuesta)');
      return;
    }

    console.log(`📨 Mensaje individual de ${message.from} registrado`);

    /* ===== AUTO-RESPUESTAS COMENTADAS - PARA FUTURO =====
    
    // Verificar si el número está autorizado para auto-respuestas
    if (!isAuthorizedNumber(message.from)) {
      console.log(`⏭️  Número ${message.from} no autorizado para auto-respuestas`);
      return;
    }

    console.log(`✅ Número ${message.from} autorizado - procesando auto-respuesta`);

    const bodyLower = message.body.toLowerCase().trim();

    // Ejemplo: Respuesta a "ayuda"
    if (bodyLower === 'ayuda' || bodyLower === 'help') {
      await message.reply(
        '👋 ¡Hola! Soy el asistente automático de Monchis Drivers.\n\n' +
        'Estoy aquí para ayudarte con:\n' +
        '• Información sobre capacitaciones\n' +
        '• Estado de tu postulación\n' +
        '• Consultas generales\n\n' +
        'Un representante se pondrá en contacto contigo pronto.'
      );
      return;
    }

    // Ejemplo: Respuesta a "estado"
    if (bodyLower.includes('estado') || bodyLower.includes('postulacion')) {
      await message.reply(
        '📋 Para consultar el estado de tu postulación, ' +
        'un miembro de nuestro equipo te contactará en breve. ' +
        'También puedes enviarnos un email a rrhh@monchis.com'
      );
      return;
    }

    // Ejemplo: Respuesta a "capacitación"
    if (bodyLower.includes('capacitacion') || bodyLower.includes('curso')) {
      await message.reply(
        '📚 Para información sobre capacitaciones, ' +
        'visita nuestro sitio web o escribe "ayuda" para más opciones.'
      );
      return;
    }
    
    ===== FIN AUTO-RESPUESTAS COMENTADAS ===== */

  } catch (error) {
    console.error('❌ Error procesando mensaje:', error);
  }
}

/**
 * Procesa comandos especiales (opcional - para debugging)
 * @param {Object} message - Mensaje de WhatsApp
 */
export async function handleCommand(message) {
  const body = message.body.trim();
  
  if (!body.startsWith('/')) {
    return false;
  }

  const [command, ...args] = body.slice(1).split(' ');

  switch (command.toLowerCase()) {
    case 'ping':
      await message.reply('🏓 Pong!');
      return true;
    
    case 'info':
      await message.reply(
        '🤖 Bot de WhatsApp - Monchis Drivers\n' +
        'Versión: 1.0.0\n' +
        'Estado: Activo ✅'
      );
      return true;
    
    default:
      return false;
  }
}