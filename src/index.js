// server.js (Express - WhatsApp Bot Backend)
import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import pkg from 'whatsapp-web.js';
const { MessageMedia } = pkg;
import {
  initializeClient,
  getClient,
  isClientReady,
  isSessionSaved,
  getClientQR,
  getAllClients,
  verifyPhoneNumber,
  closeClient,
  closeAllClients
} from './whatsapp.js';
import { handleIncomingMessage } from './messageHandler.js';
import { generateContextualMessage, isValidMessageType, getValidMessageTypes, getMessageTypeInfo } from './messageTemplates.js';

// Cargar variables de entorno
dotenv.config();

const app = express();

const corsOptions = {
  origin: [
    'https://monchis-drivers.vercel.app',
    'https://driversmonchis.vercel.app',
    'http://localhost:3000',
    'http://localhost:3001'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json());

const PORT = process.env.PORT || 3000;
const VERCEL_WEBHOOK_URL = process.env.VERCEL_WEBHOOK_URL;
const API_KEY = process.env.API_KEY;

// Definir los bots que quieres usar
const BOTS_CONFIG = [
  { id: 'bot-adquisicion-prod', name: 'Bot Adquisiciones' },
  { id: 'bot-reactivacion-prod', name: 'Bot Reactivacion' }
];

// Middleware para verificar API Key
function verifyApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  
  if (!API_KEY) {
    return next();
  }
  
  if (apiKey !== API_KEY) {
    return res.status(401).json({ error: 'API Key inválida o faltante' });
  }
  
  next();
}

// ===== INICIALIZACIÓN DE BOTS =====
console.log('🚀 Iniciando servidor multi-bot de WhatsApp...\n');

const initBots = async () => {
  try {
    for (const botConfig of BOTS_CONFIG) {
      console.log(`🤖 Inicializando ${botConfig.name} (${botConfig.id})...`);
      
      await initializeClient(botConfig.id, (message, clientId) => {
        handleIncomingMessage(message, VERCEL_WEBHOOK_URL);
      });
      
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log('\n✅ Todos los bots inicializados correctamente\n');
  } catch (error) {
    console.error('❌ Error fatal inicializando bots:', error);
    process.exit(1);
  }
};

initBots();

// ===== RUTAS API =====

/**
 * GET /health
 */
app.get('/health', (req, res) => {
  const clients = getAllClients();

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    bots: clients
  });
});

/**
 * GET /memory
 * Monitoreo detallado de memoria
 */
app.get('/memory', verifyApiKey, (req, res) => {
  const memoryUsage = process.memoryUsage();
  const clients = getAllClients();

  // Convertir bytes a MB
  const formatMB = (bytes) => (bytes / 1024 / 1024).toFixed(2);

  res.json({
    timestamp: new Date().toISOString(),
    uptime: {
      seconds: process.uptime(),
      formatted: `${Math.floor(process.uptime() / 3600)}h ${Math.floor((process.uptime() % 3600) / 60)}m`
    },
    memory: {
      rss: `${formatMB(memoryUsage.rss)} MB`,
      heapTotal: `${formatMB(memoryUsage.heapTotal)} MB`,
      heapUsed: `${formatMB(memoryUsage.heapUsed)} MB`,
      external: `${formatMB(memoryUsage.external)} MB`,
      arrayBuffers: `${formatMB(memoryUsage.arrayBuffers)} MB`,
      heapUsagePercent: `${((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100).toFixed(1)}%`
    },
    bots: {
      total: clients.length,
      ready: clients.filter(c => c.ready).length,
      withSession: clients.filter(c => c.sessionSaved).length,
      reconnecting: clients.filter(c => c.reconnectionAttempts > 0).length
    },
    limits: {
      maxOldSpaceSize: '512 MB (configurado en package.json)',
      gcEnabled: !!global.gc
    },
    recommendations: getMemoryRecommendations(memoryUsage)
  });
});

/**
 * Helper: Genera recomendaciones basadas en uso de memoria
 */
function getMemoryRecommendations(memoryUsage) {
  const recommendations = [];
  const heapUsedMB = memoryUsage.heapUsed / 1024 / 1024;
  const heapTotalMB = memoryUsage.heapTotal / 1024 / 1024;
  const heapPercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;

  if (heapPercent > 90) {
    recommendations.push({
      level: 'critical',
      message: 'Uso de heap crítico (>90%). Considerar reiniciar el servicio.'
    });
  } else if (heapPercent > 75) {
    recommendations.push({
      level: 'warning',
      message: 'Uso de heap alto (>75%). Monitorear de cerca.'
    });
  }

  if (heapUsedMB > 400) {
    recommendations.push({
      level: 'warning',
      message: 'Heap usado supera 400MB. Verificar posibles fugas de memoria.'
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      level: 'ok',
      message: 'Uso de memoria dentro de rangos normales.'
    });
  }

  return recommendations;
}

