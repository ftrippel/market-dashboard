#!/bin/bash
# Fetch market data locally for development (writes public/data.json)

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo -e "${YELLOW}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║  Fetch Market Data Locally                                     ║${NC}"
echo -e "${YELLOW}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

if ! command -v uv &> /dev/null; then
  echo -e "${RED}✗ uv not found${NC}"
  echo "  Install uv from: https://docs.astral.sh/uv/getting-started/"
  exit 1
fi

echo -e "${GREEN}✓${NC} Using uv: ${YELLOW}$(uv --version)${NC}"
echo ""

echo -e "${YELLOW}Setting up virtual environment...${NC}"
uv venv --python 3.11 .venv 2>/dev/null || true
echo -e "${GREEN}✓${NC} Virtual environment ready"
echo ""

if [ -f ".venv/bin/python" ]; then
  PYTHON_CMD=".venv/bin/python"
elif [ -f ".venv/Scripts/python.exe" ]; then
  PYTHON_CMD=".venv/Scripts/python.exe"
else
  echo -e "${RED}✗ Virtual environment activation failed${NC}"
  exit 1
fi
# Load .env variables if present and not already set
if [ -f .env ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    if [[ ! "$line" =~ ^# ]] && [[ "$line" =~ = ]]; then
      key=$(echo "$line" | cut -d'=' -f1 | xargs)
      val=$(echo "$line" | cut -d'=' -f2- | xargs)
      val="${val%\"}"
      val="${val#\"}"
      val="${val%\'}"
      val="${val#\'}"
      if [ -n "$key" ] && [ -z "${!key}" ]; then
        export "$key"="$val"
      fi
    fi
  done < .env
fi

echo -e "${YELLOW}Installing dependencies...${NC}"
uv pip install -q -r scripts/requirements.txt
echo -e "${GREEN}✓${NC} Dependencies installed"
echo ""

if [ -z "$MASSIVE_API_KEY" ]; then
  echo -e "${YELLOW}⚠️  MASSIVE_API_KEY not set — treasury yields via yfinance/FRED only${NC}"
  echo ""
else
  echo -e "${GREEN}✓${NC} Using MASSIVE_API_KEY from .env / environment"
  echo ""
fi

echo -e "${YELLOW}Local fetch tuning (optional env vars):${NC}"
echo -e "  YF_BATCH_SIZE=25      tickers per yfinance download chunk (default 25)"
echo -e "  YF_BATCH_PAUSE=1.0    seconds between chunks (default 1.0)"
echo -e "  YF_INFO_PAUSE=0.3     seconds between name lookups (default 0.3)"
echo -e "  YF_HOLDINGS_PAUSE=0.4 seconds between holdings lookups (default 0.4)"
echo ""

echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}📊 Fetching market data...${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

START_TIME=$(date +%s)

if $PYTHON_CMD scripts/fetch_data.py "$@"; then
  END_TIME=$(date +%s)
  DURATION=$((END_TIME - START_TIME))

  echo ""
  echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${GREEN}✓ Data fetch completed successfully${NC}"
  echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  echo -e "  ${YELLOW}Time:${NC}     ${DURATION}s"
  echo -e "  ${YELLOW}Output:${NC}   public/data.json"
  echo -e "  ${YELLOW}Size:${NC}     $(du -h public/data.json 2>/dev/null | cut -f1 || echo 'N/A')"
  echo ""

  echo -e "${YELLOW}📋 Data Summary:${NC}"
  if [ -f "public/data.json" ]; then
    $PYTHON_CMD << 'PYEOF'
import json

try:
    data = json.load(open('public/data.json'))
    total = 0
    categories = 0
    for key, value in data.items():
        if isinstance(value, list):
            categories += 1
            total += len(value)
            status = "✓" if len(value) > 0 else "✗"
            print(f"   {status} {key:20} {len(value):3} items")
        elif key == 'holdings' and isinstance(value, dict):
            print(f"   ✓ {'holdings':20} {len(value):3} ETFs")
    print(f"\n   Total list records: {total} across {categories} categories")
    if 'generated_at' in data:
        print(f"   Generated at: {data['generated_at']}")
except Exception as e:
    print(f"   Error reading data: {e}")
PYEOF
  fi

  echo ""
  echo -e "${YELLOW}💡 Next Steps:${NC}"
  echo -e "   1. Start dev server: ${YELLOW}npm run dev${NC}"
  echo -e "   2. Prices only:      ${YELLOW}./fetch-data.sh --prices-only${NC}"
  echo -e "   3. Slower/local net: ${YELLOW}YF_BATCH_SIZE=15 YF_BATCH_PAUSE=2 ./fetch-data.sh${NC}"
  echo ""
else
  END_TIME=$(date +%s)
  DURATION=$((END_TIME - START_TIME))
  echo ""
  echo -e "${RED}✗ Data fetch failed${NC}"
  echo -e "  Duration: ${DURATION}s"
  echo ""
  echo -e "${YELLOW}Troubleshooting:${NC}"
  echo -e "  1. Clear yfinance cache: ${YELLOW}rm -rf ~/.cache/yfinance${NC}"
  echo -e "  2. Retry with smaller batches: ${YELLOW}YF_BATCH_SIZE=15 YF_BATCH_PAUSE=2 ./fetch-data.sh${NC}"
  echo -e "  3. Upgrade packages: ${YELLOW}uv pip install --upgrade -r scripts/requirements.txt${NC}"
  echo -e "  4. View logs: ${YELLOW}.venv/bin/python scripts/fetch_data.py 2>&1 | tail -50${NC}"
  exit 1
fi
