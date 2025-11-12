# Bot de WhatsApp - Railway

Bot de WhatsApp automatizado para envío de mensajes y gestión de conversaciones, deployado en Railway.

## 📋 Características

- ✅ Envío de mensajes individuales
- ✅ Envío masivo de mensajes con rate limiting
- ✅ Recepción y procesamiento de mensajes entrantes
- ✅ Auto-respuestas personalizables
- ✅ Webhooks a tu backend de Vercel
- ✅ API REST para integración
- ✅ Persistencia de sesión de WhatsApp

## 🚀 Instalación Local

### 1. Clonar el repositorio
```bash
git clone <tu-repo>
cd whatsapp-bot-railway
```

### 2. Instalar dependencias
```bash
npm install
```

### 3. Configurar variables de entorno
```bash
cp .env.example .env
```

Edita el archivo `.env` con tus valores:
```env
PORT=3000
VERCEL_WEBHOOK_URL=https://tu-app.vercel.app/api/whatsapp/webhook
API_KEY=tu-api-key-super-secreta
NODE_ENV=development
```

### 4. Ejecutar en modo desarrollo
```bash
npm run dev
```

### 5. Escanear QR Code
1. Abre la terminal donde ejecutaste el comando
2. Verás un QR Code en la consola
3. Abre WhatsApp en tu teléfono
4. Ve a **Configuración > Dispositivos vinculados > Vincular dispositivo**
5. Escanea el QR Code
6. ¡Listo! El bot estará conectado

## 📦 Deploy en Railway

### Opción A: Desde GitHub (Recomendado)

1. **Sube tu código a GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin <tu-repo-github>
   git push -u origin main
   ```

2. **Conecta Railway con GitHub**
   - Ve a [Railway](https://railway.app)
   - Crea una cuenta o inicia sesión
   - Click en "New Project"
   - Selecciona "Deploy from GitHub repo"
   - Autoriza Railway a acceder a tus repos
   - Selecciona tu repositorio

3. **Configurar variables de entorno en Railway**
   - En el dashboard del proyecto, ve a "Variables"
   - Agrega las siguientes variables:
     ```
     PORT=3000
     VERCEL_WEBHOOK_URL=https://tu-app.vercel.app/api/whatsapp/webhook
     API_KEY=genera-una-api-key-segura-aqui
     NODE_ENV=production
     ```

4. **Deploy automático**
   - Railway detectará automáticamente Node.js
   - El deploy comenzará automáticamente
   - Espera unos minutos

5. **Escanear QR Code en Railway**
   - Ve a "Deployments" > Último deploy > "View Logs"
   - Busca el QR Code en los logs (aparecerá como caracteres ASCII)
   - Escanéalo con WhatsApp
   - Una vez escaneado, la sesión quedará guardada

6. **Obtener URL pública**
   - Ve a "Settings" > "Networking"
   - Click en "Generate Domain"
   - Copia la URL (ej: `https://tu-bot.railway.app`)

### Opción B: Desde Railway CLI

```bash
# Instalar Railway CLI
npm install -g @railway/cli

# Login
railway login

# Inicializar proyecto
railway init

# Deploy
railway up

# Abrir logs
railway logs
```

## 🔌 API Endpoints

### Health Check
```bash
GET https://tu-bot.railway.app/health
```

Respuesta:
```json
{
  "status": "ok",
  "whatsappReady": true,
  "timestamp": "2025-11-11T10:30:00.000Z"
}
```

### Enviar Mensaje Individual
```bash
POST https://tu-bot.railway.app/send-message
Headers:
  Content-Type: application/json
  X-API-Key: tu-api-key

Body:
{
  "phone": "5491112345678",
  "message": "¡Hola! Este es un recordatorio automático.",
  "type": "reminder"
}
```

