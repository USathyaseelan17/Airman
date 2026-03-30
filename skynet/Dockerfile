# Use official Node.js 20 image (alpine = lightweight Linux)
FROM node:20-alpine

# All commands run from /app inside the container
WORKDIR /app

# ── Layer caching trick ───────────────────────────────────────────────────────
# Copy package files BEFORE source code.
# Docker caches each step. If package.json hasn't changed,
# Docker skips npm install entirely on the next build — much faster.
COPY package*.json ./

# Install all dependencies listed in package.json
# This runs inside the container on Linux — completely separate
# from your local node_modules on Mac
RUN npm install

# Copy the rest of the source code
# .dockerignore ensures node_modules and .env are NOT copied
COPY . .

# Tell Docker this container listens on port 3000
EXPOSE 3000

# Start the server
# NODE_OPTIONS suppresses TypeScript warnings — same as your npm run dev
ENV NODE_OPTIONS="--no-warnings"
CMD ["npx", "ts-node", "src/index.ts"]