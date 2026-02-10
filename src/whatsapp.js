/**
 * Multi-Client WhatsApp Manager - LOCAL STORAGE
 * Versión mejorada con:
 * - Almacenamiento LOCAL en lugar de MongoDB
 * - Reconexión automática con backoff exponencial
 * - Sin webVersionCache fijo
 * - Args optimizados de Chromium
 * - Límite de reintentos con notificación
 */

import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import os from 'os';

// Maps para gestión de clientes
const clients = new Map();
const clientsReady = new Map();
const clientsSessionSaved = new Map();
const clientsQR = new Map();

// ✅ NUEVO: Tracking de reconexiones
const reconnectionAttempts = new Map(); // { clientId: { count: 0, lastAttempt: Date } }
const MAX_RECONNECTION_ATTEMPTS = 5;
const RECONNECTION_DELAYS = [10000, 30000, 60000, 120000, 300000]; // 10s, 30s, 1m, 2m, 5m

/**
 * ✅ MEJORADO: Configuración optimizada de Puppeteer/Chromium
 * Agregados args para reducir consumo de RAM y CPU
 */
function getPuppeteerConfig() {
  const isWindows = os.platform() === 'win32';
  const isLinux = os.platform() === 'linux';
  
  // Args comunes optimizados para todos los OS
  const commonArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--disable-gpu',
    // ✅ NUEVOS: Optimización adicional
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-default-apps',
    '--disable-sync',
    '--disable-translate',
    '--metrics-recording-only',
    '--no-default-browser-check',
    '--mute-audio',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=TranslateUI,BlinkGenPropertyTrees',
  ];
  
  if (isWindows) {
    console.log('🪟 Sistema Windows detectado - usando Chromium de Puppeteer');
    return {
      headless: true,
      args: commonArgs
    };
  } else if (isLinux) {
    console.log('🐧 Sistema Linux detectado - usando Chromium del sistema');
    return {
      headless: true,
      executablePath: '/usr/bin/chromium',
      args: [
        ...commonArgs,
        '--single-process', // Solo en Linux
        '--disable-features=AudioServiceOutOfProcess'
      ]
    };
  } else {
    return {
      headless: true,
      args: commonArgs
    };
  }
}

/**
 * ✅ NUEVO: Maneja reconexión con backoff exponencial
 */
async function handleReconnection(clientId, onMessageReceived) {
  const attempts = reconnectionAttempts.get(clientId) || { count: 0, lastAttempt: null };
  
  if (attempts.count >= MAX_RECONNECTION_ATTEMPTS) {
    console.error(`\n${'='.repeat(60)}`);
    console.error(`🚨 CRÍTICO: ${clientId} agotó reintentos de reconexión`);
    console.error(`Intentos fallidos: ${attempts.count}`);
    console.error(`${'='.repeat(60)}\n`);
    
    // ✅ Aquí podrías agregar webhook/notificación
    // await sendAlert(`Bot ${clientId} requiere intervención manual`);
    
    return false;
  }

  attempts.count++;
  attempts.lastAttempt = new Date();
  reconnectionAttempts.set(clientId, attempts);

  const delay = RECONNECTION_DELAYS[Math.min(attempts.count - 1, RECONNECTION_DELAYS.length - 1)];
  const delaySeconds = (delay / 1000).toFixed(0);

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`🔄 ${clientId} - Intento de reconexión ${attempts.count}/${MAX_RECONNECTION_ATTEMPTS}`);
  console.log(`⏳ Esperando ${delaySeconds}s antes de reintentar...`);
  console.log(`${'─'.repeat(50)}\n`);

  await new Promise(resolve => setTimeout(resolve, delay));

  try {
    const client = clients.get(clientId);
    
    if (client) {
      console.log(`🔌 ${clientId} - Intentando reinicializar...`);
      await client.initialize();
      return true;
    } else {
      console.log(`🔄 ${clientId} - Reinicializando cliente completo...`);
      await initializeClient(clientId, onMessageReceived);
      return true;
    }
  } catch (error) {
    console.error(`❌ ${clientId} - Error en reconexión:`, error.message);
    
    // Reintentar recursivamente
    return handleReconnection(clientId, onMessageReceived);
  }
}

/**
 * ✅ NUEVO: Resetea contadores de reconexión cuando el bot está estable
 */
function resetReconnectionAttempts(clientId) {
  reconnectionAttempts.delete(clientId);
  console.log(`✨ ${clientId} - Contadores de reconexión reseteados`);
}

/**
 * Inicializa un cliente de WhatsApp con LocalAuth
 */
