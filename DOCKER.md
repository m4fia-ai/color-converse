# Docker Setup for Color Converse

This document provides instructions for running the Color Converse application using Docker.

## Prerequisites

- Docker installed on your system
- Docker Compose (usually included with Docker Desktop)

## Environment Variables

Before running the application, you need to set up your environment variables:

1. Create a `.env` file in the project root
2. Add your Supabase configuration:

```env
VITE_SUPABASE_URL=your_supabase_project_url_here
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here
NODE_ENV=production
```

## Building and Running

### Option 1: Using Docker Compose (Recommended)

```bash
# Build and start the application
docker-compose up --build

# Run in detached mode
docker-compose up -d --build

# Stop the application
docker-compose down
```

The application will be available at `http://localhost:3000`

### Option 2: Using Docker directly

```bash
# Build the image
docker build -t color-converse .

# Run the container
docker run -p 3000:80 \
  -e VITE_SUPABASE_URL=your_supabase_url \
  -e VITE_SUPABASE_ANON_KEY=your_supabase_key \
  color-converse
```

## Development

For development with hot reloading, you might want to run the application locally instead:

```bash
npm install
npm run dev
```

## Architecture

The Docker setup includes:

- **Multi-stage build**: Optimized for production with minimal image size
- **Nginx**: Serves the static React build files
- **Node.js backend**: Handles MCP (Model Context Protocol) proxy functionality
- **Health checks**: Ensures the application is running correctly

## Features

- Static file serving with client-side routing support
- MCP proxy API endpoints (`/api/mcp-proxy/*`)
- Security headers and gzip compression
- Health monitoring
- Production-optimized build

## Troubleshooting

### Port conflicts
If port 3000 is already in use, modify the port mapping in `docker-compose.yml`:

```yaml
ports:
  - "3001:80"  # Change 3000 to any available port
```

### Environment variables not working
Make sure your `.env` file is in the same directory as `docker-compose.yml` and contains the correct Supabase configuration.

### MCP proxy issues
The MCP proxy runs on an internal port (3001) and is proxied through Nginx. If you experience issues, check the container logs:

```bash
docker-compose logs -f
```

## Production Deployment

For production deployment, consider:

1. Using a reverse proxy (like Nginx or Traefik) in front of the container
2. Setting up SSL/TLS certificates
3. Configuring proper logging and monitoring
4. Using Docker secrets for sensitive environment variables
5. Setting up container orchestration (Docker Swarm, Kubernetes)

## Security Notes

- The application includes basic security headers
- Environment variables should be kept secure
- Consider using Docker secrets in production
- Regularly update the base images for security patches