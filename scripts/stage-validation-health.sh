#!/usr/bin/env bash
# Stage validation stack health check
# Usage: ./scripts/stage-validation-health.sh

set -euo pipefail

PROJECT=knef-stage-validation
COMPOSE_ARGS="-f docker-compose.yml -f docker-compose.stage-validation.yml --project-name $PROJECT"
PASS=0
FAIL=0

check() {
  local name="$1"
  local cmd="$2"
  if eval "$cmd" &>/dev/null; then
    echo "  [OK]  $name"
    PASS=$((PASS + 1))
  else
    echo "  [FAIL] $name"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Stage Validation Health Check (project: $PROJECT) ==="
echo ""

echo "--- Container status ---"
docker compose $COMPOSE_ARGS ps 2>/dev/null || true
echo ""

echo "--- Service health ---"
# DB and Redis are on the 'internal' Docker network (no host port access by design).
# Check health via docker exec on the containers.
check "PostgreSQL (via docker exec)" \
  "docker exec ${PROJECT}-db-1 pg_isready -U knef -d knef_stage_validation"
check "Redis (via docker exec)" \
  "docker exec ${PROJECT}-redis-1 redis-cli ping | grep -q PONG"
check "API /health/live (port 4001)" \
  "curl -sf http://localhost:4001/api/v1/health/live | grep -q ok"
check "Admin web (port 3003)" \
  "curl -sf -o /dev/null -w '%{http_code}' http://localhost:3003 | grep -qE '^[23]'"
check "Storefront (port 3004)" \
  "curl -sf -o /dev/null -w '%{http_code}' http://localhost:3004 | grep -qE '^[23]'"
check "MCP server container healthy" \
  "docker inspect ${PROJECT}-mcp-server-1 --format '{{.State.Health.Status}}' | grep -q healthy"

echo ""
echo "--- Social publishing isolation ---"
check "SOCIAL_PUBLISHING_ENABLED=false in api container" \
  "docker compose $COMPOSE_ARGS exec -T api sh -c 'echo \$SOCIAL_PUBLISHING_ENABLED' | grep -q false"

echo ""
echo "--- Summary ---"
echo "  Passed: $PASS"
echo "  Failed: $FAIL"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo "RESULT: UNHEALTHY — $FAIL check(s) failed"
  exit 1
else
  echo "RESULT: HEALTHY — all checks passed"
fi
