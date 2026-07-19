#!/bin/bash
# =============================================================================
# Cloud Divinity — Oracle VM Setup Script
# =============================================================================
# Run this ON the Oracle VM (SSH in first, then run this script).
#
# This script:
#   1. Installs Docker
#   2. Builds the divinity-cloud:latest Docker image (ARM64)
#   3. Enables Docker remote API on port 2375 (for the SaaS Worker)
#   4. Creates a test container to verify everything works
#
# Usage:
#   ssh ubuntu@141.148.134.178
#   sudo bash setup-cloud-divinity.sh
# =============================================================================

set -e

echo "=== 1. Install Docker ==="
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker ubuntu
    sudo systemctl enable docker
    sudo systemctl start docker
    echo "Docker installed."
else
    echo "Docker already installed: $(docker --version)"
fi

echo ""
echo "=== 2. Enable Docker remote API (port 2375) ==="
# The SaaS Worker needs to talk to Docker to spawn/sleep containers.
# We bind to localhost only — the Cloudflare tunnel provides external access.
sudo mkdir -p /etc/systemd/system/docker.service.d
sudo tee /etc/systemd/system/docker.service.d/override.conf > /dev/null << 'EOF'
[Service]
ExecStart=
ExecStart=/usr/bin/dockerd -H fd:// -H tcp://127.0.0.1:2375
EOF
sudo systemctl daemon-reload
sudo systemctl restart docker
echo "Docker remote API enabled on 127.0.0.1:2375"

echo ""
echo "=== 3. Clone the repo + build the Docker image ==="
if [ ! -d /home/ubuntu/divinityworks-desktop ]; then
    cd /home/ubuntu
    git clone https://github.com/ufuomazech62-cpu/divinityworks-desktop.git
fi
cd /home/ubuntu/divinityworks-desktop

# Pull latest
git fetch origin main
git reset --hard origin/main

# Build the Docker image (ARM64, matches the Oracle instance)
echo "Building divinity-cloud:latest (this takes ~10-15 minutes)..."
cd cloudflare/cloud-divinity
sudo docker build -t divinity-cloud:latest -f Dockerfile .
echo "Docker image built: $(sudo docker images divinity-cloud:latest)"

echo ""
echo "=== 4. Test: run a container ==="
echo "Starting test container..."
sudo docker run -d \
    --name divinity-test \
    -p 6080:6080 \
    -v divinity-test-data:/data \
    divinity-cloud:latest

echo "Waiting 15 seconds for the container to start..."
sleep 15

echo ""
echo "=== 5. Verify ==="
echo "Container status:"
sudo docker ps --filter name=divinity-test

echo ""
echo "noVNC should be accessible at:"
echo "  http://141.148.134.178:6080"
echo ""
echo "If you see the Divinity UI in the browser, the setup is complete!"
echo ""
echo "=== 6. Next steps ==="
echo "1. Update the Cloudflare tunnel ingress to route app.divinityworks.space"
echo "   to http://localhost:6080 (or to the Docker remote API on :2375)"
echo "2. The SaaS Worker's /api/cloud/spawn endpoint will create containers"
echo "   via the Docker API at http://localhost:2375"
echo "3. Users go to app.divinityworks.space → sign in → see Divinity in browser"
