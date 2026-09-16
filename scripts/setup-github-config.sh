#!/bin/bash
set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Carestead GitHub Configuration Setup${NC}"
echo "This script sets up required GitHub repository variables and secrets for CI/CD deployment."
echo ""

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo -e "${RED}Error: GitHub CLI (gh) is not installed.${NC}"
    echo "Install from: https://cli.github.com"
    exit 1
fi

# Check authentication
echo "Checking GitHub authentication..."
if ! gh auth status &> /dev/null; then
    echo -e "${RED}Error: Not authenticated with GitHub CLI.${NC}"
    echo "Run: gh auth login"
    exit 1
fi

echo -e "${GREEN}✓ GitHub CLI authenticated${NC}"
echo ""

# Prompt for configuration values
echo "Enter your Cloudflare configuration values:"
echo ""

read -p "Cloudflare Account ID: " ACCOUNT_ID
if [ -z "$ACCOUNT_ID" ]; then
    echo -e "${RED}Error: Account ID is required${NC}"
    exit 1
fi

read -p "Cloudflare API Token: " API_TOKEN
if [ -z "$API_TOKEN" ]; then
    echo -e "${RED}Error: API Token is required${NC}"
    exit 1
fi

read -p "D1 Database ID [f14ec851-7d05-4fb0-8db0-1874d86caeec]: " DB_ID
DB_ID=${DB_ID:-f14ec851-7d05-4fb0-8db0-1874d86caeec}

read -p "D1 Database Name [carestead]: " DB_NAME
DB_NAME=${DB_NAME:-carestead}

read -p "Worker Name [carestead]: " WORKER_NAME
WORKER_NAME=${WORKER_NAME:-carestead}

echo ""
echo "Setting up GitHub repository variables and secrets..."
echo ""

# Set repository variables (not secrets - these are non-sensitive)
echo -n "Setting CLOUDFLARE_D1_DATABASE_ID... "
gh variable set CLOUDFLARE_D1_DATABASE_ID --body "$DB_ID" 2>/dev/null && echo -e "${GREEN}✓${NC}" || echo -e "${RED}✗${NC}"

echo -n "Setting CLOUDFLARE_D1_DATABASE_NAME... "
gh variable set CLOUDFLARE_D1_DATABASE_NAME --body "$DB_NAME" 2>/dev/null && echo -e "${GREEN}✓${NC}" || echo -e "${RED}✗${NC}"

echo -n "Setting CLOUDFLARE_WORKER_NAME... "
gh variable set CLOUDFLARE_WORKER_NAME --body "$WORKER_NAME" 2>/dev/null && echo -e "${GREEN}✓${NC}" || echo -e "${RED}✗${NC}"

# Set secrets (sensitive values)
echo -n "Setting CLOUDFLARE_ACCOUNT_ID... "
gh secret set CLOUDFLARE_ACCOUNT_ID --body "$ACCOUNT_ID" 2>/dev/null && echo -e "${GREEN}✓${NC}" || echo -e "${RED}✗${NC}"

echo -n "Setting CLOUDFLARE_API_TOKEN... "
gh secret set CLOUDFLARE_API_TOKEN --body "$API_TOKEN" 2>/dev/null && echo -e "${GREEN}✓${NC}" || echo -e "${RED}✗${NC}"

echo ""
echo -e "${GREEN}Configuration setup complete!${NC}"
echo ""
echo "Configured values:"
echo "  D1 Database ID: $DB_ID"
echo "  D1 Database Name: $DB_NAME"
echo "  Worker Name: $WORKER_NAME"
echo ""
echo "Next steps:"
echo "1. Verify secrets in GitHub: gh secret list"
echo "2. Verify variables in GitHub: gh variable list"
echo "3. Trigger deployment: git push origin main"
echo ""
