# Build stage
FROM oven/bun:1.3.9 AS deps
WORKDIR /app
# bun.lock, not bun.lockb: bun 1.2 replaced the binary lockfile with a text
# one. Globbing for the old name copied nothing, --frozen-lockfile failed for
# want of a lockfile, and the fallback silently re-resolved every range at
# build time. The image could then run versions the lockfile never pinned.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Runtime
FROM oven/bun:1.3.9
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NODE_ENV=production
ENV LOG_LEVEL=info

# App webhook receiver + MCP server
EXPOSE 3000
EXPOSE 3001

CMD ["bun", "run", "start"]
