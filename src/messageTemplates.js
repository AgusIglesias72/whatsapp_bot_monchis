/**
 * Templates de mensajes de WhatsApp para Monchis Drivers
 * Centraliza todos los mensajes que envía el bot
 */

/**
 * Genera mensajes contextuales según el tipo y parámetros
 * @param {string} type - Tipo de mensaje ('application_received' | 'form_incomplete' | 'custom')
 * @param {string} name - Nombre completo del destinatario
 * @param {string} step - Step del formulario (opcional, para form_incomplete)
 * @param {Object} metadata - Datos adicionales (fechas, URLs, mensaje custom, etc.)
 * @returns {string|null} - Mensaje formateado o null si el tipo no existe
 */
export function generateContextualMessage(type, name, step, metadata = {}) {
  const firstName = name.split(' ')[0]; // Solo el primer nombre

  switch (type) {
    case 'application_received':
      return generateApplicationReceivedMessage(firstName, metadata);

    case 'form_incomplete':
      return generateFormIncompleteMessage(firstName, step, metadata);

    case 'capacitation_no_show':
      return generateCapacitationNoShowMessage(firstName, metadata);

    case 'custom':
      return metadata.customMessage || null;

    default:
      console.error(`Tipo de mensaje no reconocido: ${type}`);
      return null;
  }
}

// ===== TEMPLATES DE MENSAJES ACTIVOS =====

/**
 * Template: Postulación Recibida
 */
function generateApplicationReceivedMessage(firstName, metadata) {
  return `¡Hola ${firstName}! 👋

¡Recibimos tu postulación para ser parte del equipo de Monchis Drivers! ✅

Nuestro equipo está revisando tu información y nos comunicaremos con vos en las próximas horas.

Si tenés alguna consulta, no dudes en responder este mensaje.

¡Gracias por querer sumarte! 🚗`;
}

/**
 * Template: Formulario Incompleto (según step)
 */
function generateFormIncompleteMessage(firstName, step, metadata) {
  const formUrl = 'https://monchis-drivers.vercel.app/';
  
  const baseIntro = `¡Hola ${firstName}! 👋

Vimos que comenzaste tu postulación en Monchis Drivers pero quedó incompleta. 🚗

`;

  switch (step) {
    case 'personal_info':
      return baseIntro + 
        `¡No te preocupes! Solo te va a tomar 2 minutos completarla.\n\n` +
        `Continuá acá: ${formUrl}\n\n` +
        `Si tenés alguna consulta, no dudes en escribirnos.`;

    case 'documents':
      return baseIntro +
        `Para avanzar necesitamos que subas:\n\n` +
        `📄 *Documentación requerida:*\n` +
        `• Cédula (frente y dorso)\n` +
        `• Certificado de Antecedentes Penales\n\n` +
        `El certificado lo podés gestionar acá:\n` +
        `https://www.paraguay.gov.py/carpeta-ciudadana\n\n` +
        `💡 *Tip:* El certificado tiene vigencia de 6 meses, así que si ya tenés uno reciente, ¡podés usarlo!\n\n` +
        `Continuá tu postulación acá:\n${formUrl}\n\n` +
        `Si tenés alguna consulta, no dudes en escribirnos.`;

    case 'bank_info':
      return baseIntro +
        `Solo nos falta tu información bancaria para poder procesarte los pagos.\n\n` +
        `💰 *Importante:* Es necesario tener una cuenta en *ueno bank* para ser repartidor. Es el banco con el que trabajamos para realizar los pagos de comisiones.\n\n` +
        `Si aún no tenés cuenta, ¡es rápido y fácil abrirla!\n\n` +
        `Continuá tu postulación acá:\n${formUrl}\n\n` +
        `Si tenés alguna consulta, no dudes en escribirnos.`;

    case 'equipment_payment':
      return baseIntro.replace('quedó incompleta', 'está casi completa') +
        `¡Estás a un paso de completar tu postulación! 🚗\n\n` +
        `Solo falta confirmar el pago inicial del equipo (Gs. 100.000) que incluye mochila térmica, remera y porta vasos.\n\n` +
        `💵 *Podés abonar:*\n` +
        `• Por transferencia antes de la capacitación\n` +
        `• Presencialmente el día de la capacitación\n\n` +
        `Continuá acá para finalizar:\n${formUrl}\n\n` +
        `Si tenés alguna consulta, no dudes en escribirnos.`;

    /* ===== STEPS COMENTADOS - PARA FUTURO =====
    
    case 'vehicle_info':
      return baseIntro +
        `Te falta completar los datos de tu vehículo.\n\n` +
        `🚗 Es el último paso antes de enviarnos tu postulación.\n\n` +
        `Continuá aquí: ${formUrl}`;

    case 'availability':
      return baseIntro +
        `Nos falta saber tu disponibilidad horaria.\n\n` +
        `⏰ Este dato es importante para asignarte viajes.\n\n` +
        `Completalo acá: ${formUrl}`;

    case 'references':
      return baseIntro +
        `Solo nos faltan tus referencias laborales.\n\n` +
        `👥 Es el último dato que necesitamos para evaluar tu postulación.\n\n` +
        `Completalo acá: ${formUrl}`;
    
    ===== FIN STEPS COMENTADOS ===== */

    default:
      return baseIntro +
        `¿Tuviste algún problema para completarlo? Estamos acá para ayudarte.\n\n` +
        `Continuá tu postulación: ${formUrl}\n\n` +
        `Si necesitás ayuda, respondé este mensaje.`;
  }
}

/**
 * Template: No Asistió a Capacitación
 */
