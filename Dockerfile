FROM node:22-slim

# Install build dependencies for native node addons (better-sqlite3)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy root and package manifests
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/

# Install backend dependencies inside Linux container
WORKDIR /app/backend
RUN npm install

# Install frontend dependencies inside Linux container
WORKDIR /app/frontend
RUN npm install

# Copy application source code
WORKDIR /app
COPY . .

# Build frontend production dist
WORKDIR /app/frontend
RUN npm run build

# Expose Cloud Run default port
EXPOSE 8080
ENV PORT=8080

WORKDIR /app/backend
CMD ["node", "src/server.js"]
