# Dockerfile
FROM ghcr.io/puppeteer/puppeteer:21

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

CMD ["npm", "start"]
