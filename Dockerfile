# Posts API + admin management HTTP server (zero runtime npm dependencies).
FROM node:22-alpine
WORKDIR /app

# su-exec for entrypoint privilege drop; wget optional (healthcheck uses node fetch).
RUN apk add --no-cache su-exec \
  && mkdir -p /data/cache /data/management /app/src \
  && chown -R node:node /data /app

COPY package.json ./
COPY src ./src
COPY scripts/docker-entrypoint-api.sh /entrypoint.sh
# Strip CR so Windows autocrlf checkouts cannot break the Alpine shebang (`exec ... no such file`).
RUN sed -i 's/\r$//' /entrypoint.sh && chmod +x /entrypoint.sh && chown node:node /entrypoint.sh

ENV NODE_ENV=production \
    CACHE_DIR=/data/cache \
    MANAGEMENT_DIR=/data/management \
    HOST=0.0.0.0 \
    PORT=3000

VOLUME ["/data"]
EXPOSE 3000

# Entrypoint starts as root only long enough to fix volume ownership, then runs as node.
USER root
ENTRYPOINT ["/entrypoint.sh"]
