# Multi-stage build for React/TypeScript application with Vite
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production image - Node.js serve
FROM node:20-alpine

# Install serve globally for serving static files
RUN npm install -g serve

WORKDIR /app

# Copy built application
COPY --from=builder /app/dist ./dist

# Expose port 3000
EXPOSE 3000

# Start the application using serve
CMD ["serve", "-s", "dist", "-l", "3000"]