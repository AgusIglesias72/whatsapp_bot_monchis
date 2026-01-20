# Dockerfile optimizado para WhatsApp Bot - Railway
# Versión con reducción de RAM y dependencias mínimas necesarias
# Build date: 2026-01-20
FROM node:20-bullseye-slim

# Instalar SOLO dependencias esenciales para Chromium (reducir tamaño de imagen)
RUN apt-get update && apt-get install -y \
    chromium \
    chromium-sandbox \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libgbm1 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    ca-certificates \
    --no-install-recommends \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    && rm -rf /tmp/* /var/tmp/*

# Directorio de trabajo
WORKDIR /app

# Copiar package.json y package-lock.json
COPY package*.json ./

# Instalar dependencias de Node.js (solo producción)
RUN npm ci --only=production && npm cache clean --force

# Copiar código fuente
COPY . .

# Variables de entorno para optimizar Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV NODE_ENV=production

# Puerto (Railway lo asigna dinámicamente, pero lo exponemos)
EXPOSE 3000

# Usuario no-root para mayor seguridad
RUN groupadd -r appuser && useradd -r -g appuser appuser
RUN chown -R appuser:appuser /app
USER appuser

# Comando de inicio (npm start ejecutará el comando optimizado del package.json)
CMD ["npm", "start"]

