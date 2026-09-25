#!/bin/bash
# Daily job application automation
# Runs Devin CLI in non-interactive mode to apply to 25 jobs
# Scheduled via cron at 8 AM daily

set -euo pipefail

REPO_DIR="/home/santialiprandi/Github/job-seeker"
LOG_DIR="$REPO_DIR/logs"
LOG_FILE="$LOG_DIR/daily-apply-$(date +%Y-%m-%d).log"
PID_FILE="$REPO_DIR/logs/daily-apply.pid"

# Ensure log directory exists
mkdir -p "$LOG_DIR"

# Check if another instance is already running
if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE")
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo "[$(date)] Another instance is already running (PID $OLD_PID). Exiting." >> "$LOG_FILE"
    exit 0
  fi
fi

echo "$$" > "$PID_FILE"
trap 'rm -f "$PID_FILE"' EXIT

echo "[$(date)] === Daily job application started ===" >> "$LOG_FILE"

# Pull latest changes (non-destructive, skip if local changes)
cd "$REPO_DIR"
if git diff --quiet 2>/dev/null && git diff --cached --quiet 2>/dev/null; then
  git pull --ff-only >> "$LOG_FILE" 2>&1 || echo "[$(date)] WARNING: git pull failed, continuing with local state" >> "$LOG_FILE"
else
  echo "[$(date)] Local changes detected, skipping git pull" >> "$LOG_FILE"
fi

# Run Devin in non-interactive mode with the apply prompt
# --permission-mode bypass: auto-approve all actions (needed for unattended execution)
# --respect-workspace-trust false: skip trust prompt in non-interactive mode
# -p: single-turn mode, print response and exit
devin -p \
  --respect-workspace-trust false \
  --permission-mode bypass \
  "Aplica a 25 trabajos que coincidan con mi perfil. Usa el skill apply del repositorio job-seeker. Busca en LinkedIn con keywords variados (Software Engineer, AI, LLM, Full Stack, Backend, Frontend, JavaScript, React, Node.js, TypeScript, Python, Automation, Agent workflows, Junior, Entry Level). Usa el script scripts/quick-apply.js con batches de 15. Despues de aplicar, corrige las empresas Unknown con scripts/fix-unknown-companies.js. Al final abre el dashboard con scripts/dashboard.js --open y dame un resumen de cuantas aplicaciones se hicieron hoy y el total acumulado." \
  >> "$LOG_FILE" 2>&1

EXIT_CODE=$?
echo "[$(date)] === Daily job application finished (exit code: $EXIT_CODE) ===" >> "$LOG_FILE"

# Clean up old logs (keep last 30 days)
find "$LOG_DIR" -name "daily-apply-*.log" -mtime +30 -delete 2>/dev/null || true

rm -f "$PID_FILE"
exit $EXIT_CODE
