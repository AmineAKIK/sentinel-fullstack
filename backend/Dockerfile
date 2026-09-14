FROM node:24.21.0-alpine3.23@sha256:159fe64649038c30f8cc1ec4be3af3a6e93e3648678c31294e2c5058dbeb99f3 AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY migrations ./migrations

RUN npm run build

FROM node:24.21.0-alpine3.23@sha256:159fe64649038c30f8cc1ec4be3af3a6e93e3648678c31294e2c5058dbeb99f3 AS production

WORKDIR /app

ARG BUILD_SHA=unknown
ENV BUILD_SHA=$BUILD_SHA
LABEL org.opencontainers.image.revision=$BUILD_SHA \
      org.opencontainers.image.title=sentinel-backend

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node migrations ./migrations
COPY --chown=node:node docs ./docs

EXPOSE 3000

USER node

CMD ["node", "dist/server.js"]
