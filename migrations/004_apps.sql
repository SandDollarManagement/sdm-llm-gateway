-- 004_apps.sql
-- Registered consumer apps (D-008). Each app gets a bearer token; the
-- plaintext is shown to the operator only once at creation and stored as
-- SHA-256 hash here.

CREATE TABLE IF NOT EXISTS apps (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id         uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name                 text NOT NULL,
  token_hash           text NOT NULL,
  default_alias        text,
  monthly_budget_usd   numeric(12,2),
  enabled              boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  last_used_at         timestamptz
);

CREATE INDEX IF NOT EXISTS idx_apps_workspace ON apps(workspace_id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_apps_workspace_name ON apps(workspace_id, name);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_apps_token_hash ON apps(token_hash);
