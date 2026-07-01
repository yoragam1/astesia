# Docker Optimization (Zero-Root)

## 1. Metadata
- **Name:** `docker-optimization`
- **Origin:** `Astesia Core`
- **Description:** `Provides standards for building secure, minimal, production-ready Docker containers with multi-stage builds and non-root execution.`

## 2. When to Use
Invoke this skill in the **DevOps Layer** when containerizing the application. This is mandatory for generating the project's `Dockerfile`.

## 3. Practical Guidance
1. **Multi-Stage Builds:** Never ship development dependencies or build tools to production. Use a `build` stage to compile/bundle the app, and copy only the necessary artifacts to a lean `production` stage.
2. **Minimal Base Images:** Use Alpine Linux (`-alpine`) or distroless base images to minimize the attack surface and image size.
3. **Non-Root Execution:** By default, Docker runs as root. This is a severe security risk. You MUST create a dedicated user (or use the built-in `node` user) and use the `USER` instruction before the `CMD`.
4. **Caching:** Copy `package.json` and install dependencies *before* copying the rest of the source code. This leverages Docker layer caching to speed up builds.
5. **No Hardcoded Secrets:** Never use `ENV` to store sensitive data like database passwords or API keys in the Dockerfile.

## 4. Tested Examples

### ✅ Gold Standard: Node.js Multi-Stage Non-Root Dockerfile
```dockerfile
# Stage 1: Build dependencies and compile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Production image
FROM node:20-alpine AS runner
WORKDIR /app

# Set environment
ENV NODE_ENV=production

# Install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy built artifacts from the builder stage
COPY --from=builder /app/dist ./dist

# Security: Run as non-root user (node user is built-in to the image)
USER node

EXPOSE 3000

# Start command
CMD ["node", "dist/index.js"]
```
