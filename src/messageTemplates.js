/**
 * Templates de mensajes de WhatsApp para Monchis Drivers
 * Centraliza todos los mensajes que envía el bot
 */

/**
 * Genera mensajes contextuales según el tipo y parámetros
 * @param {string} type - Tipo de mensaje ('onboarding_reminder' | 'form_incomplete')
 * @param {string} name - Nombre completo del destinatario
 * @param {string} step - Step del formulario (opcional, para form_incomplete)
 * @param {Object} metadata - Datos adicionales (fechas, URLs, etc.)
 * @returns {string|null} - Mensaje formateado o null si el tipo no existe
 */
export function generateContextualMessage(type, name, step, metadata = {}) {
    const firstName = name.split(' ')[0]; // Solo el primer nombre
  
    switch (type) {
      case 'onboarding_reminder':
        return generateOnboardingReminder(firstName, metadata);
  
      case 'form_incomplete':
        return generateFormIncompleteMessage(firstName, step, metadata);
  
      case 'welcome':
        return generateWelcomeMessage(firstName, metadata);
  
      case 'application_received':
        return generateApplicationReceivedMessage(firstName, metadata);
  
      case 'capacitation_reminder':
        return generateCapacitationReminder(firstName, metadata);
  
      default:
        console.error(`Tipo de mensaje no reconocido: ${type}`);
        return null;
    }
  }
  
  // ===== TEMPLATES DE MENSAJES =====
  
  /**
   * Template: Recordatorio de Onboarding
   */
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
  
  /**
   * Template: Formulario Incompleto (según step)
   */
  function generateFormIncompleteMessage(firstName, step, metadata) {
    const { formUrl = 'https://monchis.com/apply' } = metadata;
    
    const baseMessage = `Hola ${firstName}, notamos que comenzaste tu postulación en Monchis Drivers pero no la completaste. 🚗\n\n`;
  
    switch (step) {
      case 'personal_info':
        return baseMessage + 
          `Te falta completar tus datos personales.\n\n` +
          `Es muy rápido, solo te tomará 2 minutos. ¡Continuá tu postulación aquí! 👇\n\n` +
          `${formUrl}`;
  
      case 'documents':
        return baseMessage +
          `¡Estás a un paso de terminar! Solo falta que subas tu documentación.\n\n` +
          `📄 *Necesitamos:*\n` +
          `• DNI (frente y dorso)\n` +
          `• Registro de conducir\n` +
          `• Foto de perfil\n\n` +
          `Continuá aquí: ${formUrl}`;
  
      case 'vehicle_info':
        return baseMessage +
          `Te falta completar los datos de tu vehículo.\n\n` +
          `🚗 Es el último paso antes de enviarnos tu postulación.\n\n` +
          `Continuá aquí: ${formUrl}`;
  
      case 'bank_info':
        return baseMessage +
          `Solo falta tu información bancaria para poder procesarte los pagos.\n\n` +
          `💰 Una vez que la completes, revisaremos tu postulación.\n\n` +
          `Continuá aquí: ${formUrl}`;
  
      case 'availability':
        return baseMessage +
          `Nos falta saber tu disponibilidad horaria.\n\n` +
          `⏰ Este dato es importante para asignarte viajes.\n\n` +
          `Completalo acá: ${formUrl}`;
  
      case 'references':
        return baseMessage +
          `Solo nos faltan tus referencias laborales.\n\n` +
          `👥 Es el último dato que necesitamos para evaluar tu postulación.\n\n` +
          `Completalo acá: ${formUrl}`;
  
      default:
        return baseMessage +
          `¿Tuviste algún problema para completarlo? Estamos acá para ayudarte.\n\n` +
          `Continuá tu postulación: ${formUrl}\n\n` +
          `Si necesitás ayuda, respondé este mensaje.`;
    }
  }
  
  /**
   * Template: Mensaje de Bienvenida
   */
  function generateWelcomeMessage(firstName, metadata) {
    return `¡Bienvenido/a ${firstName}! 🎉
  
  Gracias por tu interés en formar parte de Monchis Drivers.
  
  Estamos revisando tu postulación y nos pondremos en contacto pronto.
  
  Si tenés alguna consulta, no dudes en escribirnos.
  
  ¡Saludos! 🚗`;
  }
  
  /**
   * Template: Postulación Recibida
   */
  function generateApplicationReceivedMessage(firstName, metadata) {
    const { applicationId, estimatedResponseTime = '48 horas' } = metadata;
  
    let message = `¡Hola ${firstName}! ✅
  
  Recibimos tu postulación correctamente.`;
  
    if (applicationId) {
      message += `\n\n📋 *Número de postulación:* ${applicationId}`;
    }
  
    message += `\n\n⏱️ Tiempo estimado de respuesta: ${estimatedResponseTime}`;
    message += `\n\nNuestro equipo la revisará y te contactaremos a la brevedad.`;
    message += `\n\n¡Gracias por tu paciencia! 🚗`;
  
    return message;
  }
  
  /**
   * Template: Recordatorio de Capacitación
   */
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
  
  // ===== HELPER: Validar que exista un tipo de mensaje =====
  
  /**
   * Verifica si un tipo de mensaje existe
   * @param {string} type - Tipo de mensaje
   * @returns {boolean}
   */
  export function isValidMessageType(type) {
    const validTypes = [
      'onboarding_reminder',
      'form_incomplete',
      'welcome',
      'application_received',
      'capacitation_reminder'
    ];
    
    return validTypes.includes(type);
  }
  
  /**
   * Obtiene la lista de tipos de mensajes válidos
   * @returns {string[]}
   */
  export function getValidMessageTypes() {
    return [
      'onboarding_reminder',
      'form_incomplete',
      'welcome',
      'application_received',
      'capacitation_reminder'
    ];
  }
  
  /**
   * Obtiene información sobre un tipo de mensaje
   * @param {string} type - Tipo de mensaje
   * @returns {Object} - Información del tipo de mensaje
   */
  export function getMessageTypeInfo(type) {
    const info = {
      onboarding_reminder: {
        name: 'Recordatorio de Onboarding',
        requiredMetadata: ['date', 'time'],
        optionalMetadata: ['location', 'meetingUrl']
      },
      form_incomplete: {
        name: 'Formulario Incompleto',
        requiredParams: ['step'],
        optionalMetadata: ['formUrl'],
        validSteps: ['personal_info', 'documents', 'vehicle_info', 'bank_info', 'availability', 'references']
      },
      welcome: {
        name: 'Mensaje de Bienvenida',
        requiredMetadata: [],
        optionalMetadata: []
      },
      application_received: {
        name: 'Postulación Recibida',
        requiredMetadata: [],
        optionalMetadata: ['applicationId', 'estimatedResponseTime']
      },
      capacitation_reminder: {
        name: 'Recordatorio de Capacitación',
        requiredMetadata: ['capacitationName', 'date', 'time'],
        optionalMetadata: ['location', 'duration', 'meetingUrl']
      }
    };
  
    return info[type] || null;
  }