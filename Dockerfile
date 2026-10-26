# syntax=docker/dockerfile:1.7
# Production image: Next.js standalone server + bundled ops scripts (migrate, staff setup).
# Built by AWS CDK during `cdk deploy` (see infra/) and by CI as a build check.

ARG NODE_IMAGE=node:22-bookworm-slim

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM ${NODE_IMAGE} AS build
WORKDIR /app
# Inlined into the client bundle at build time, so each environment gets its own image.
ARG NEXT_PUBLIC_SITE_URL
ARG APP_ENV=production
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} \
    APP_ENV=${APP_ENV} \
    NEXT_OUTPUT=standalone \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN test -n "$NEXT_PUBLIC_SITE_URL" || (echo "NEXT_PUBLIC_SITE_URL build arg is required" && exit 1)
RUN npm run build && node scripts/bundle-ops.mjs

FROM ${NODE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    NODE_EXTRA_CA_CERTS=/etc/ssl/certs/rds-global-bundle.pem
# Amazon RDS certificate authorities (all regions) so TLS to the database is fully verified.
# (No --chmod on ADD: it would also apply to the parent folders it creates, making /etc/ssl
# unreadable for the non-root user, so Node could not load /etc/ssl/openssl.cnf.)
ADD https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /etc/ssl/certs/rds-global-bundle.pem
RUN chmod 0755 /etc/ssl /etc/ssl/certs && chmod 0644 /etc/ssl/certs/rds-global-bundle.pem
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/dist/ops ./dist/ops
COPY --from=build --chown=node:node /app/src/lib/server/db/migrations ./src/lib/server/db/migrations
COPY --chown=node:node docker/entrypoint.mjs ./entrypoint.mjs
# Writable photo storage for single-server deployments (STORAGE_DRIVER=local, mounted as a volume).
RUN mkdir -p /data/objects && chown -R node:node /data
USER node
EXPOSE 3000
ENTRYPOINT ["node", "/app/entrypoint.mjs"]
