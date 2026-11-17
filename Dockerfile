# ---- build the PWA ----
FROM node:22-alpine AS web
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
COPY shared/ /app/shared/
RUN npm run build

# ---- runtime ----
FROM node:22-alpine
ENV NODE_ENV=production \
    PUID=99 \
    PGID=100 \
    PORT=8080 \
    DATA_DIR=/data \
    WEB_DIR=/app/web/dist \
    IMPORT_ON_FIRST_RUN=true
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev
COPY server/ ./
COPY shared/ /app/shared/
COPY --from=web /app/web/dist /app/web/dist
RUN apk add --no-cache su-exec && mkdir -p /data
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "--disable-warning=ExperimentalWarning", "index.js"]
