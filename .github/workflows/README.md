# CI/CD Pipeline Documentation

## Overview
This GitHub Actions workflow automatically builds, pushes Docker images to Docker Hub, and deploys to your GCP VM whenever code is pushed to the main branch.

## Features
- ✅ Automatic version increment (e.g., 0.1 → 0.2 → 0.3)
- ✅ Multi-platform Docker builds (AMD64 and ARM64)
- ✅ Docker Hub push with versioned tags
- ✅ Zero-downtime deployment to GCP VM
- ✅ Automatic GitHub releases
- ✅ Container health verification
- ✅ Docker cache optimization

## Required GitHub Secrets

Set these secrets in your repository settings (Settings → Secrets and variables → Actions):

### Docker Hub Secrets
- `DOCKER_USERNAME`: Your Docker Hub username
- `DOCKER_PASSWORD`: Your Docker Hub personal access token
- `DOCKER_IMAGE`: Your Docker Hub repository name (e.g., `my-app`)
- `DOCKER_TAG`: Current version tag (e.g., `0.1`) - **This will be auto-incremented**

### GCP VM Secrets
- `VM_HOST`: Your GCP VM's external IP address
- `VM_USERNAME`: SSH username for your VM (usually your Google account username)
- `SSH_PRIVATE_KEY`: Your private SSH key content
- `SSH_PASSPHRASE`: Passphrase for your SSH key (if any)

## How It Works

### 1. Version Management
- Reads current version from `DOCKER_TAG` secret (e.g., "0.1")
- Increments minor version automatically (0.1 → 0.2)
- Tags Docker image with new version
- Creates GitHub release with version info

### 2. Docker Build & Push
- Builds multi-platform Docker image
- Pushes to Docker Hub with both version tag and `latest`
- Uses GitHub Actions cache for faster builds

### 3. Deployment
- SSH into your GCP VM
- Stops existing container gracefully
- Pulls new Docker image
- Starts container with new version
- Verifies deployment success

### 4. Cleanup
- Removes unused Docker images
- Shows container logs for verification

## Manual Deployment
You can trigger the workflow manually:
1. Go to Actions tab in GitHub
2. Select "Deploy to GCP VM" workflow
3. Click "Run workflow"

## Version History
Each deployment creates:
- Git tag (e.g., `v0.2`)
- GitHub release with deployment details
- Docker image with version tag

## Troubleshooting

### Common Issues
1. **SSH Connection Failed**: Check VM_HOST, VM_USERNAME, and SSH keys
2. **Docker Login Failed**: Verify DOCKER_USERNAME and DOCKER_PASSWORD
3. **Image Pull Failed**: Ensure Docker Hub repository exists and is accessible
4. **Port Already in Use**: The workflow stops existing containers before starting new ones

### Logs
- Check GitHub Actions logs for build/deployment issues
- Container logs are shown at the end of deployment
- Use `docker logs my-app-container` on VM for runtime issues

## Security Notes
- SSH private keys are encrypted in GitHub secrets
- Docker Hub credentials use personal access tokens
- All secrets are masked in logs
- Container runs with restart policy for reliability