-- 006_monthly_usage.sql
-- Rolled-up monthly cost per provider per auth method. Used by the OAuth
-- budget logic (wrapper checks current month's OAuth spend against the
-- configured cap before deciding which credential to use).

CREATE TABLE IF NOT EXISTS monthly_usage (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider_id   uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  auth_method   text NOT NULL CHECK (auth_method IN ('oauth', 'api_key')),
  month         text NOT NULL,
  tokens_in     bigint NOT NULL DEFAULT 0,
  tokens_out    bigint NOT NULL DEFAULT 0,
  cost_usd      numeric(12,6) NOT NULL DEFAULT 0,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_monthly_usage
  ON monthly_usage(workspace_id, provider_id, auth_method, month);
