FROM node:24.22.2-alpine3.23@sha256:9b69af715c7f9d038150b54ccccbaeffa9064bbc93e2904c29591ca097316af1 AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY migrations ./migrations

RUN npm run build

FROM node:24.22.2-alpine3.23@sha256:9b69af715c7f9d038150b54ccccbaeffa9064bbc93e2904c29591ca097316af1 AS production

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
