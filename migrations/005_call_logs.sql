-- 005_call_logs.sql
-- One row per LLM call. Bodies are NOT stored by default (PII / sensitive
-- prompts); verbose mode in admin UI opts in per-app with auto-disable.

CREATE TABLE IF NOT EXISTS call_logs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  app_id            uuid REFERENCES apps(id) ON DELETE SET NULL,
  alias             text,
  provider_id       uuid REFERENCES providers(id) ON DELETE SET NULL,
  model             text,
  auth_method       text CHECK (auth_method IS NULL OR auth_method IN ('oauth', 'api_key')),
  request_tokens    integer,
  response_tokens   integer,
  cost_usd          numeric(12,6),
  latency_ms        integer,
  status            integer,
  error             text,
  fallback_position integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_call_logs_workspace_created
  ON call_logs(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_logs_app_created
  ON call_logs(app_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_logs_provider_created
  ON call_logs(provider_id, created_at DESC);
