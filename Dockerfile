FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
# Same origin in production: Caddy serves this and proxies /api/* to the API,
# which is what makes the session cookie a first-party cookie.
ARG VITE_API_URL=https://app.bealegend.app
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM caddy:2.10-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
EXPOSE 80
