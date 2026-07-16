FROM node:24.18.0-alpine3.23 AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY migrations ./migrations

RUN npm run build

FROM node:24.18.0-alpine3.23 AS production

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node migrations ./migrations
COPY --chown=node:node docs ./docs

EXPOSE 3000

USER node

CMD ["node", "dist/server.js"]
