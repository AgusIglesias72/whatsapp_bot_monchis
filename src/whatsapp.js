import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';

let client = null;
let isReady = false;

/**
 * Inicializa el cliente de WhatsApp con LocalAuth
 * @param {Function} onMessageReceived - Callback que se ejecuta cuando llega un mensaje
 * @returns {Client} - Instancia del cliente de WhatsApp
 */
export function initializeWhatsApp(onMessageReceived) {
  // Configuración de Puppeteer para Railway/Docker
  const puppeteerConfig = {
    headless: true,
    executablePath: '/usr/bin/chromium', // ← CRÍTICO: Usa el Chromium del sistema
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

  client = new Client({
    authStrategy: new LocalAuth({
      clientId: 'whatsapp-bot-main',
      dataPath: './.wwebjs_auth'
    }),
    puppeteer: puppeteerConfig, // ← Usa la config de arriba
    webVersionCache: {
      type: 'remote',
      remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
    }
  });


  // Evento: QR Code para autenticación inicial
  client.on('qr', (qr) => {
    console.log('\n🔐 ===== ESCANEA ESTE QR CON WHATSAPP =====\n');
    qrcode.generate(qr, { small: true });
    console.log('\n📱 Abre WhatsApp > Dispositivos vinculados > Vincular dispositivo');
    console.log('⏳ Esperando escaneo...\n');
  });

  // Evento: Cliente listo y autenticado
  client.on('ready', () => {
    console.log('✅ WhatsApp Bot conectado y listo!');
    console.log(`📞 Conectado como: ${client.info.pushname}`);
    console.log(`📱 Número: ${client.info.wid.user}`);
    isReady = true;
  });

  // Evento: Autenticación exitosa
  client.on('authenticated', () => {
    console.log('🔓 Autenticación exitosa');
  });

  // Evento: Error de autenticación
  client.on('auth_failure', (msg) => {
    console.error('❌ Error de autenticación:', msg);
  });

  // Evento: Mensaje recibido
  client.on('message', async (message) => {
    // Ignorar mensajes de grupos si lo deseas
    const isGroup = message.from.includes('@g.us');
    
    console.log('📨 Mensaje recibido:', {
      from: message.from,
      fromName: message._data.notifyName || 'Desconocido',
      body: message.body,
      isGroup: isGroup,
      timestamp: new Date()
    });

    // Ejecutar callback personalizado
    if (onMessageReceived) {
      try {
        await onMessageReceived(message);
      } catch (error) {
        console.error('Error en callback de mensaje:', error);
      }
    }
  });

  // Evento: Cliente desconectado
  client.on('disconnected', (reason) => {
    console.log('❌ Cliente desconectado:', reason);
    isReady = false;
    console.log('🔄 Intentando reconectar...');
  });

  // Evento: Loading screen
  client.on('loading_screen', (percent, message) => {
    console.log('⏳ Cargando...', percent, message);
  });

  // Inicializar cliente
  console.log('🚀 Inicializando cliente de WhatsApp con LocalAuth...');
  console.log('💾 Sesión se guardará en: ./.wwebjs_auth');
  client.initialize();

  return client;
}

/**
 * Obtiene la instancia del cliente
 * @returns {Client|null}
 */
export function getClient() {
  return client;
}

/**
 * Verifica si el cliente está listo
 * @returns {boolean}
 */
export function isClientReady() {
  return isReady;
}

/**
 * Formatea un número de teléfono al formato de WhatsApp
 * @param {string} phone - Número de teléfono
 * @returns {string} - Número formateado (ej: 5491112345678@c.us)
 */
export function formatPhoneNumber(phone) {
  // Remover caracteres no numéricos
  let cleanPhone = phone.replace(/\D/g, '');
  
  // Si no tiene código de país, asumir Argentina (54)
  if (!cleanPhone.startsWith('54') && cleanPhone.length === 10) {
    cleanPhone = '54' + cleanPhone;
  }
  
  // Agregar sufijo de WhatsApp si no lo tiene
  if (!cleanPhone.includes('@c.us')) {
    cleanPhone = cleanPhone + '@c.us';
  }
  
  return cleanPhone;
}