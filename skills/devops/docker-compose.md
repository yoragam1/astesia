# Skill: Docker Compose Multi-Service

## 1. Metadata
- **Name:** `docker-compose`
- **Origin:** `Astesia Core`
- **Description:** Multi-service Docker Compose orchestration patterns for development and production. Enforces DevOps Rules (Immutable Infrastructure, Security First, Observability).

## 2. When to Use
Invoke this skill when:
- Setting up a local development environment with multiple services (app + db + cache).
- Creating a production-ready Docker Compose for VPS deployment (Scaling Phase 1).
- The DevOps Layer needs to containerize the application after Quality Layer passes.

## 3. Practical Guidance

### Development Compose
```yaml
# docker-compose.dev.yml
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
      target: development
    ports:
      - "${APP_PORT:-3000}:3000"
    volumes:
      - ./src:/app/src  # Hot reload
    env_file: .env
    depends_on:
      db:
        condition: service_healthy
    networks:
      - app-network

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: ${DB_NAME}
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    ports:
      - "${DB_PORT:-5432}:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER} -d ${DB_NAME}"]
      interval: 5s
      timeout: 5s
      retries: 5
    networks:
      - app-network

  redis:
    image: redis:7-alpine
    ports:
      - "${REDIS_PORT:-6379}:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5
    networks:
      - app-network

volumes:
  postgres-data:

networks:
  app-network:
    driver: bridge
```

### Production Compose
```yaml
# docker-compose.prod.yml
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
      target: production
    ports:
      - "3000:3000"
    env_file: .env.production
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped
    # Security: non-root user enforced in Dockerfile
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '0.5'
    networks:
      - app-network

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: ${DB_NAME}
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER} -d ${DB_NAME}"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 256M
    networks:
      - app-network

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/certs:/etc/nginx/certs:ro
    depends_on:
      - app
    restart: unless-stopped
    networks:
      - app-network

volumes:
  postgres-data:

networks:
  app-network:
    driver: bridge
```

### Multi-Stage Dockerfile (DevOps Rule #1 & #2 Compliant)
```dockerfile
# --- Base ---
FROM node:20-alpine AS base
WORKDIR /app
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# --- Dependencies ---
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# --- Development ---
FROM base AS development
COPY --from=deps /app/node_modules ./node_modules
COPY . .
USER appuser
CMD ["npm", "run", "dev"]

# --- Build ---
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build
RUN npm prune --production

# --- Production ---
FROM base AS production
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
USER appuser
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

### Environment Variables Pattern
```env
# .env.example (committed to repo — NO secrets)
APP_PORT=3000
DB_NAME=myapp
DB_USER=postgres
DB_PASSWORD=CHANGE_ME
DB_PORT=5432
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@db:${DB_PORT}/${DB_NAME}
REDIS_PORT=6379
NODE_ENV=development
```

## 4. Tested Examples

### Health Check Endpoint (Required for Compose)
```typescript
// src/routes/health.ts
app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});
```

### Commands
```bash
# Development
docker compose -f docker-compose.dev.yml up -d

# Production
docker compose -f docker-compose.prod.yml up -d --build

# Logs
docker compose logs -f app

# Rebuild single service
docker compose up -d --build app
```