export async function initializeClient(clientId, onMessageReceived) {
  if (clients.has(clientId)) {
    console.log(`⚠️  Cliente ${clientId} ya está inicializado`);
    return clients.get(clientId);
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`🤖 Inicializando bot: ${clientId}`);
  console.log(`${'='.repeat(50)}\n`);

  const puppeteerConfig = getPuppeteerConfig();

  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: clientId,
      dataPath: './.wwebjs_auth'
    }),
    puppeteer: {
      ...puppeteerConfig,
      // Agregar user agent para evitar detección
      args: [
        ...(puppeteerConfig.args || []),
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      ]
    },
    qrTimeoutMs: 0,              // Sin timeout de QR
    authTimeoutMs: 0,            // Sin timeout de autenticación (crítico para Railway)
    takeoverOnConflict: true,    // Manejar conflictos de sesión automáticamente
    takeoverTimeoutMs: 0,        // Sin timeout en takeover
    restartOnAuthFail: true,     // Auto-reiniciar si falla la autenticación
    // ✅ CRÍTICO: Deshabilitar auto-markAsRead para evitar error "markedUnread"
    // Este error ocurre con chats que usan el nuevo formato LID
    markMessagesAsRead: false
  });

  // ===== EVENTOS =====

  client.on('qr', (qr) => {
    console.log(`\n🔐 ===== QR para ${clientId} =====\n`);
    qrcode.generate(qr, { small: true });
    console.log(`\n📱 Escanea con WhatsApp para conectar ${clientId}\n`);
    
    clientsQR.set(clientId, {
      qr: qr,
      timestamp: new Date().toISOString()
    });
  });

  client.on('ready', () => {
    console.log(`✅ ${clientId} conectado y listo!`);
    console.log(`📞 Conectado como: ${client.info.pushname}`);
    console.log(`📱 Número: ${client.info.wid.user}`);
    
    clientsReady.set(clientId, true);
    clientsQR.delete(clientId);
    
    // ✅ NUEVO: Resetear contadores si se conectó exitosamente
    resetReconnectionAttempts(clientId);
    
    if (!clientsSessionSaved.get(clientId)) {
      console.log(`⏳ Esperando que la sesión de ${clientId} se guarde...`);
    }
  });

  client.on('authenticated', () => {
    clientsSessionSaved.set(clientId, true);
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🔓 ${clientId} autenticado exitosamente`);
    console.log(`💾 ✅ SESIÓN GUARDADA: ${clientId}`);
    console.log(`📍 Ubicación: Almacenamiento local (.wwebjs_auth/)`);
    console.log(`✨ ${clientId} persistirá entre reinicios`);
    console.log(`⚠️  IMPORTANTE: La sesión se perderá en cada deploy`);
    console.log(`${'='.repeat(60)}\n`);
  });

  client.on('auth_failure', (msg) => {
    console.error(`❌ Error de autenticación en ${clientId}:`, msg);
  });

  client.on('message', async (message) => {
    const isGroup = message.from.includes('@g.us');
    
    console.log(`📨 Mensaje recibido en ${clientId}:`, {
      from: message.from,
      fromName: message._data.notifyName || 'Desconocido',
      body: message.body,
      isGroup: isGroup
    });

    if (onMessageReceived) {
      try {
        await onMessageReceived(message, clientId);
      } catch (error) {
        console.error(`Error en callback de ${clientId}:`, error);
      }
    }
  });

  // ✅ MEJORADO: Manejo de desconexión con reconexión automática
  client.on('disconnected', async (reason) => {
    console.log(`\n⚠️  ${clientId} DESCONECTADO`);
    console.log(`Razón: ${reason}`);
    console.log(`Timestamp: ${new Date().toISOString()}\n`);
    
    clientsReady.set(clientId, false);
    
    // NO borrar sessionSaved - la sesión en MongoDB sigue existiendo
    // clientsSessionSaved.set(clientId, false); // ❌ NO hacer esto
    
    // ✅ Intentar reconectar automáticamente
    console.log(`🔄 ${clientId} - Iniciando secuencia de reconexión...`);
    
    try {
      await handleReconnection(clientId, onMessageReceived);
    } catch (error) {
      console.error(`❌ ${clientId} - Error crítico en reconexión:`, error);
    }
  });

  client.on('loading_screen', (percent, message) => {
    console.log(`⏳ ${clientId} cargando... ${percent}% - ${message}`);
  });

  // ✅ NUEVO: Detectar cambios de estado
  client.on('change_state', (state) => {
    console.log(`🔄 ${clientId} - Cambio de estado: ${state}`);
  });

  // Guardar cliente
  clients.set(clientId, client);
  clientsReady.set(clientId, false);
  clientsSessionSaved.set(clientId, false);

  console.log(`🚀 Inicializando ${clientId} con LocalAuth...`);
  client.initialize();

  return client;
}

/**
 * Obtiene un cliente específico
 */
export function getClient(clientId) {
  return clients.get(clientId);
}

/**
 * Verifica si un cliente está listo
 */
export function isClientReady(clientId) {
  return clientsReady.get(clientId) || false;
}

/**
 * Verifica si la sesión está guardada
 */
export function isSessionSaved(clientId) {
  return clientsSessionSaved.get(clientId) || false;
}

/**
 * Obtiene el QR de un cliente
 */
export function getClientQR(clientId) {
  return clientsQR.get(clientId);
}

/**
 * Lista todos los clientes
 */
export function getAllClients() {
  return Array.from(clients.keys()).map(clientId => {
    const attempts = reconnectionAttempts.get(clientId);
    
    return {
      clientId,
      ready: isClientReady(clientId),
      sessionSaved: isSessionSaved(clientId),
      hasQR: clientsQR.has(clientId),
      // ✅ NUEVO: Info de reconexiones
      reconnectionAttempts: attempts?.count || 0,
      lastReconnectionAttempt: attempts?.lastAttempt || null,
    };
  });
}

/**
 * Formatea número de teléfono para WhatsApp
 * Soporta múltiples países y formatos
 */
export function formatPhoneNumber(phone) {
  // Remover todos los caracteres no numéricos
  let cleanPhone = phone.replace(/\D/g, '');

  // Si empieza con 0, removerlo (formato local)
  if (cleanPhone.startsWith('0')) {
    cleanPhone = cleanPhone.substring(1);
  }

  // Auto-detectar país si no tiene código de país
  // Argentina (54): 10 dígitos después del código
  // Paraguay (595): 9 dígitos después del código
  if (!cleanPhone.startsWith('54') && !cleanPhone.startsWith('595') && !cleanPhone.startsWith('1')) {
    if (cleanPhone.length === 10) {
      // Probablemente Argentina
      cleanPhone = '54' + cleanPhone;
    } else if (cleanPhone.length === 9) {
      // Probablemente Paraguay
      cleanPhone = '595' + cleanPhone;
    }
  }

  // Agregar @c.us solo si no tiene ya un sufijo
  if (!cleanPhone.includes('@')) {
    cleanPhone = cleanPhone + '@c.us';
  }

  return cleanPhone;
}

/**
 * Verifica si un número/contacto existe en WhatsApp y obtiene su chat
 * Usa getChatById que maneja correctamente tanto @c.us como @lid
 */
export async function verifyPhoneNumber(client, phone) {
  try {
    const formattedPhone = formatPhoneNumber(phone);
    const phoneOnly = formattedPhone.replace('@c.us', '');

    // Verificar si el número existe en WhatsApp
    const numberId = await client.getNumberId(phoneOnly);

    if (!numberId) {
      console.warn(`⚠️  Número no encontrado en WhatsApp: ${phone}`);
      return null;
    }

    // Usar el ID serializado que retorna getNumberId
    // Este ya tiene el formato correcto (@c.us o @lid)
    const chatId = numberId._serialized;

    console.log(`✅ Número verificado: ${phone} -> ${chatId}`);

    // Intentar obtener el chat para asegurarnos que existe
    try {
      await client.getChatById(chatId);
      return chatId;
    } catch (chatError) {
      // Si el chat no existe, crear uno enviando el mensaje directamente
      console.log(`⚠️  Chat no existe aún, se creará al enviar el mensaje: ${chatId}`);
      return chatId;
    }
  } catch (error) {
    console.error(`❌ Error verificando número ${phone}:`, error.message);
    return null;
  }
}

/**
 * Cierra un cliente específico
 */
export async function closeClient(clientId) {
  const client = clients.get(clientId);
  
  if (client) {
    try {
      if (clientsReady.get(clientId)) {
        await client.logout();
      }
      await client.destroy();
      
      clients.delete(clientId);
      clientsReady.delete(clientId);
      clientsSessionSaved.delete(clientId);
      clientsQR.delete(clientId);
      reconnectionAttempts.delete(clientId); // ✅ NUEVO: Limpiar intentos
      
      console.log(`👋 Cliente ${clientId} cerrado`);
      return true;
    } catch (error) {
      console.error(`Error cerrando ${clientId}:`, error);
      throw error;
    }
  }
  
  return false;
}

/**
 * Cierra todos los clientes
 */
export async function closeAllClients() {
  const clientIds = Array.from(clients.keys());

  for (const clientId of clientIds) {
    await closeClient(clientId);
  }

  console.log('👋 Todos los clientes cerrados');
}

/**
 * ✅ NUEVO: Función de diagnóstico
 * Útil para debugging y monitoreo
 */
export function getSystemStatus() {
  return {
    totalClients: clients.size,
    readyClients: Array.from(clientsReady.entries()).filter(([_, ready]) => ready).length,
    sessionsSaved: Array.from(clientsSessionSaved.entries()).filter(([_, saved]) => saved).length,
    pendingQRs: clientsQR.size,
    reconnectionStatus: Array.from(reconnectionAttempts.entries()).map(([clientId, data]) => ({
      clientId,
      attempts: data.count,
      lastAttempt: data.lastAttempt,
      maxReached: data.count >= MAX_RECONNECTION_ATTEMPTS
    })),
    uptime: process.uptime(),
    memory: process.memoryUsage()
  };
}