/**
 * Multi-Client WhatsApp Manager
 * Permite manejar múltiples bots de WhatsApp simultáneamente
 */

import pkg from 'whatsapp-web.js';
const { Client, RemoteAuth } = pkg;
import qrcode from 'qrcode-terminal';
import { MongoStore } from 'wwebjs-mongo';
import mongoose from 'mongoose';
import os from 'os';

// Map para guardar múltiples clientes
const clients = new Map();
const clientsReady = new Map();
const clientsSessionSaved = new Map();
const clientsQR = new Map();

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
 * Obtiene configuración de Puppeteer según el sistema operativo
 */
function getPuppeteerConfig() {
  const isWindows = os.platform() === 'win32';
  const isLinux = os.platform() === 'linux';
  
  if (isWindows) {
    console.log('🪟 Sistema Windows detectado - usando Chromium de Puppeteer');
    return {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    };
  } else if (isLinux) {
    console.log('🐧 Sistema Linux detectado - usando Chromium del sistema');
    return {
      headless: true,
      executablePath: '/usr/bin/chromium',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu',
        '--disable-features=AudioServiceOutOfProcess'
      ]
    };
  } else {
    return {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    };
  }
}

/**
 * Inicializa un cliente de WhatsApp
 * @param {string} clientId - ID único del cliente (ej: 'bot-1', 'bot-2')
 * @param {Function} onMessageReceived - Callback para mensajes recibidos
 */
export async function initializeClient(clientId, onMessageReceived) {
  // Verificar si el cliente ya existe
  if (clients.has(clientId)) {
    console.log(`⚠️  Cliente ${clientId} ya está inicializado`);
    return clients.get(clientId);
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`🤖 Inicializando bot: ${clientId}`);
  console.log(`${'='.repeat(50)}\n`);

  // Conectar a MongoDB
  await connectMongoDB();

  // Crear store
  const store = new MongoStore({ mongoose: mongoose });
  const puppeteerConfig = getPuppeteerConfig();

  // Crear cliente
  const client = new Client({
    authStrategy: new RemoteAuth({
      clientId: clientId,
      store: store,
      backupSyncIntervalMs: 300000
    }),
    puppeteer: puppeteerConfig,
    webVersionCache: {
      type: 'remote',
      remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
    }
  });

  // Eventos del cliente
  client.on('qr', (qr) => {
    console.log(`\n🔐 ===== QR para ${clientId} =====\n`);
    qrcode.generate(qr, { small: true });
    console.log(`\n📱 Escanea con WhatsApp para conectar ${clientId}\n`);
    
    // Guardar QR para endpoint
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

  client.on('disconnected', (reason) => {
    console.log(`❌ ${clientId} desconectado:`, reason);
    clientsReady.set(clientId, false);
    clientsSessionSaved.set(clientId, false);
  });

  client.on('loading_screen', (percent, message) => {
    console.log(`⏳ ${clientId} cargando... ${percent}% - ${message}`);
  });

  // Guardar cliente
  clients.set(clientId, client);
  clientsReady.set(clientId, false);
  clientsSessionSaved.set(clientId, false);

  // Inicializar
  console.log(`🚀 Inicializando ${clientId} con RemoteAuth...`);
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
  return Array.from(clients.keys()).map(clientId => ({
    clientId,
    ready: isClientReady(clientId),
    sessionSaved: isSessionSaved(clientId),
    hasQR: clientsQR.has(clientId)
  }));
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