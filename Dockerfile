# ── CodeClash — Production Dockerfile ──────────────────────────────
# Node 20 slim + OpenJDK + g++ for the server-side judge
# Compatible with: Railway, Fly.io, any Docker host
# ────────────────────────────────────────────────────────────────────
FROM node:20-slim

# Install Java (for javac / java) and C++ compiler (g++)
RUN apt-get update && apt-get install -y --no-install-recommends \
    default-jdk \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Install deps first (layer caching: only re-runs if package.json changes)
COPY package*.json ./
RUN npm install --omit=dev

# Copy the rest of the source
COPY . .

# Expose the port the server listens on
EXPOSE 3000

# Start the server
CMD ["node", "server/index.js"]