### Enviar Mensajes Masivos
```bash
POST https://tu-bot.railway.app/send-bulk
Headers:
  Content-Type: application/json
  X-API-Key: tu-api-key

Body:
{
  "messages": [
    {
      "phone": "5491112345678",
      "message": "Recordatorio de capacitación mañana a las 10am"
    },
    {
      "phone": "5491198765432",
      "message": "Tu postulación está pendiente de completar"
    }
  ]
}
```

### Enviar Mensaje con Media
```bash
POST https://tu-bot.railway.app/send-with-media
Headers:
  Content-Type: application/json
  X-API-Key: tu-api-key

Body:
{
  "phone": "5491112345678",
  "message": "Aquí está el material de la capacitación",
  "mediaUrl": "https://ejemplo.com/imagen.jpg"
}
```

## 🔗 Integración con Vercel

### En tu proyecto de Vercel, crea el endpoint webhook:

**`pages/api/whatsapp/webhook.js`**
```javascript
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { from, message, fromName, timestamp } = req.body;
    
    console.log('Mensaje recibido de WhatsApp:', {
      from,
      fromName,
      message,
      timestamp
    });

    // Aquí puedes:
    // - Guardar en base de datos
    // - Procesar la respuesta del usuario
    // - Actualizar estado de postulaciones
    // - etc.

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Error procesando webhook:', error);
    res.status(500).json({ error: 'Error interno' });
  }
}
```

### Llamar al bot desde Vercel:

**`pages/api/send-reminder.js`**
```javascript
export default async function handler(req, res) {
  try {
    const response = await fetch('https://tu-bot.railway.app/send-message', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.WHATSAPP_BOT_API_KEY
      },
      body: JSON.stringify({
        phone: '5491112345678',
        message: 'Recordatorio: Tu capacitación es mañana a las 10am',
        type: 'capacitacion_reminder'
      })
    });

    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
```

## 📝 Formato de Números de Teléfono

Los números deben incluir el código de país SIN el símbolo `+`:

✅ Correcto:
- `5491112345678` (Argentina)
- `5215512345678` (México)
- `5491112345678@c.us` (con sufijo WhatsApp)

❌ Incorrecto:
- `+5491112345678` (con +)
- `1112345678` (sin código país)

## 🛡️ Seguridad

1. **API Key**: Siempre usa una API Key segura en producción
2. **Variables de entorno**: Nunca commitees el archivo `.env`
3. **Rate limiting**: El bot incluye delays entre mensajes para evitar bans
4. **Webhooks**: Valida el origen de los webhooks en tu backend

## 🐛 Troubleshooting

### El bot no se conecta
- Verifica que los logs muestren el QR Code
- Asegúrate de tener buena conexión a internet
- Revisa que WhatsApp esté actualizado en tu teléfono

### Error "phone number is not registered"
- El número no tiene WhatsApp instalado
- Verifica el formato del número (incluye código de país)

### El bot se desconecta constantemente
- Railway podría estar reiniciando el servicio
- Verifica los logs en Railway
- Considera usar RemoteAuth con base de datos para persistencia

### No llegan mensajes al webhook
- Verifica que `VERCEL_WEBHOOK_URL` esté correctamente configurada
- Revisa los logs del webhook en Vercel
- Asegúrate que el endpoint esté público

## 📚 Recursos

- [Documentación whatsapp-web.js](https://wwebjs.dev)
- [Railway Docs](https://docs.railway.app)
- [Express.js](https://expressjs.com)

## ⚠️ Limitaciones y Buenas Prácticas

1. **Rate Limiting**: No envíes más de 20-30 mensajes por minuto
2. **Contenido spam**: Evita enviar contenido repetitivo
3. **Opt-in**: Solo envía mensajes a personas que han aceptado recibirlos
4. **Números no registrados**: Maneja errores cuando el número no existe
5. **Persistencia**: Considera usar RemoteAuth con MongoDB para producción

## 📄 Licencia

MIT

## 🤝 Contribuciones

Las contribuciones son bienvenidas. Por favor abre un issue primero para discutir cambios mayores.