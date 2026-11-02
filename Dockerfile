FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
ENV NODE_ENV=production CACHE_DIR=/data/cache
# /data must exist and be owned by "node" BEFORE the volume is created, otherwise the cache cannot be written.
RUN mkdir -p /data/cache && chown -R node:node /data /app
VOLUME ["/data"]
EXPOSE 3000
USER node
CMD ["node", "src/index.js"]
