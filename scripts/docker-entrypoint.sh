#!/bin/sh
# docker-entrypoint.sh
# Bootstraps the claude CLI credentials file from ANTHROPIC_OAUTH_TOKEN
# (D-020 / Path A) so the Anthropic provider in the gateway can spawn
# `claude -p` and have it draw from the operator's Max plan subscription
# credit. If a credentials file already exists (because Coolify is mounting
# a persistent volume at /app/.claude), we leave it alone.
#
# After bootstrap we exec into whatever CMD was passed (usually `node server.js`).

set -e

CREDS_DIR="${HOME:-/app}/.claude"
CREDS_FILE="$CREDS_DIR/.credentials.json"

mkdir -p "$CREDS_DIR"

if [ -s "$CREDS_FILE" ]; then
  echo "[entrypoint] claude credentials already present at $CREDS_FILE; leaving untouched."
elif [ -n "$ANTHROPIC_OAUTH_TOKEN" ]; then
  echo "[entrypoint] writing claude credentials to $CREDS_FILE from ANTHROPIC_OAUTH_TOKEN."
  # Schema follows what `claude setup-token` writes locally as of May 2026.
  # If the CLI rejects this format in the future, run `claude setup-token`
  # interactively inside this container once to regenerate the file with the
  # current schema; the persistent volume keeps it across deploys.
  cat > "$CREDS_FILE" <<EOF
{
  "claudeAiOauth": {
    "accessToken": "$ANTHROPIC_OAUTH_TOKEN",
    "refreshToken": "",
    "expiresAt": 9999999999999,
    "scopes": ["user:inference", "user:profile"]
  }
}
EOF
  chmod 600 "$CREDS_FILE"
else
  echo "[entrypoint] WARN: no ANTHROPIC_OAUTH_TOKEN set and no existing credentials file."
  echo "[entrypoint] WARN: Anthropic calls will fail until you either set ANTHROPIC_OAUTH_TOKEN or run 'claude setup-token' inside the container."
fi

exec "$@"
