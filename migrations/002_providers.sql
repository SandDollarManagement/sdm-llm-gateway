-- 002_providers.sql
-- LLM provider records. Credentials column is AES-256-GCM encrypted (D-009)
-- with GATEWAY_ENCRYPTION_KEY; decrypt only inside the routing module.

CREATE TABLE IF NOT EXISTS providers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name          text NOT NULL,
  auth_type     text NOT NULL CHECK (auth_type IN ('oauth', 'api_key')),
  credentials   text NOT NULL,
  base_url      text,
  enabled       boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_providers_workspace ON providers(workspace_id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_providers_workspace_name_auth
  ON providers(workspace_id, name, auth_type);
