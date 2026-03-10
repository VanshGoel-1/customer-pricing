# ── Stage 1: build ────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app
# Use npm install (not npm ci) so npm resolves the correct platform-specific
# native binaries for Linux/musl inside the container.
# The package-lock.json is intentionally excluded here — it is Windows-generated
# and would cause rollup/esbuild to pick up the wrong native module.
COPY package.json ./
# Install ALL deps including devDependencies — vite/rollup are needed to compile.
# This is the builder stage only; the final Nginx image gets just the compiled /dist,
# so dev packages never reach production.
RUN npm install
COPY . .
RUN npm run build

# ── Stage 2: serve via Nginx ──────────────────────────────────────────────
FROM nginx:1.27-alpine

# Remove default config
RUN rm /etc/nginx/conf.d/default.conf

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/app.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
