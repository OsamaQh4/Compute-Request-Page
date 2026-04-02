# ── Args — set these at build time or in your CI pipeline ─────────────────────
ARG HARBOR_URL=k8sreglvp01.gosi.ins:8080
ARG HARBOR_PROJECT=vm-portal

# ── Build stage ───────────────────────────────────────────────────────────────
FROM ${HARBOR_URL}/${HARBOR_PROJECT}/node:20-slim AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --frozen-lockfile 2>/dev/null || npm install

COPY . .
RUN npm run build

# ── Serve stage ───────────────────────────────────────────────────────────────
FROM ${HARBOR_URL}/${HARBOR_PROJECT}/nginx:1.27-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
