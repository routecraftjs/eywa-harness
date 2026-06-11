# Build stage
FROM oven/bun:1.3.9 AS deps
WORKDIR /app
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile || bun install

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
