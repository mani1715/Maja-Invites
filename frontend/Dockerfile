# Frontend image — multi-stage: build the React app, then serve it with Caddy
# (Caddy also reverse-proxies /api/* to the backend and does automatic HTTPS).

# ---- build stage ----
FROM node:20-bookworm AS build
WORKDIR /app

# Build-time public config (baked into the static bundle).
ARG REACT_APP_BACKEND_URL=""
ARG REACT_APP_SUPABASE_URL
ARG REACT_APP_SUPABASE_ANON_KEY
ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL \
    REACT_APP_SUPABASE_URL=$REACT_APP_SUPABASE_URL \
    REACT_APP_SUPABASE_ANON_KEY=$REACT_APP_SUPABASE_ANON_KEY \
    CI=false

COPY package.json yarn.lock* ./
RUN corepack enable && yarn install --network-timeout 600000
COPY . ./
RUN yarn build

# ---- serve stage ----
FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/build /srv
