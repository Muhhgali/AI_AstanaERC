#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> AI_AstanaERC local bootstrap"
echo "    folder: $ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo "Install Node.js 20+ first: https://nodejs.org"
  exit 1
fi

echo "==> node $(node -v)"

if [[ ! -f package-lock.json ]]; then
  echo "Run this script from the cloned repository root."
  exit 1
fi

npm ci

if [[ ! -f .env.local ]]; then
  cp .env.example .env.local
  echo "==> Created .env.local — fill secrets before npm run dev"
else
  echo "==> .env.local already exists (not overwritten)"
fi

echo ""
echo "Next steps:"
echo "  1. Edit .env.local (Supabase + OPENAI_API_KEY + VISITOR_TOKEN_SECRET)"
echo "  2. npm run check:env"
echo "  3. npm run dev"
echo "  4. open http://localhost:3000"
echo ""
echo "OCR branch (if not already): git checkout cursor/ocr-vision-receipts-8b22"
