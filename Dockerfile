# Dhoop in a container: the same three steps as on any Node host (npm ci, next build, then the
# standalone server Next writes). The build needs the Agora App ID, which is public (it is in
# the page's own code):
#
#   docker build --build-arg NEXT_PUBLIC_AGORA_APP_ID=... -t dhoop .
#   docker run -p 3000:3000 -e NEXT_AGORA_APP_CERTIFICATE=... -e MURF_API_KEY=... \
#     -e DHOOP_TOOL_SECRET=... -e PUBLIC_BASE_URL=https://your.address dhoop
#
# Not built on the machine this was written on (it has no Docker). The hosted copy runs
# from render.yaml, which was.

# -- deps ----------------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci --include=dev

# -- build ---------------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
ARG NEXT_PUBLIC_AGORA_APP_ID
ENV NEXT_PUBLIC_AGORA_APP_ID=$NEXT_PUBLIC_AGORA_APP_ID
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# -- runner --------------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs && \
    mkdir -p /app/.data && chown nextjs:nodejs /app/.data

COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