/**
 * GET /bots
 */
app.get('/bots', verifyApiKey, (req, res) => {
  const clients = getAllClients();
  
  const botsWithInfo = clients.map(client => {
    const whatsappClient = getClient(client.clientId);
    let connectionInfo = null;
    
    if (whatsappClient && client.ready) {
      try {
        connectionInfo = {
          phoneNumber: whatsappClient.info?.wid?.user || 'Desconocido',
          displayName: whatsappClient.info?.pushname || 'Sin nombre',
          platform: whatsappClient.info?.platform || 'unknown'
        };
      } catch (error) {}
    }
    
    return {
      ...client,
      connectionInfo,
      qrAvailable: client.hasQR
    };
  });
  
  res.json({
    total: botsWithInfo.length,
    bots: botsWithInfo,
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /qr/:botId
 */
app.get('/qr/:botId', verifyApiKey, (req, res) => {
  const { botId } = req.params;
  
  if (isClientReady(botId)) {
    const client = getClient(botId);
    let connectionInfo = null;
    
    try {
      if (client && client.info) {
        connectionInfo = {
          phoneNumber: client.info.wid.user,
          displayName: client.info.pushname || 'Sin nombre'
        };
      }
    } catch (error) {}
    
    return res.json({
      botId,
      status: 'connected',
      connected: true,
      sessionSaved: isSessionSaved(botId),
      qr: null,
      message: 'Bot conectado',
      connectionInfo
    });
  }
  
  const qrData = getClientQR(botId);
  
  if (qrData) {
    return res.json({
      botId,
      status: 'qr_available',
      connected: false,
      sessionSaved: false,
      qr: qrData.qr,
      generatedAt: qrData.timestamp,
      message: 'Escanea el QR para conectar'
    });
  }
  
  return res.json({
    botId,
    status: 'initializing',
    connected: false,
    sessionSaved: false,
    qr: null,
    message: 'Bot inicializando...'
  });
});

/**
 * POST /send-message
 */
app.post('/send-message', verifyApiKey, async (req, res) => {
  try {
    const { phone, message, botId = 'bot-adquisicion-prod' } = req.body;

    if (!phone || !message) {
      return res.status(400).json({
        error: 'Parámetros faltantes',
        required: ['phone', 'message'],
        optional: ['botId (default: bot-adquisicion-prod)']
      });
    }

    if (!isClientReady(botId)) {
      return res.status(503).json({
        error: `Bot ${botId} no está conectado`,
        availableBots: getAllClients().filter(c => c.ready).map(c => c.clientId)
      });
    }

    const client = getClient(botId);

    console.log(`📤 [${botId}] Verificando y enviando mensaje a ${phone}`);

    // Verificar que el número existe en WhatsApp y obtener su ID correcto (LID compatible)
    const verifiedChatId = await verifyPhoneNumber(client, phone);

    if (!verifiedChatId) {
      return res.status(404).json({
        error: 'Número no encontrado en WhatsApp',
        phone: phone,
        details: 'El número no está registrado en WhatsApp o el formato es incorrecto'
      });
    }

    await client.sendMessage(verifiedChatId, message);

    console.log(`✅ [${botId}] Mensaje enviado exitosamente a ${verifiedChatId}`);

    res.json({
      success: true,
      botId: botId,
      phone: phone,
      chatId: verifiedChatId,
      sentAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error enviando mensaje:', error);
    res.status(500).json({
      error: 'Error al enviar mensaje',
      details: error.message
    });
  }
});

/**
 * POST /send-contextual-message
 */
app.post('/send-contextual-message', verifyApiKey, async (req, res) => {
  try {
    const { phone, name, type, step, metadata, botId = 'bot-adquisicion-prod' } = req.body;

    if (!phone || !name || !type) {
      return res.status(400).json({
        error: 'Parámetros faltantes',
        required: ['phone', 'name', 'type'],
        optional: ['step', 'metadata', 'botId (default: bot-adquisicion-prod)']
      });
    }

    if (!isValidMessageType(type)) {
      return res.status(400).json({
        error: `Tipo de mensaje no válido: ${type}`,
        validTypes: getValidMessageTypes()
      });
    }

    // Validación específica para document_rejected
    if (type === 'document_rejected') {
      if (!metadata || !metadata.documentTypeName || !metadata.rejectionReason) {
        return res.status(400).json({
          error: 'Parámetros faltantes para document_rejected',
          required: ['metadata.documentTypeName', 'metadata.rejectionReason'],
          optional: ['metadata.documentType', 'metadata.rejectedAt', 'metadata.documentId', 'metadata.triggeredBy', 'metadata.adminId']
        });
      }

      // Validar que sea CRIMINAL_RECORD si se proporciona documentType
      if (metadata.documentType && metadata.documentType !== 'CRIMINAL_RECORD') {
        return res.status(400).json({
          error: 'Tipo de documento no soportado',
          message: 'Solo se acepta documentType: CRIMINAL_RECORD',
          received: metadata.documentType
        });
      }
    }

    if (!isClientReady(botId)) {
      return res.status(503).json({
        error: `Bot ${botId} no está conectado`,
        availableBots: getAllClients().filter(c => c.ready).map(c => c.clientId)
      });
    }

    const message = generateContextualMessage(type, name, step, metadata || {});
    const client = getClient(botId);

    console.log(`📤 [${botId}] Verificando y enviando mensaje contextual tipo: ${type} a ${phone}`);

    // Verificar que el número existe en WhatsApp
    const verifiedChatId = await verifyPhoneNumber(client, phone);

    if (!verifiedChatId) {
      return res.status(404).json({
        error: 'Número no encontrado en WhatsApp',
        phone: phone,
        details: 'El número no está registrado en WhatsApp o el formato es incorrecto'
      });
    }

    await client.sendMessage(verifiedChatId, message);

    console.log(`✅ [${botId}] Mensaje contextual enviado a ${verifiedChatId}`);

    res.json({
      success: true,
      botId: botId,
      phone: phone,
      chatId: verifiedChatId,
      name: name,
      type: type,
      sentAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error enviando mensaje contextual:', error);
    res.status(500).json({
      error: 'Error al enviar mensaje',
      details: error.message
    });
  }
});

/**
 * POST /send-message-with-media
 * Envía UN mensaje con imagen adjunta
 */
app.post('/send-message-with-media', verifyApiKey, async (req, res) => {
  try {
    const { phone, message, imageUrl, botId = 'bot-adquisicion-prod' } = req.body;

    if (!phone || !message) {
      return res.status(400).json({
        error: 'Parámetros faltantes',
        required: ['phone', 'message'],
        optional: ['imageUrl', 'botId']
      });
    }

    if (!isClientReady(botId)) {
      return res.status(503).json({
        error: `Bot ${botId} no está conectado`,
        availableBots: getAllClients().filter(c => c.ready).map(c => c.clientId)
      });
    }

    const client = getClient(botId);

    console.log(`📤 [${botId}] Verificando número y enviando mensaje${imageUrl ? ' con imagen' : ''} a ${phone}`);

    // Verificar que el número existe en WhatsApp
    const verifiedChatId = await verifyPhoneNumber(client, phone);

    if (!verifiedChatId) {
      return res.status(404).json({
        error: 'Número no encontrado en WhatsApp',
        phone: phone,
        details: 'El número no está registrado en WhatsApp o el formato es incorrecto'
      });
    }

    if (imageUrl) {
      let media = null;
      try {
        console.log(`📷 Descargando imagen desde: ${imageUrl}`);

        media = await MessageMedia.fromUrl(imageUrl, { unsafeMime: true });

        console.log(`✅ Imagen descargada (${media.mimetype}), enviando...`);

        await client.sendMessage(verifiedChatId, media, { caption: message });

        console.log(`✅ [${botId}] Mensaje con imagen enviado exitosamente`);

        // ✅ Liberar imagen de memoria inmediatamente
        media = null;
      } catch (mediaError) {
        console.error('❌ Error enviando imagen:', mediaError);

        // ✅ Liberar imagen en caso de error
        media = null;

        console.log('⚠️  Enviando solo texto como fallback...');
        await client.sendMessage(verifiedChatId, message);

        return res.json({
          success: true,
          botId: botId,
          phone: phone,
          chatId: verifiedChatId,
          hasImage: false,
          warning: 'La imagen no pudo enviarse, se envió solo el texto',
          imageError: mediaError.message,
          sentAt: new Date().toISOString()
        });
      }
    } else {
      await client.sendMessage(verifiedChatId, message);
      console.log(`✅ [${botId}] Mensaje de texto enviado exitosamente`);
    }

    res.json({
      success: true,
      botId: botId,
      phone: phone,
      chatId: chatId,
      hasImage: !!imageUrl,
      sentAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error enviando mensaje:', error);
    res.status(500).json({
      error: 'Error al enviar mensaje',
      details: error.message
    });
  }
});

/**
 * POST /send-bulk
 * Envío masivo de TEXTO con distribución automática entre bots
 */
app.post('/send-bulk', verifyApiKey, async (req, res) => {
  try {
    const { messages, distributeAcrossBots = true, delayMs = 10000 } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({
        error: 'Se requiere un array de messages'
      });
    }

    const readyBots = getAllClients().filter(c => c.ready);
    
    if (readyBots.length === 0) {
      return res.status(503).json({
        error: 'No hay bots conectados'
      });
    }

    console.log(`📤 Enviando ${messages.length} mensajes (texto)...`);
    
    const results = [];
    let botIndex = 0;

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      
      try {
        if (!msg.phone || !msg.message) {
          results.push({
            phone: msg.phone || 'unknown',
            success: false,
            error: 'Faltan parámetros'
          });
          continue;
        }

        let selectedBotId;
        if (distributeAcrossBots) {
          selectedBotId = readyBots[botIndex % readyBots.length].clientId;
          botIndex++;
        } else {
          selectedBotId = msg.botId || 'bot-adquisicion-prod';
        }

        const client = getClient(selectedBotId);
        if (!client) {
          results.push({
            phone: msg.phone,
            success: false,
            error: `Bot ${selectedBotId} no disponible`
          });
          continue;
        }

        // Verificar número antes de enviar
        const verifiedChatId = await verifyPhoneNumber(client, msg.phone);
        if (!verifiedChatId) {
          results.push({
            phone: msg.phone,
            success: false,
            error: 'Número no encontrado en WhatsApp'
          });
          continue;
        }

        await client.sendMessage(verifiedChatId, msg.message);

        results.push({
          phone: msg.phone,
          chatId: verifiedChatId,
          botId: selectedBotId,
          success: true,
          sentAt: new Date().toISOString()
        });

        console.log(`✅ [${i + 1}/${messages.length}] [${selectedBotId}] → ${msg.phone}`);

        // Delay entre mensajes
        if (i < messages.length - 1) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }

      } catch (error) {
        results.push({
          phone: msg.phone,
          success: false,
          error: error.message
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    console.log(`📊 Resumen: ${successCount} exitosos, ${failCount} fallidos`);

    // ✅ Forzar recolección de basura después de envío masivo
    if (global.gc) {
      global.gc();
      console.log('🧹 Recolección de basura ejecutada después de envío masivo');
    }

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
 * POST /send-bulk-media
 * Envío masivo CON IMAGEN - Rate limiting interno
 */
app.post('/send-bulk-media', verifyApiKey, async (req, res) => {
  try {
    const { 
      messages, 
      imageUrl, 
      distributeAcrossBots = true, 
      delayMs = 10000 
    } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({
        error: 'Se requiere un array de messages',
        required: ['messages', 'imageUrl'],
        messageFormat: { phone: 'string', message: 'string', botId: 'string (opcional)' }
      });
    }

    if (!imageUrl) {
      return res.status(400).json({
        error: 'Se requiere imageUrl para este endpoint. Para mensajes sin imagen usa /send-bulk'
      });
    }

    const readyBots = getAllClients().filter(c => c.ready);
    
    if (readyBots.length === 0) {
      return res.status(503).json({
        error: 'No hay bots conectados'
      });
    }

    console.log(`📤 Enviando ${messages.length} mensajes con imagen...`);
    console.log(`📷 Imagen URL: ${imageUrl}`);

    // Pre-descargar la imagen una sola vez para optimizar
    let media;
    try {
      console.log('📷 Pre-descargando imagen...');
      media = await MessageMedia.fromUrl(imageUrl, { unsafeMime: true });
      console.log(`✅ Imagen pre-descargada (${media.mimetype}, ${Math.round(media.data.length / 1024)}KB)`);
    } catch (mediaError) {
      console.error('❌ Error descargando imagen:', mediaError);
      return res.status(400).json({
        error: 'No se pudo descargar la imagen',
        details: mediaError.message,
        imageUrl: imageUrl
      });
    }

    const results = [];
    let botIndex = 0;

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      
      try {
        if (!msg.phone || !msg.message) {
          results.push({
            phone: msg.phone || 'unknown',
            success: false,
            error: 'Faltan parámetros (phone, message)'
          });
          continue;
        }

        // Seleccionar bot
        let selectedBotId;
        if (distributeAcrossBots) {
          selectedBotId = readyBots[botIndex % readyBots.length].clientId;
          botIndex++;
        } else {
          selectedBotId = msg.botId || 'bot-adquisicion-prod';
        }

        const client = getClient(selectedBotId);
        if (!client) {
          results.push({
            phone: msg.phone,
            success: false,
            error: `Bot ${selectedBotId} no disponible`
          });
          continue;
        }

        // Verificar número antes de enviar
        const verifiedChatId = await verifyPhoneNumber(client, msg.phone);
        if (!verifiedChatId) {
          results.push({
            phone: msg.phone,
            success: false,
            error: 'Número no encontrado en WhatsApp'
          });
          continue;
        }

        try {
          // Enviar con imagen
          await client.sendMessage(verifiedChatId, media, { caption: msg.message });

          results.push({
            phone: msg.phone,
            botId: selectedBotId,
            chatId: verifiedChatId,
            success: true,
            hasImage: true,
            sentAt: new Date().toISOString()
          });

          console.log(`✅ [${i + 1}/${messages.length}] [${selectedBotId}] 📷 → ${msg.phone}`);

        } catch (sendError) {
          // Fallback: intentar enviar solo texto
          console.error(`⚠️  Error enviando imagen a ${msg.phone}, intentando solo texto...`);

          try {
            await client.sendMessage(verifiedChatId, msg.message);

            results.push({
              phone: msg.phone,
              botId: selectedBotId,
              chatId: verifiedChatId,
              success: true,
              hasImage: false,
              warning: 'Imagen falló, se envió solo texto',
              sentAt: new Date().toISOString()
            });

            console.log(`⚠️  [${i + 1}/${messages.length}] [${selectedBotId}] 📝 → ${msg.phone} (solo texto)`);

          } catch (textError) {
            results.push({
              phone: msg.phone,
              success: false,
              error: textError.message
            });
            console.error(`❌ [${i + 1}/${messages.length}] Error total → ${msg.phone}`);
          }
        }

        // Delay entre mensajes (rate limiting)
        if (i < messages.length - 1) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }

      } catch (error) {
        results.push({
          phone: msg.phone,
          success: false,
          error: error.message
        });
        console.error(`❌ Error procesando ${msg.phone}:`, error.message);
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    const withImageCount = results.filter(r => r.success && r.hasImage).length;
    const textOnlyCount = results.filter(r => r.success && !r.hasImage).length;

    console.log(`📊 Resumen: ${successCount} exitosos (${withImageCount} con imagen, ${textOnlyCount} solo texto), ${failCount} fallidos`);

    // ✅ Liberar imagen de memoria
    media = null;

    // ✅ Forzar recolección de basura después de envío masivo con imágenes
    if (global.gc) {
      global.gc();
      console.log('🧹 Recolección de basura ejecutada después de envío masivo con imágenes');
    }

    res.json({
      summary: {
        total: messages.length,
        successful: successCount,
        failed: failCount,
        withImage: withImageCount,
        textOnly: textOnlyCount
      },
      results: results
    });

  } catch (error) {
    console.error('❌ Error en envío masivo con imagen:', error);
    res.status(500).json({
      error: 'Error en envío masivo',
      details: error.message
    });
  }
});

/**
 * GET /message-types
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
 * POST /logout/:botId
 */
app.post('/logout/:botId', verifyApiKey, async (req, res) => {
  try {
    const { botId } = req.params;
    
    const success = await closeClient(botId);
    
    if (success) {
      res.json({
        success: true,
        message: `Bot ${botId} cerrado completamente`,
        timestamp: new Date().toISOString(),
        note: 'La sesión fue eliminada. Escanea nuevo QR al reiniciar.'
      });
    } else {
      res.status(404).json({
        success: false,
        error: `Bot ${botId} no encontrado`
      });
    }
    
  } catch (error) {
    console.error('❌ Error cerrando bot:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /restart/:botId
 */
app.post('/restart/:botId', verifyApiKey, async (req, res) => {
  try {
    const { botId } = req.params;
    
    const validBots = BOTS_CONFIG.map(b => b.id);
    if (!validBots.includes(botId)) {
      return res.status(400).json({
        success: false,
        error: `Bot ${botId} no está en la configuración`,
        validBots: validBots
      });
    }
    
    console.log(`🔄 Reiniciando ${botId}...`);
    
    const existingClient = getClient(botId);
    if (existingClient) {
      console.log(`🔴 Cerrando ${botId}...`);
      await closeClient(botId);
    } else {
      console.log(`⚠️  ${botId} no estaba activo`);
    }
    
    console.log(`⏳ Esperando 2 segundos...`);
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log(`🚀 Inicializando ${botId}...`);
    await initializeClient(botId, (message, clientId) => {
      handleIncomingMessage(message, VERCEL_WEBHOOK_URL);
    });
    
    res.json({
      success: true,
      message: `Bot ${botId} reiniciado correctamente`,
      botId: botId,
      timestamp: new Date().toISOString(),
      notes: [
        'El bot se está inicializando en segundo plano',
        'Si tiene sesión guardada localmente → se reconectará automáticamente',
        'Si NO tiene sesión → generará un QR (verificar en /qr/' + botId + ')',
        'Esto puede tardar 10-30 segundos'
      ]
    });
    
  } catch (error) {
    console.error('❌ Error reiniciando bot:', error);
    res.status(500).json({
      success: false,
      error: 'Error al reiniciar bot',
      details: error.message
    });
  }
});

/**
 * POST /restart/:botId/fresh
 */
app.post('/restart/:botId/fresh', verifyApiKey, async (req, res) => {
  try {
    const { botId } = req.params;
    
    const validBots = BOTS_CONFIG.map(b => b.id);
    if (!validBots.includes(botId)) {
      return res.status(400).json({
        success: false,
        error: `Bot ${botId} no está en la configuración`,
        validBots: validBots
      });
    }
    
    console.log(`🔄 Reinicio COMPLETO de ${botId} (sin sesión)...`);

    await closeClient(botId);

    console.log(`⚠️  NOTA: Con LocalAuth, la sesión persiste en disco local (.wwebjs_auth/)`);
    console.log(`⚠️  Para eliminar la sesión completamente, detén el servidor y elimina .wwebjs_auth/${botId}/`);

    await new Promise(resolve => setTimeout(resolve, 2000));

    await initializeClient(botId, (message, clientId) => {
      handleIncomingMessage(message, VERCEL_WEBHOOK_URL);
    });

    res.json({
      success: true,
      message: `Bot ${botId} reiniciado`,
      botId: botId,
      note: 'La sesión local persiste. Si quieres QR nuevo, elimina .wwebjs_auth/${botId}/',
      qrUrl: `/qr/${botId}`,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /
 */
app.get('/', (req, res) => {
  const clients = getAllClients();
  
  res.json({
    service: 'WhatsApp Multi-Bot API - Monchis Drivers',
    version: '3.2.0',
    bots: clients,
    endpoints: {
      health: 'GET /health',
      memory: 'GET /memory (monitoreo de RAM)',
      bots: 'GET /bots',
      qr: 'GET /qr/:botId',
      sendMessage: 'POST /send-message',
      sendMessageWithMedia: 'POST /send-message-with-media',
      sendContextualMessage: 'POST /send-contextual-message',
      sendBulk: 'POST /send-bulk (texto)',
      sendBulkMedia: 'POST /send-bulk-media (con imagen)',
      messageTypes: 'GET /message-types',
      logout: 'POST /logout/:botId',
      restart: 'POST /restart/:botId',
      restartFresh: 'POST /restart/:botId/fresh'
    }
  });
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
  console.log(`🚀 Servidor Multi-Bot corriendo en puerto ${PORT}`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
  console.log(`🤖 Bots configurados: ${BOTS_CONFIG.length}`);
  console.log(`📡 Webhook: ${VERCEL_WEBHOOK_URL || 'No configurado'}`);
  console.log(`🔐 API Key: ${API_KEY ? 'Configurada ✅' : 'No configurada ⚠️'}`);
  console.log(`${'='.repeat(50)}\n`);
});

process.on('SIGINT', async () => {
  console.log('\n⚠️  Señal SIGINT recibida, cerrando todos los bots...');
  await closeAllClients();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n⚠️  Señal SIGTERM recibida, cerrando todos los bots...');
  await closeAllClients();
  process.exit(0);
});