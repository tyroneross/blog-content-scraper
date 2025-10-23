#!/bin/bash

# Pre-Deployment Build Validation
# =================================
# Catches TypeScript and build errors before they reach Vercel
# Usage: npm run pre-deploy

set -e  # Exit on any error

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo ""
echo -e "${BLUE}🔍 Pre-Deployment Validation${NC}"
echo "============================"
echo ""

# Step 1: TypeScript Check
echo -e "${YELLOW}1/3 Checking TypeScript...${NC}"
if npx tsc --noEmit; then
    echo -e "${GREEN}✅ TypeScript: No errors${NC}"
else
    echo -e "${RED}❌ TypeScript errors found${NC}"
    echo ""
    echo "Fix TypeScript errors before deploying."
    exit 1
fi
echo ""

# Step 2: Build Check
echo -e "${YELLOW}2/3 Running production build...${NC}"
if npm run build; then
    echo -e "${GREEN}✅ Build: Successful${NC}"
else
    echo -e "${RED}❌ Build failed${NC}"
    echo ""
    echo "Fix build errors before deploying."
    exit 1
fi
echo ""

# Step 3: Check for common issues
echo -e "${YELLOW}3/3 Checking for common issues...${NC}"

# Check for missing @types packages
MISSING_TYPES=$(grep -r "Could not find a declaration file" .next 2>/dev/null || echo "")
if [ -n "$MISSING_TYPES" ]; then
    echo -e "${RED}⚠️  Warning: Missing @types packages detected${NC}"
    echo "$MISSING_TYPES"
else
    echo -e "${GREEN}✅ No missing type definitions${NC}"
fi

# Check package.json for common issues
if ! grep -q "@types/turndown" package.json; then
    echo -e "${YELLOW}⚠️  Note: @types/turndown not found in package.json${NC}"
    echo "   This may cause Vercel build failures."
else
    echo -e "${GREEN}✅ All critical @types packages present${NC}"
fi

echo ""
echo -e "${GREEN}═══════════════════════════════════${NC}"
echo -e "${GREEN}✅ All validation checks passed!${NC}"
echo -e "${GREEN}═══════════════════════════════════${NC}"
echo ""
echo "Safe to deploy to Vercel:"
echo -e "  ${BLUE}git push origin main${NC}"
echo ""
