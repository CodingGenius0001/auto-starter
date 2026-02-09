FROM ghcr.io/puppeteer/puppeteer:21

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV PUPPETEER_SKIP_DOWNLOAD=true

CMD ["npm", "start"]
