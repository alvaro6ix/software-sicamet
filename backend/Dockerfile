FROM node:20-slim

# Instalar dependencias para Puppeteer (WhatsApp-web.js) y Python
RUN apt-get update && apt-get install -y \
    chromium \
    python3 \
    python3-pip \
    fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Instalar pdfplumber para el parser de IA (en Debian 12 requiere break-system-packages)
RUN pip3 install pdfplumber --break-system-packages

# Configurar variables de entorno para que el bot encuentre Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./
RUN npm install

# Copiar el resto del código
COPY . .

EXPOSE 3001

CMD ["node", "index.js"]
