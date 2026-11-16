# Hosted copy: one container serving the app and the API on port 5174.
# Mount a persistent volume at /app/data (database, documents, backups).
FROM node:24-slim
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
ENV NODE_ENV=production HOST=0.0.0.0 PORT=5174
EXPOSE 5174
VOLUME ["/app/data"]
CMD ["node_modules/.bin/tsx", "server/index.ts"]
