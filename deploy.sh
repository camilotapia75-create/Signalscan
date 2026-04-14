#!/bin/bash
set -e

# Paste your token from vercel.com/account/tokens
VERCEL_TOKEN="${VERCEL_TOKEN:-}"
if [ -z "$VERCEL_TOKEN" ]; then
  read -rp "Enter your Vercel token: " VERCEL_TOKEN
fi

echo "======================================"
echo "  Ad Lottery - Vercel Deploy Script"
echo "======================================"

# 1. Install Vercel CLI if not present
if ! command -v vercel &> /dev/null; then
  echo "Installing Vercel CLI..."
  npm install -g vercel
fi

# 2. Install dependencies
echo ""
echo "Installing dependencies..."
npm install

# 3. Deploy to Vercel (creates project, gets URL)
echo ""
echo "Deploying to Vercel..."
DEPLOY_URL=$(vercel deploy --token "$VERCEL_TOKEN" --yes --prod 2>&1 | tail -1)
echo "Deployed to: $DEPLOY_URL"

# 4. Get the project name from Vercel
PROJECT_NAME=$(vercel project ls --token "$VERCEL_TOKEN" 2>/dev/null | grep -m1 "ad-lottery\|Adwin\|adwin" | awk '{print $1}' || echo "")

echo ""
echo "======================================"
echo "  Next step: Add Postgres database"
echo "======================================"
echo ""
echo "Run these commands to finish setup:"
echo ""
echo "  1. Add Vercel Postgres (free):"
echo "     vercel storage create --token $VERCEL_TOKEN"
echo "     (choose Postgres, name it 'ad-lottery-db')"
echo ""
echo "  2. Or set DATABASE_URL manually:"
echo "     vercel env add DATABASE_URL --token $VERCEL_TOKEN"
echo "     vercel env add DIRECT_URL --token $VERCEL_TOKEN"
echo ""
echo "  3. Generate NEXTAUTH_SECRET:"
echo "     openssl rand -base64 32"
echo "     vercel env add NEXTAUTH_SECRET --token $VERCEL_TOKEN"
echo ""
echo "  4. Set NEXTAUTH_URL to your deployment URL:"
echo "     vercel env add NEXTAUTH_URL --token $VERCEL_TOKEN"
echo "     (enter: $DEPLOY_URL)"
echo ""
echo "  5. Redeploy with env vars:"
echo "     vercel deploy --token $VERCEL_TOKEN --yes --prod"
echo ""
echo "Done! Visit $DEPLOY_URL"
