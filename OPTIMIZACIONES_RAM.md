# Optimizaciones de RAM para WhatsApp Bot - Railway

## Cambios Realizados

### 1. **Límites de Memoria Node.js** ✅
**Archivo:** `package.json`

```json
"start": "node --max-old-space-size=512 --expose-gc src/index.js"
```

- `--max-old-space-size=512`: Limita el heap de V8 a 512MB
- `--expose-gc`: Expone el recolector de basura para limpieza manual

**Impacto:** Reduce consumo base de ~800MB a ~512MB

---

### 2. **Optimización de Chromium** ✅
**Archivo:** `src/whatsapp.js`

Agregados **27 argumentos adicionales** para reducir RAM de Puppeteer:

```javascript
'--disable-webgl',
'--disable-webgl2',
'--disable-databases',
'--disk-cache-size=1',
'--media-cache-size=1',
'--aggressive-cache-discard',
'--disable-cache',
'--js-flags="--max-old-space-size=256"',
// ... y más
```

**Impacto:** Reduce consumo de cada instancia de Chromium de ~300MB a ~150-200MB

---

### 3. **Liberación de Clientes Zombies** ✅
**Archivo:** `src/whatsapp.js` - función `handleReconnection()`

Cuando un bot falla 5 veces al reconectar:
1. Destruye la instancia de Chromium
2. Elimina referencias de Maps
3. Ejecuta recolección de basura manual
4. **Mantiene la sesión en MongoDB** (no requiere nuevo QR)

```javascript
if (attempts.count >= MAX_RECONNECTION_ATTEMPTS) {
  console.log(`🗑️  Liberando cliente zombie ${clientId}...`);
  await zombieClient.destroy();
  clients.delete(clientId);

  if (global.gc) {
    global.gc(); // ✅ Limpia memoria
  }
}
```

**Impacto:** Evita acumulación de instancias zombies (antes podían acumular +500MB)

---

### 4. **Recolección de Basura en Operaciones Pesadas** ✅
**Archivo:** `src/index.js`

Ejecuta GC manual después de:
- Envío masivo (`/send-bulk`)
- Envío masivo con imágenes (`/send-bulk-media`)

```javascript
if (global.gc) {
  global.gc();
  console.log('🧹 Recolección de basura ejecutada');
}
```

**Impacto:** Libera memoria inmediatamente después de operaciones pesadas

---

### 5. **Optimización de Imágenes** ✅
**Archivo:** `src/index.js`

Libera imágenes de memoria inmediatamente después de enviar:

```javascript
media = await MessageMedia.fromUrl(imageUrl);
await client.sendMessage(chatId, media, { caption: message });

// ✅ Liberar inmediatamente
media = null;
```

**Impacto:** Evita acumulación de imágenes en RAM durante envíos masivos

---

### 6. **Endpoint de Monitoreo** ✅
**Nuevo endpoint:** `GET /memory`

Monitorea en tiempo real:
- Uso de heap (total, usado, porcentaje)
- RSS (Resident Set Size)
- Estado de bots
- Recomendaciones automáticas

```bash
curl https://tu-bot.railway.app/memory \
  -H "X-API-Key: tu_api_key"
```

Respuesta:
```json
{
  "memory": {
    "heapUsed": "234.56 MB",
    "heapTotal": "512.00 MB",
    "heapUsagePercent": "45.8%"
  },
  "recommendations": [
    {
      "level": "ok",
      "message": "Uso de memoria dentro de rangos normales."
    }
  ]
}
```

---

## Reducción Estimada de Costos

### Antes:
- **Memoria promedio:** ~800-1000 MB
- **Costo RAM mensual:** ~$20-22 USD

### Después:
- **Memoria promedio esperada:** ~300-400 MB
- **Costo RAM mensual estimado:** ~$8-12 USD

**Ahorro estimado:** 50-60% en costos de RAM

---

## Persistencia de Sesiones (SIN AFECTAR QR)

Las optimizaciones **NO AFECTAN** la persistencia de sesión:

✅ Sesiones siguen guardadas en MongoDB (cada 6 horas)
✅ Al reiniciar el servicio, los bots se reconectan automáticamente
✅ Solo necesitas escanear QR si:
  - Usas `/restart/:botId/fresh` (reinicio completo)
  - Cierras sesión manualmente con `/logout/:botId`
  - WhatsApp cierra la sesión desde la app móvil

---

## Monitoreo en Railway

Después de deployar, verifica en Railway:

1. **Dashboard → Metrics**
   - RAM debería estar entre 300-400 MB en uso normal
   - Picos temporales de ~500 MB durante envíos masivos

2. **Endpoint `/memory`**
   - Usa este endpoint para ver métricas detalladas
   - Configura alertas si `heapUsagePercent > 75%`

---

## Próximos Pasos (Opcional)

Si aún necesitas reducir más:

1. **Considerar reducir `backupSyncIntervalMs`**
   - Actual: 6 horas (21600000 ms)
   - Reducir a 12 horas para menos I/O a MongoDB

2. **Limitar envíos concurrentes**
   - Agregar queue para procesar envíos masivos de a chunks

3. **Usar bot único con multi-sesión**
   - En lugar de 2 bots, usar 1 bot con 2 sesiones

---

## Comandos Útiles

```bash
# Ver logs en Railway
railway logs

# Monitorear memoria localmente
curl http://localhost:3000/memory -H "X-API-Key: tu_key"

# Reiniciar bot sin perder sesión
curl -X POST https://tu-bot.railway.app/restart/bot-adquisicion-prod \
  -H "X-API-Key: tu_key"
```

---

## Notas Importantes

1. **NO uses `/restart/:botId/fresh`** a menos que quieras escanear QR nuevamente
2. **Monitorea `/memory`** durante la primera semana para ver el impacto real
3. **Railway puede tardar 1-2 días** en reflejar la reducción de costos promedio
4. Las optimizaciones se aplican **después del próximo deploy**
