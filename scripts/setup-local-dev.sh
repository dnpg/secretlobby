#!/bin/bash

# ============================================================================
# secretlobby.co - Local Development Setup Script
# ============================================================================
# This script sets up the local development environment:
# 1. Adds required entries to /etc/hosts
# 2. Verifies Docker is running
# 3. Provides instructions for starting services
# ============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo ""
echo "============================================================"
echo "  secretlobby.co - Local Development Setup"
echo "============================================================"
echo ""

# ─────────────────────────────────────────────────────────────
# 1. Check and update /etc/hosts
# ─────────────────────────────────────────────────────────────

HOSTS_FILE="/etc/hosts"
HOSTS_ENTRIES=(
    "secretlobby.local"
    "www.secretlobby.local"
    "console.secretlobby.local"
    "admin.secretlobby.local"
    "demo.secretlobby.local"
)

echo -e "${BLUE}Step 1: Checking /etc/hosts entries...${NC}"
echo ""

MISSING_ENTRIES=()

for entry in "${HOSTS_ENTRIES[@]}"; do
    if grep -q "$entry" "$HOSTS_FILE" 2>/dev/null; then
        echo -e "  ${GREEN}✓${NC} $entry"
    else
        echo -e "  ${YELLOW}✗${NC} $entry (missing)"
        MISSING_ENTRIES+=("$entry")
    fi
done

echo ""

if [ ${#MISSING_ENTRIES[@]} -gt 0 ]; then
    echo -e "${YELLOW}The following entries need to be added to /etc/hosts:${NC}"
    echo ""
    echo "127.0.0.1 ${MISSING_ENTRIES[*]}"
    echo ""

    read -p "Would you like to add them now? (requires sudo) [y/N] " -n 1 -r
    echo ""

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo ""
        echo "Adding entries to /etc/hosts..."

        # Create backup
        sudo cp "$HOSTS_FILE" "${HOSTS_FILE}.backup.$(date +%Y%m%d%H%M%S)"

        # Add entries
        echo "" | sudo tee -a "$HOSTS_FILE" > /dev/null
        echo "# secretlobby.co local development" | sudo tee -a "$HOSTS_FILE" > /dev/null
        echo "127.0.0.1 ${MISSING_ENTRIES[*]}" | sudo tee -a "$HOSTS_FILE" > /dev/null

        echo -e "${GREEN}✓ Entries added successfully!${NC}"
    else
        echo ""
        echo -e "${YELLOW}Skipped. You can manually add these entries later:${NC}"
        echo ""
        echo "  sudo sh -c 'echo \"127.0.0.1 ${MISSING_ENTRIES[*]}\" >> /etc/hosts'"
        echo ""
    fi
else
    echo -e "${GREEN}✓ All /etc/hosts entries are present!${NC}"
fi

echo ""

# ─────────────────────────────────────────────────────────────
# 2. Check Docker
# ─────────────────────────────────────────────────────────────

echo -e "${BLUE}Step 2: Checking Docker...${NC}"
echo ""

if command -v docker &> /dev/null; then
    if docker info &> /dev/null; then
        echo -e "  ${GREEN}✓${NC} Docker is installed and running"

        # Check if containers are running
        if docker ps --format '{{.Names}}' | grep -q "secretlobby"; then
            echo -e "  ${GREEN}✓${NC} SecretLobby containers are running"
        else
            echo -e "  ${YELLOW}✗${NC} SecretLobby containers are not running"
        fi
    else
        echo -e "  ${RED}✗${NC} Docker is installed but not running"
        echo ""
        echo "  Please start Docker Desktop and try again."
    fi
else
    echo -e "  ${RED}✗${NC} Docker is not installed"
    echo ""
    echo "  Please install Docker Desktop from: https://www.docker.com/products/docker-desktop"
fi

echo ""

# ─────────────────────────────────────────────────────────────
# 3. Check .env file
# ─────────────────────────────────────────────────────────────

echo -e "${BLUE}Step 3: Checking environment configuration...${NC}"
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_ROOT/.env"

if [ -f "$ENV_FILE" ]; then
    echo -e "  ${GREEN}✓${NC} .env file exists"

    # Check APP_DOMAIN
    if grep -q "APP_DOMAIN=secretlobby.local" "$ENV_FILE"; then
        echo -e "  ${GREEN}✓${NC} APP_DOMAIN is set correctly"
    else
        echo -e "  ${YELLOW}!${NC} APP_DOMAIN should be set to 'secretlobby.local' for local dev"
    fi
else
    echo -e "  ${RED}✗${NC} .env file not found"
    echo ""
    echo "  Please copy .env.example to .env and configure it."
fi

echo ""

# ─────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────

echo "============================================================"
echo -e "${GREEN}Setup Check Complete!${NC}"
echo "============================================================"
echo ""
echo "To start the development environment:"
echo ""
echo "  Option 1: Docker Compose (recommended for full stack)"
echo "  ─────────────────────────────────────────────────────────"
echo "  cd $PROJECT_ROOT"
echo "  docker-compose up"
echo ""
echo "  Then access:"
echo "    • Marketing:  http://secretlobby.local"
echo "    • Console:    http://console.secretlobby.local"
echo "    • Lobby:      http://demo.secretlobby.local"
echo "    • Admin:      http://admin.secretlobby.local"
echo ""
echo "  Option 2: Individual apps (for faster iteration)"
echo "  ─────────────────────────────────────────────────────────"
echo "  # Terminal 1 - Start database"
echo "  docker-compose up postgres redis"
echo ""
echo "  # Terminal 2 - Start apps"
echo "  pnpm dev"
echo ""
echo "  Then access (direct ports, no subdomains):"
echo "    • Marketing:  http://localhost:3000"
echo "    • Console:    http://localhost:3001"
echo "    • Lobby:      http://localhost:3002"
echo ""
echo "Test Credentials:"
echo "─────────────────────────────────────────────────────────"
echo "  Console Login:  demo@example.com / user123"
echo "  Lobby Password: user123"
echo "============================================================"
echo ""
