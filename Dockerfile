# Cloudflare Containers（や、ほかのサーバー）で動かすためのイメージ
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production TW_HOSTED=1 HOST=0.0.0.0 PORT=8080
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server.js config.example.yaml ./
COPY src ./src
COPY public ./public
COPY media ./media
COPY bin ./bin
COPY mcp ./mcp
EXPOSE 8080
CMD ["node", "server.js"]