function generateCapacitationNoShowMessage(firstName, metadata) {
  const { 
    missedEventTitle = 'la capacitación',
    missedEventDate = '',
    availableEvents = []
  } = metadata;

  let message = `¡Hola ${firstName}! 👋

Queríamos saber si hubo algún inconveniente o motivo por el cual no pudiste asistir a ${missedEventTitle}${missedEventDate ? ` del ${missedEventDate}` : ''}.

Si seguís interesado en asistir a una nueva capacitación, podemos ayudarte a reprogramar una nueva fecha.

¡Gracias y saludos!
Equipo Monchis💪🍔`;

  // Agregar capacitaciones disponibles si hay
  if (availableEvents && availableEvents.length > 0) {
    message += `\n\n📅 *Las siguientes capacitaciones disponibles:*\n`;
    
    availableEvents.forEach((event, index) => {
      message += `\n${index + 1}. ${event.date}`;
      if (event.location && event.location !== 'Por confirmar') {
        message += `\n   📍 ${event.location}`;
      }
    });

    message += `\n\n💬 *¿Cuál de estas fechas te vendría bien?* Respondé este mensaje con el número de la capacitación que prefieras.`;
  } else {
    message += `\n\nPor favor, respondenos si querés que te ayudemos a encontrar una nueva fecha.`;
  }

  message += `\n\nQuedamos atentos a tu respuesta.`;
  message += `\n¡Gracias y saludos!`;
  message += `\nEquipo Monchis💪🍔`;

  return message;
}


// ===== TEMPLATES COMENTADOS - PARA FUTURO =====

/* 
function generateOnboardingReminder(firstName, metadata) {
  const { date, time, location, meetingUrl } = metadata;

  let message = `¡Hola ${firstName}! 👋

Te recordamos que tenés tu onboarding de Monchis Drivers programado.

📅 *Detalles de la sesión:*`;

  if (date) message += `\n• Fecha: ${date}`;
  if (time) message += `\n• Hora: ${time}`;
  if (location) message += `\n• Lugar: ${location}`;
  if (meetingUrl) message += `\n• Link de reunión: ${meetingUrl}`;

  message += `\n\n*Por favor, confirmá tu asistencia respondiendo este mensaje.*`;
  message += `\n\n¡Te esperamos! 🚗`;

  return message;
}

function generateWelcomeMessage(firstName, metadata) {
  return `¡Bienvenido/a ${firstName}! 🎉

Gracias por tu interés en formar parte de Monchis Drivers.

Estamos revisando tu postulación y nos pondremos en contacto pronto.

Si tenés alguna consulta, no dudes en escribirnos.

¡Saludos! 🚗`;
}

function generateCapacitationReminder(firstName, metadata) {
  const { 
    capacitationName, 
    date, 
    time, 
    location, 
    duration,
    meetingUrl 
  } = metadata;

  let message = `¡Hola ${firstName}! 📚

Te recordamos tu capacitación programada:`;

  if (capacitationName) message += `\n\n📖 *${capacitationName}*`;
  if (date) message += `\n📅 Fecha: ${date}`;
  if (time) message += `\n⏰ Hora: ${time}`;
  if (duration) message += `\n⏱️ Duración: ${duration}`;
  if (location) message += `\n📍 Lugar: ${location}`;
  if (meetingUrl) message += `\n🔗 Link: ${meetingUrl}`;

  message += `\n\n*Por favor confirmá tu asistencia.*`;
  message += `\n\n¡Nos vemos! 🚗`;

  return message;
}
*/

// ===== HELPER: Validar que exista un tipo de mensaje =====

/**
 * Verifica si un tipo de mensaje existe
 * @param {string} type - Tipo de mensaje
 * @returns {boolean}
 */
export function isValidMessageType(type) {
  const validTypes = [
    'application_received',
    'form_incomplete',
    'custom'
    // 'onboarding_reminder', // COMENTADO
    // 'welcome', // COMENTADO
    // 'capacitation_reminder' // COMENTADO
  ];
  
  return validTypes.includes(type);
}

/**
 * Obtiene la lista de tipos de mensajes válidos
 * @returns {string[]}
 */
export function getValidMessageTypes() {
  return [
    'application_received',
    'form_incomplete',
    'custom'
  ];
}

/**
 * Obtiene información sobre un tipo de mensaje
 * @param {string} type - Tipo de mensaje
 * @returns {Object} - Información del tipo de mensaje
 */
export function getMessageTypeInfo(type) {
  const info = {
    application_received: {
      name: 'Postulación Recibida',
      requiredMetadata: [],
      optionalMetadata: []
    },
    form_incomplete: {
      name: 'Formulario Incompleto',
      requiredParams: ['step'],
      optionalMetadata: [],
      validSteps: [
        'personal_info', 
        'documents', 
        'bank_info', 
        'equipment_payment'
        // 'vehicle_info', // COMENTADO
        // 'availability', // COMENTADO
        // 'references' // COMENTADO
      ]
    },
    custom: {
      name: 'Mensaje Personalizado',
      requiredMetadata: ['customMessage'],
      optionalMetadata: []
    }
    /* COMENTADOS - PARA FUTURO
    onboarding_reminder: {
      name: 'Recordatorio de Onboarding',
      requiredMetadata: ['date', 'time'],
      optionalMetadata: ['location', 'meetingUrl']
    },
    welcome: {
      name: 'Mensaje de Bienvenida',
      requiredMetadata: [],
      optionalMetadata: []
    },
    capacitation_reminder: {
      name: 'Recordatorio de Capacitación',
      requiredMetadata: ['capacitationName', 'date', 'time'],
      optionalMetadata: ['location', 'duration', 'meetingUrl']
    }
    */
  };

  return info[type] || null;
}