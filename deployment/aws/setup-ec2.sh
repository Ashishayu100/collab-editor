#!/bin/bash
set -e

echo "=== CollabEdit EC2 Setup ==="
echo ""

# ─── System Updates ─────────────────────────────────────
echo "1. Updating system packages..."
sudo apt-get update && sudo apt-get upgrade -y

# ─── Install Docker ─────────────────────────────────────
echo "2. Installing Docker..."
sudo apt-get install -y \
  ca-certificates curl gnupg lsb-release

sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Add ubuntu user to docker group so `docker`/`docker compose` work without sudo after re-login.
sudo usermod -aG docker ubuntu
echo "   Docker installed: $(docker --version)"

# ─── Install Nginx ──────────────────────────────────────
# This is the HOST-level reverse proxy (SSL termination, routing to the app containers) — a
# separate installation from the Nginx baked into the client Docker image, which only serves the
# built static SPA files inside its own container. See deployment/aws/nginx/collab-editor.conf.
echo "3. Installing Nginx..."
sudo apt-get install -y nginx
sudo systemctl enable nginx
echo "   Nginx installed: $(nginx -v 2>&1)"

# ─── Install Certbot (SSL) ─────────────────────────────
echo "4. Installing Certbot..."
sudo apt-get install -y certbot python3-certbot-nginx
echo "   Certbot installed: $(certbot --version 2>&1)"

# ─── Install Node.js (for the Prisma CLI, pg_dump, etc. outside the containers) ────
echo "5. Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs postgresql-client
echo "   Node.js installed: $(node --version)"

# ─── Create App Directory ──────────────────────────────
echo "6. Creating app directory..."
sudo mkdir -p /opt/collab-editor
sudo chown ubuntu:ubuntu /opt/collab-editor

# ─── Install Git ────────────────────────────────────────
echo "7. Ensuring Git is installed..."
sudo apt-get install -y git

# ─── Firewall ──────────────────────────────────────────
echo "8. Configuring UFW firewall..."
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw allow 3001/tcp  # API direct (optional — for testing before Nginx is confirmed working)
sudo ufw --force enable
echo "   Firewall enabled"

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "  1. Log out and back in (for the docker group membership to take effect)"
echo "  2. Clone your repo: git clone YOUR_REPO_URL /opt/collab-editor"
echo "  3. Create the env file: cp /opt/collab-editor/deployment/aws/.env.production.example /opt/collab-editor/.env.production"
echo "  4. Edit .env.production with your RDS and ElastiCache endpoints (nano /opt/collab-editor/.env.production)"
echo "  5. Run the deploy script: /opt/collab-editor/deployment/aws/deploy.sh"
