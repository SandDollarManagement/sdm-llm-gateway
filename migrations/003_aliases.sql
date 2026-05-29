-- 003_aliases.sql
-- Model aliases (D-004, D-011). Apps request an alias; gateway resolves
-- it to a provider chain via fallback_chain (jsonb array of
-- { provider_id, model, priority } entries).

CREATE TABLE IF NOT EXISTS aliases (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name            text NOT NULL,
  description     text,
  fallback_chain  jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aliases_workspace ON aliases(workspace_id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_aliases_workspace_name
  ON aliases(workspace_id, name);
