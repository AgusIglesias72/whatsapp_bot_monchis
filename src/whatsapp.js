/**
 * Multi-Client WhatsApp Manager - OPTIMIZADO
 * Versión mejorada con:
 * - Backup cada 6h (en lugar de 5min)
 * - Reconexión automática con backoff exponencial
 * - Sin webVersionCache fijo
 * - Args optimizados de Chromium
 * - Límite de reintentos con notificación
 */

import pkg from 'whatsapp-web.js';
const { Client, RemoteAuth } = pkg;
import qrcode from 'qrcode-terminal';
import { MongoStore } from 'wwebjs-mongo';
import mongoose from 'mongoose';
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

let mongooseConnected = false;

/**
 * Conecta a MongoDB (solo una vez)
 */
async function connectMongoDB() {
  if (mongooseConnected) return;
  
  try {
    console.log('🔌 Conectando a MongoDB con Mongoose...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Conectado a MongoDB exitosamente');
    mongooseConnected = true;
  } catch (error) {
    console.error('❌ Error conectando a MongoDB:', error);
    throw new Error('No se pudo conectar a MongoDB');
  }
}

/**
 * ✅ MEJORADO: Configuración optimizada de Puppeteer/Chromium
 * Agregados args para reducir consumo de RAM y CPU
 */
function getPuppeteerConfig() {
  const isWindows = os.platform() === 'win32';
  const isLinux = os.platform() === 'linux';
  
  // Args comunes optimizados para reducir RAM
  const commonArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--disable-gpu',
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
    // ✅ OPTIMIZACIONES ADICIONALES DE RAM
    '--disable-software-rasterizer',
    '--disable-canvas-aa',
    '--disable-2d-canvas-clip-aa',
    '--disable-gl-drawing-for-tests',
    '--disable-webgl',
    '--disable-webgl2',
    '--disable-databases',
    '--disable-javascript-harmony-shipping',
    '--disable-notifications',
    '--disable-offer-store-unmasked-wallet-cards',
    '--disable-offer-upload-credit-cards',
    '--disable-permissions-api',
    '--disable-presentation-api',
    '--disable-print-preview',
    '--disable-speech-api',
    '--disable-speech-synthesis-api',
    '--disk-cache-size=1',
    '--media-cache-size=1',
    '--aggressive-cache-discard',
    '--disable-cache',
    '--disable-application-cache',
    '--disable-offline-load-stale-cache',
    '--disable-gpu-shader-disk-cache',
    '--js-flags="--max-old-space-size=256"',
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
        // REMOVIDO: --single-process causa "Execution context was destroyed"
        '--disable-features=AudioServiceOutOfProcess',
        '--disable-crash-reporter',
        '--no-crash-upload',
        '--disable-breakpad',
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
 * ✅ MEJORADO: Maneja reconexión con backoff exponencial + liberación de memoria
 */
async function handleReconnection(clientId, onMessageReceived) {
  const attempts = reconnectionAttempts.get(clientId) || { count: 0, lastAttempt: null };

  if (attempts.count >= MAX_RECONNECTION_ATTEMPTS) {
    console.error(`\n${'='.repeat(60)}`);
    console.error(`🚨 CRÍTICO: ${clientId} agotó reintentos de reconexión`);
    console.error(`Intentos fallidos: ${attempts.count}`);
    console.error(`${'='.repeat(60)}\n`);

    // ✅ NUEVO: Liberar cliente zombie para evitar fugas de memoria
    console.log(`🗑️  Liberando cliente zombie ${clientId}...`);
    const zombieClient = clients.get(clientId);

    if (zombieClient) {
      try {
        await zombieClient.destroy();
        console.log(`💀 Cliente zombie ${clientId} destruido`);
      } catch (error) {
        console.error(`⚠️  Error destruyendo zombie ${clientId}:`, error.message);
      }

      clients.delete(clientId);
      clientsReady.set(clientId, false);
      clientsQR.delete(clientId);

      // Forzar recolección de basura si está disponible
      if (global.gc) {
        global.gc();
        console.log(`🧹 Recolección de basura forzada después de liberar ${clientId}`);
      }
    }

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
 * Inicializa un cliente de WhatsApp
 */
export async function initializeClient(clientId, onMessageReceived) {
  if (clients.has(clientId)) {
    console.log(`⚠️  Cliente ${clientId} ya está inicializado`);
    return clients.get(clientId);
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`🤖 Inicializando bot: ${clientId}`);
  console.log(`${'='.repeat(50)}\n`);

  await connectMongoDB();

  const store = new MongoStore({ mongoose: mongoose });
  const puppeteerConfig = getPuppeteerConfig();

  const client = new Client({
    authStrategy: new RemoteAuth({
      clientId: clientId,
      store: store,
      // ✅ CAMBIADO: De 5 min (300000) a 6 horas (21600000)
      // Ahora hace backup cada 6h en lugar de cada 5 min
      backupSyncIntervalMs: 21600000 // 6 horas
    }),
    puppeteer: puppeteerConfig,

    // ✅ AGREGADO: webVersionCache estable conocido que funciona
    webVersionCache: {
      type: 'remote',
      remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
    },

    // ✅ AGREGADO: Opciones para manejar contextos de navegación
    authTimeoutMs: 0, // Sin timeout de autenticación (para entornos lentos)
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
    console.log(`🔓 ${clientId} autenticado exitosamente`);
  });

  client.on('auth_failure', (msg) => {
    console.error(`❌ Error de autenticación en ${clientId}:`, msg);
  });

  client.on('remote_session_saved', () => {
    clientsSessionSaved.set(clientId, true);
    console.log(`💾 ✅ Sesión de ${clientId} guardada en MongoDB`);
    console.log(`✨ ${clientId} persistirá entre reinicios`);
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

  console.log(`🚀 Inicializando ${clientId} con RemoteAuth (backup cada 6h)...`);
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
 * Formatea número de teléfono
 */
export function formatPhoneNumber(phone) {
  let cleanPhone = phone.replace(/\D/g, '');
  
  if (!cleanPhone.startsWith('54') && cleanPhone.length === 10) {
    cleanPhone = '54' + cleanPhone;
  }
  
  if (!cleanPhone.includes('@c.us')) {
    cleanPhone = cleanPhone + '@c.us';
  }
  
  return cleanPhone;
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
  
  if (mongooseConnected) {
    await mongoose.connection.close();
    console.log('👋 Desconectado de MongoDB');
  }
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
    mongoConnected: mongooseConnected,
    uptime: process.uptime(),
    memory: process.memoryUsage()
  };
}