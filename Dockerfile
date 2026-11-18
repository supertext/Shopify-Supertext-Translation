# Supertext Translation for Shopify: the app backend (runs on Railway).
FROM node:26-alpine
RUN apk add --no-cache openssl

WORKDIR /app
EXPOSE 3000

COPY package.json package-lock.json ./
RUN npm ci && npm cache clean --force

COPY . .
RUN npx prisma generate && npm run build && npm prune --omit=dev

ENV NODE_ENV=production
# Applies database migrations, then starts the server.
CMD ["npm", "run", "docker-start"]
