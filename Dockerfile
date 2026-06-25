# ── Stage 1: Build ──────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

# Accept VITE_* variables as build-time ARGs so they are inlined by Vite.
# Pass them with --build-arg VITE_ADMIN_URL=https://... at docker build time.
ARG VITE_ADMIN_URL=http://localhost:8081
ARG VITE_OAUTH_URL=http://localhost:8080
ARG VITE_CLIENT_ID=security-monitor
ARG VITE_REDIRECT_URI=http://localhost:5181/callback
ARG VITE_SCOPES=openid,profile,email
ARG VITE_ADMIN_ROLES=admin,monitor_admin
ARG VITE_VIEWER_ROLES=monitor_viewer

# Expose as ENV so Vite picks them up during the build
ENV VITE_ADMIN_URL=$VITE_ADMIN_URL
ENV VITE_OAUTH_URL=$VITE_OAUTH_URL
ENV VITE_CLIENT_ID=$VITE_CLIENT_ID
ENV VITE_REDIRECT_URI=$VITE_REDIRECT_URI
ENV VITE_SCOPES=$VITE_SCOPES
ENV VITE_ADMIN_ROLES=$VITE_ADMIN_ROLES
ENV VITE_VIEWER_ROLES=$VITE_VIEWER_ROLES

WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts

COPY . .
RUN npm run build

# ── Stage 2: Serve ───────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine

# Copy built SPA from builder stage
COPY --from=builder --chown=nginx:nginx /app/dist /usr/share/nginx/html

# Copy Nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
