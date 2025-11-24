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
  formatPhoneNumber,
  closeClient,
  closeAllClients
} from './whatsapp.js';
import { handleIncomingMessage } from './messageHandler.js';
import { generateContextualMessage, isValidMessageType, getValidMessageTypes, getMessageTypeInfo } from './messageTemplates.js';
import mongoose from 'mongoose';

// Cargar variables de entorno
dotenv.config();

const app = express();

const corsOptions = {
  origin: [
    'https://monchis-drivers.vercel.app',
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
    const chatId = formatPhoneNumber(phone);

    console.log(`📤 [${botId}] Enviando mensaje a ${phone}`);

    await client.sendMessage(chatId, message);

    console.log(`✅ [${botId}] Mensaje enviado exitosamente`);

    res.json({
      success: true,
      botId: botId,
      phone: phone,
      chatId: chatId,
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

    if (!isClientReady(botId)) {
      return res.status(503).json({
        error: `Bot ${botId} no está conectado`,
        availableBots: getAllClients().filter(c => c.ready).map(c => c.clientId)
      });
    }

    const message = generateContextualMessage(type, name, step, metadata || {});
    const client = getClient(botId);
    const chatId = formatPhoneNumber(phone);
    
    console.log(`📤 [${botId}] Enviando mensaje contextual tipo: ${type}`);
    
    await client.sendMessage(chatId, message);

    console.log(`✅ [${botId}] Mensaje contextual enviado`);

    res.json({
      success: true,
      botId: botId,
      phone: phone,
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
    const chatId = formatPhoneNumber(phone);

    console.log(`📤 [${botId}] Enviando mensaje${imageUrl ? ' con imagen' : ''} a ${phone}`);

    if (imageUrl) {
      try {
        console.log(`📷 Descargando imagen desde: ${imageUrl}`);
        
        const media = await MessageMedia.fromUrl(imageUrl, { unsafeMime: true });
        
        console.log(`✅ Imagen descargada (${media.mimetype}), enviando...`);
        
        await client.sendMessage(chatId, media, { caption: message });
        
        console.log(`✅ [${botId}] Mensaje con imagen enviado exitosamente`);
      } catch (mediaError) {
        console.error('❌ Error enviando imagen:', mediaError);
        
        console.log('⚠️  Enviando solo texto como fallback...');
        await client.sendMessage(chatId, message);
        
        return res.json({
          success: true,
          botId: botId,
          phone: phone,
          chatId: chatId,
          hasImage: false,
          warning: 'La imagen no pudo enviarse, se envió solo el texto',
          imageError: mediaError.message,
          sentAt: new Date().toISOString()
        });
      }
    } else {
      await client.sendMessage(chatId, message);
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
    const { messages, distributeAcrossBots = true, delayMs = 2000 } = req.body;

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

        const chatId = formatPhoneNumber(msg.phone);
        await client.sendMessage(chatId, msg.message);

        results.push({
          phone: msg.phone,
          botId: selectedBotId,
          chatId: chatId,
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
      delayMs = 2000 
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

        const chatId = formatPhoneNumber(msg.phone);
        
        try {
          // Enviar con imagen
          await client.sendMessage(chatId, media, { caption: msg.message });

          results.push({
            phone: msg.phone,
            botId: selectedBotId,
            chatId: chatId,
            success: true,
            hasImage: true,
            sentAt: new Date().toISOString()
          });

          console.log(`✅ [${i + 1}/${messages.length}] [${selectedBotId}] 📷 → ${msg.phone}`);

        } catch (sendError) {
          // Fallback: intentar enviar solo texto
          console.error(`⚠️  Error enviando imagen a ${msg.phone}, intentando solo texto...`);
          
          try {
            await client.sendMessage(chatId, msg.message);
            
            results.push({
              phone: msg.phone,
              botId: selectedBotId,
              chatId: chatId,
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
        'Si tiene sesión guardada en MongoDB → se reconectará automáticamente',
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
    
    const db = mongoose.connection.db;
    
    const filesCollection = `whatsapp-RemoteAuth-${botId}.files`;
    const chunksCollection = `whatsapp-RemoteAuth-${botId}.chunks`;
    
    await db.collection(filesCollection).drop().catch(() => {
      console.log(`⚠️  Colección ${filesCollection} no existe o ya fue eliminada`);
    });
    
    await db.collection(chunksCollection).drop().catch(() => {
      console.log(`⚠️  Colección ${chunksCollection} no existe o ya fue eliminada`);
    });
    
    console.log(`🗑️  Sesión de MongoDB eliminada`);
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    await initializeClient(botId, (message, clientId) => {
      handleIncomingMessage(message, VERCEL_WEBHOOK_URL);
    });
    
    res.json({
      success: true,
      message: `Bot ${botId} reiniciado sin sesión`,
      botId: botId,
      note: 'Se generará un NUEVO QR - la sesión anterior fue eliminada',
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
    version: '3.1.0',
    bots: clients,
    endpoints: {
      health: 'GET /health',
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