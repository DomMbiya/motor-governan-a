# Interface do Motor de Governança (Next.js, saída standalone).
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY scripts ./scripts
RUN npm ci --no-audit --no-fund

FROM node:20-alpine AS build
WORKDIR /app
# Os rewrites do Next são resolvidos no build: a interface só fala com a API interna.
ARG BACKEND_URL=http://backend:8000
ENV BACKEND_URL=$BACKEND_URL NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S web && adduser -S web -G web
COPY --from=build --chown=web:web /app/.next/standalone ./
COPY --from=build --chown=web:web /app/.next/static ./.next/static
COPY --from=build --chown=web:web /app/public ./public
USER web
EXPOSE 3000
CMD ["node", "server.js"]
