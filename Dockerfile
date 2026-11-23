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
# Applies database migrations, then starts the server directly (exec, not through npm or npx):
# on a redeploy Railway stops the old container with SIGTERM; react-router-serve closes cleanly
# (exit 0), npm would report the signal as a failed command ("Deploy Crashed" emails).
CMD ["sh", "-c", "node scripts/start.mjs --prepare && exec ./node_modules/.bin/react-router-serve ./build/server/index.js"]
