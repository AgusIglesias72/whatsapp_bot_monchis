import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initializeWhatsApp, getClient, isClientReady, formatPhoneNumber } from './whatsapp.js';
import { handleIncomingMessage } from './messageHandler.js';
import { generateContextualMessage, isValidMessageType, getValidMessageTypes, getMessageTypeInfo } from './messageTemplates.js';

// Cargar variables de entorno
dotenv.config();

const app = express();

// CORS Configuration
const corsOptions = {
  origin: [
    'https://monchis-drivers.vercel.app',
    'http://localhost:3000',
    'http://localhost:3001'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

const PORT = process.env.PORT || 3000;
const VERCEL_WEBHOOK_URL = process.env.VERCEL_WEBHOOK_URL;
const API_KEY = process.env.API_KEY;

// Middleware para verificar API Key
function verifyApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  
  if (!API_KEY) {
    // Si no hay API_KEY configurada, permitir (solo para desarrollo)
    return next();
  }
  
  if (apiKey !== API_KEY) {
    return res.status(401).json({ error: 'API Key inválida o faltante' });
  }
  
  next();
}

// ===== VARIABLES GLOBALES PARA QR =====
let currentQRCode = null;
let qrTimestamp = null;

// ===== INICIALIZACIÓN DE WHATSAPP =====
console.log('🚀 Iniciando servidor del bot de WhatsApp...\n');

// Inicializar cliente de WhatsApp con handler de mensajes
const whatsappClient = initializeWhatsApp((message) => {
  handleIncomingMessage(message, VERCEL_WEBHOOK_URL);
});

// Capturar el QR cuando se genere (para acceso desde frontend)
const clientInstance = getClient();
if (clientInstance) {
  clientInstance.on('qr', (qr) => {
    currentQRCode = qr;
    qrTimestamp = new Date().toISOString();
    console.log('📱 QR Code generado y disponible en /qr-status');
  });

  clientInstance.on('ready', () => {
    currentQRCode = null;
    qrTimestamp = null;
    console.log('✅ QR limpiado - WhatsApp conectado');
  });

  clientInstance.on('authenticated', () => {
    currentQRCode = null;
    qrTimestamp = null;
  });
}

// ===== RUTAS API =====

/**
 * GET /health
 * Health check del servidor y estado de WhatsApp
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    whatsappReady: isClientReady(),
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

/**
 * GET /qr-status
 * Obtiene el estado de conexión de WhatsApp y QR code si está disponible
 * Útil para mostrar el QR en el frontend
 */
app.get('/qr-status', (req, res) => {
  if (isClientReady()) {
    return res.json({
      status: 'connected',
      connected: true,
      qr: null,
      message: 'WhatsApp ya está conectado',
      timestamp: new Date().toISOString()
    });
  }

  if (currentQRCode) {
    return res.json({
      status: 'qr_available',
      connected: false,
      qr: currentQRCode,
      generatedAt: qrTimestamp,
      message: 'Escanea este QR para conectar WhatsApp',
      timestamp: new Date().toISOString()
    });
  }

  return res.json({
    status: 'initializing',
    connected: false,
    qr: null,
    message: 'Inicializando WhatsApp, espera unos segundos...',
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /
 * Página de inicio simple
 */
app.get('/', (req, res) => {
  res.json({
    service: 'WhatsApp Bot API - Monchis Drivers',
    version: '1.0.0',
    status: isClientReady() ? 'connected' : 'disconnected',
    endpoints: {
      health: 'GET /health',
      qrStatus: 'GET /qr-status',
      sendMessage: 'POST /send-message',
      sendContextualMessage: 'POST /send-contextual-message',
      messageTypes: 'GET /message-types',
      sendBulk: 'POST /send-bulk',
      sendWithMedia: 'POST /send-with-media'
    }
  });
});

/**
 * POST /send-message
 * Envía un mensaje individual de WhatsApp
 * Body: { phone, message, type? }
 */
app.post('/send-message', verifyApiKey, async (req, res) => {
  try {
    const { phone, message, type } = req.body;

    // Validaciones
    if (!phone || !message) {
      return res.status(400).json({
        error: 'Parámetros faltantes',
        required: ['phone', 'message'],
        received: { phone: !!phone, message: !!message }
      });
    }

    if (!isClientReady()) {
      return res.status(503).json({
        error: 'WhatsApp no está conectado todavía',
        message: 'Espera unos segundos e intenta nuevamente'
      });
    }

    // Obtener cliente y formatear número
    const client = getClient();
    const chatId = formatPhoneNumber(phone);

    console.log(`📤 Enviando mensaje a ${phone} (${chatId})`);
    console.log(`📝 Mensaje: ${message}`);
    if (type) console.log(`🏷️  Tipo: ${type}`);

    // Enviar mensaje
    await client.sendMessage(chatId, message);

    console.log(`✅ Mensaje enviado exitosamente a ${phone}`);

    res.json({
      success: true,
      phone: phone,
      chatId: chatId,
      type: type || 'general',
      sentAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error enviando mensaje:', error);

    // Errores específicos de WhatsApp
    if (error.message.includes('phone number is not registered')) {
      return res.status(400).json({
        error: 'Número no registrado en WhatsApp',
        phone: req.body.phone
      });
    }

    res.status(500).json({
      error: 'Error al enviar mensaje',
      details: error.message
    });
  }
});

/**
 * POST /send-contextual-message
 * Envía mensajes contextuales basados en templates predefinidos
 * Body: { phone, name, type, step?, metadata? }
 */
app.post('/send-contextual-message', verifyApiKey, async (req, res) => {
  try {
    const { 
      phone,           // Número del destinatario
      name,            // Nombre completo del postulante
      type,            // Tipo de mensaje (ver messageTemplates.js)
      step,            // Step del formulario (opcional, requerido para form_incomplete)
      metadata         // Datos adicionales (opcional)
    } = req.body;

    // Validaciones básicas
    if (!phone || !name || !type) {
      return res.status(400).json({
        error: 'Parámetros faltantes',
        required: ['phone', 'name', 'type'],
        received: { 
          phone: !!phone, 
          name: !!name, 
          type: !!type 
        }
      });
    }

    // Validar tipo de mensaje
    if (!isValidMessageType(type)) {
      return res.status(400).json({
        error: `Tipo de mensaje no válido: ${type}`,
        validTypes: getValidMessageTypes()
      });
    }

    // Validar step para form_incomplete
    if (type === 'form_incomplete' && !step) {
      return res.status(400).json({
        error: 'El parámetro "step" es requerido para mensajes de tipo form_incomplete',
        validSteps: ['personal_info', 'documents', 'vehicle_info', 'bank_info', 'availability', 'references']
      });
    }

    // Verificar conexión de WhatsApp
    if (!isClientReady()) {
      return res.status(503).json({
        error: 'WhatsApp no está conectado todavía',
        message: 'Espera unos segundos e intenta nuevamente'
      });
    }

    // Generar mensaje contextual
    const message = generateContextualMessage(type, name, step, metadata || {});
    
    if (!message) {
      return res.status(500).json({
        error: 'No se pudo generar el mensaje',
        type: type,
        step: step
      });
    }

    // Enviar mensaje
    const client = getClient();
    const chatId = formatPhoneNumber(phone);
    
    console.log(`📤 Enviando mensaje contextual:`);
    console.log(`   👤 Destinatario: ${name} (${phone})`);
    console.log(`   📋 Tipo: ${type}`);
    if (step) console.log(`   📍 Step: ${step}`);
    
    const startTime = Date.now();
    await client.sendMessage(chatId, message);
    const endTime = Date.now();

    console.log(`✅ Mensaje enviado exitosamente en ${endTime - startTime}ms`);

    // Respuesta con metadata completa para guardar en PostgreSQL
    res.json({
      success: true,
      data: {
        phone: phone,
        chatId: chatId,
        name: name,
        type: type,
        step: step || null,
        message: message,
        messageLength: message.length,
        sentAt: new Date().toISOString(),
        responseTimeMs: endTime - startTime,
        metadata: metadata || null
      }
    });

  } catch (error) {
    console.error('❌ Error enviando mensaje contextual:', error);
    
    // Errores específicos de WhatsApp
    if (error.message.includes('phone number is not registered')) {
      return res.status(400).json({
        error: 'Número no registrado en WhatsApp',
        phone: req.body.phone,
        type: req.body.type
      });
    }

    res.status(500).json({
      error: 'Error al enviar mensaje',
      details: error.message,
      phone: req.body.phone,
      type: req.body.type
    });
  }
});

/**
 * GET /message-types
 * Obtiene información sobre los tipos de mensajes disponibles
 */
app.get('/message-types', verifyApiKey, (req, res) => {
  const types = getValidMessageTypes();
  const typesInfo = types.map(type => ({
    type: type,
    info: getMessageTypeInfo(type)
  }));

  res.json({
    availableTypes: types,
    details: typesInfo
  });
});

/**
 * POST /send-bulk
 * Envía múltiples mensajes (con delay para evitar ban)
 * Body: { messages: [{ phone, message, type? }] }
 */
app.post('/send-bulk', verifyApiKey, async (req, res) => {
  try {
    const { messages } = req.body;

    // Validaciones
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({
        error: 'Se requiere un array de messages',
        example: {
          messages: [
            { phone: '5491112345678', message: 'Hola!' },
            { phone: '5491198765432', message: 'Recordatorio...' }
          ]
        }
      });
    }

    if (messages.length === 0) {
      return res.status(400).json({
        error: 'El array de messages está vacío'
      });
    }

    if (!isClientReady()) {
      return res.status(503).json({
        error: 'WhatsApp no está conectado todavía'
      });
    }

    const client = getClient();
    const results = [];

    console.log(`📤 Enviando ${messages.length} mensajes en lote...`);

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];

      try {
        if (!msg.phone || !msg.message) {
          results.push({
            phone: msg.phone || 'unknown',
            success: false,
            error: 'Faltan parámetros phone o message'
          });
          continue;
        }

        const chatId = formatPhoneNumber(msg.phone);
        await client.sendMessage(chatId, msg.message);

        results.push({
          phone: msg.phone,
          success: true,
          sentAt: new Date().toISOString()
        });

        console.log(`✅ [${i + 1}/${messages.length}] Enviado a ${msg.phone}`);

        // Delay entre mensajes para evitar ban (2-3 segundos)
        if (i < messages.length - 1) {
          const delay = 2000 + Math.random() * 1000; // 2-3 segundos
          await new Promise(resolve => setTimeout(resolve, delay));
        }

      } catch (error) {
        results.push({
          phone: msg.phone,
          success: false,
          error: error.message
        });

        console.error(`❌ [${i + 1}/${messages.length}] Error enviando a ${msg.phone}:`, error.message);
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    console.log(`📊 Resumen: ${successCount} exitosos, ${failCount} fallidos`);

    res.json({
      summary: {
        total: messages.length,
        successful: successCount,
        failed: failCount
      },
      results: results
    });

  } catch (error) {
    console.error('❌ Error en envío masivo:', error);
    res.status(500).json({
      error: 'Error en envío masivo',
      details: error.message
    });
  }
});

/**
 * POST /send-with-media
 * Envía un mensaje con imagen o archivo adjunto
 * Body: { phone, message, mediaUrl }
 */
app.post('/send-with-media', verifyApiKey, async (req, res) => {
  try {
    const { phone, message, mediaUrl } = req.body;

    if (!phone || !mediaUrl) {
      return res.status(400).json({
        error: 'Parámetros faltantes: phone y mediaUrl requeridos'
      });
    }

    if (!isClientReady()) {
      return res.status(503).json({
        error: 'WhatsApp no está conectado'
      });
    }

    const client = getClient();
    const chatId = formatPhoneNumber(phone);

    // Importar MessageMedia dinámicamente
    const { MessageMedia } = await import('whatsapp-web.js');
    const media = await MessageMedia.fromUrl(mediaUrl);

    await client.sendMessage(chatId, media, { caption: message || '' });

    console.log(`✅ Mensaje con media enviado a ${phone}`);

    res.json({
      success: true,
      phone: phone,
      mediaUrl: mediaUrl,
      sentAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error enviando mensaje con media:', error);
    res.status(500).json({
      error: 'Error al enviar mensaje con media',
      details: error.message
    });
  }
});

// ===== MANEJO DE ERRORES =====
app.use((err, req, res, next) => {
  console.error('❌ Error no manejado:', err);
  res.status(500).json({
    error: 'Error interno del servidor',
    message: err.message
  });
});

// ===== INICIAR SERVIDOR =====
app.listen(PORT, () => {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
  console.log(`📡 Webhook: ${VERCEL_WEBHOOK_URL || 'No configurado'}`);
  console.log(`🔐 API Key: ${API_KEY ? 'Configurada ✅' : 'No configurada ⚠️'}`);
  console.log(`${'='.repeat(50)}\n`);
});

// Manejo de señales de terminación
process.on('SIGINT', async () => {
  console.log('\n⚠️  Señal SIGINT recibida, cerrando servidor...');
  const client = getClient();
  if (client) {
    await client.destroy();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n⚠️  Señal SIGTERM recibida, cerrando servidor...');
  const client = getClient();
  if (client) {
    await client.destroy();
  }
  process.exit(0);
});