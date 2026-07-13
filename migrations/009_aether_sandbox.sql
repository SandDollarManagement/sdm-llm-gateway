-- 009_aether_sandbox.sql
-- Aether Sandbox lane: a locked-down project + scoped key with hard spend
-- caps, rate limits, a fail-closed model allowlist, spend alerts, and a
-- one-action kill switch, so a low-trust build sandbox can reach only
-- build-tier models through the gateway. All additive and idempotent.
--
-- Design notes (see DECISION_LOG D-024, FEATURE_SPECS FS-002):
--   * projects group apps for a project-level cap + one-switch kill.
--   * budget_enforced defaults FALSE on apps so turning on real cost
--     computation does NOT retroactively start 429-ing existing apps that
--     happen to have a monthly_budget_usd set. Only sandbox keys opt in.
--   * A project-scoped app MUST carry a non-empty allowed_aliases list --
--     the allowlist fails CLOSED for containment, enforced by CHECK here and
--     again in policy.js.
--   * model_prices makes call_logs.cost_usd real (it was always NULL before),
--     which is what finally makes any spend cap actually fire. Codex's
--     gpt-5-codex is intentionally left UNPRICED: an unpriced model is refused
--     at request time rather than silently logged as free (never-invent-a-number).

-- ---------------------------------------------------------------------------
-- projects: grouping for project-level cap + kill switch
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS projects (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name                text NOT NULL,
  description         text,
  kind                text NOT NULL DEFAULT 'internal',
  monthly_budget_usd  numeric(12,2),
  default_rpm_limit   integer,
  default_tpm_limit   integer,
  enabled             boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE projects
  DROP CONSTRAINT IF EXISTS projects_kind_check,
  ADD CONSTRAINT projects_kind_check CHECK (kind IN ('internal', 'sandbox'));

CREATE UNIQUE INDEX IF NOT EXISTS uniq_projects_workspace_name
  ON projects(workspace_id, name);

-- ---------------------------------------------------------------------------
-- apps: attach to a project, per-key rate limits, opt-in budget enforcement
-- ---------------------------------------------------------------------------
ALTER TABLE apps
  ADD COLUMN IF NOT EXISTS project_id      uuid REFERENCES projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rpm_limit       integer,
  ADD COLUMN IF NOT EXISTS tpm_limit       integer,
  ADD COLUMN IF NOT EXISTS budget_enforced boolean NOT NULL DEFAULT false;

-- Project-scoped apps must carry a non-empty allowed_aliases list. The model
-- allowlist is a containment boundary for low-trust keys, so it fails CLOSED:
-- an empty/NULL list on a project-scoped app is rejected at the DB level.
-- Use cardinality() not array_length(): array_length('{}',1) returns NULL,
-- which would let an empty-array allowlist slip past the CHECK (a CHECK only
-- fails on FALSE, not NULL). cardinality('{}') = 0, so this fails closed.
ALTER TABLE apps
  DROP CONSTRAINT IF EXISTS apps_project_allowlist_check,
  ADD CONSTRAINT apps_project_allowlist_check CHECK (
    project_id IS NULL
    OR (allowed_aliases IS NOT NULL AND cardinality(allowed_aliases) >= 1)
  );

CREATE INDEX IF NOT EXISTS idx_apps_project ON apps(project_id);

-- ---------------------------------------------------------------------------
-- aliases: sandbox flag (bans OAuth fallback) + per-alias output-token ceiling
-- ---------------------------------------------------------------------------
ALTER TABLE aliases
  ADD COLUMN IF NOT EXISTS sandbox_only      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_output_tokens integer;

-- ---------------------------------------------------------------------------
-- model_prices: per-MTok pricing so call_logs.cost_usd can be computed.
-- Keyed on the model string the gateway itself resolves (the chain entry
-- model), never the provider's echoed dated id.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS model_prices (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model            text NOT NULL,
  input_per_mtok   numeric(12,4) NOT NULL,
  output_per_mtok  numeric(12,4) NOT NULL,
  notes            text,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_model_prices_model ON model_prices(model);

-- Authoritative prices (USD per 1M tokens). gpt-5-codex is deliberately NOT
-- seeded here -- it stays unpriced (and therefore refused for budgeted keys)
-- until its real price is confirmed and added in a later migration.
INSERT INTO model_prices (model, input_per_mtok, output_per_mtok, notes)
VALUES
  ('claude-sonnet-5', 3.0000, 15.0000, 'Anthropic Sonnet 5 build tier'),
  ('claude-haiku-4-5', 1.0000, 5.0000, 'Anthropic Haiku 4.5 mechanical tier')
ON CONFLICT (model) DO UPDATE SET
  input_per_mtok  = EXCLUDED.input_per_mtok,
  output_per_mtok = EXCLUDED.output_per_mtok,
  notes           = EXCLUDED.notes,
  updated_at      = now();

-- ---------------------------------------------------------------------------
-- spend_alerts: one row per threshold crossed, surfaced in the admin UI
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS spend_alerts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id    uuid REFERENCES projects(id) ON DELETE CASCADE,
  app_id        uuid REFERENCES apps(id) ON DELETE CASCADE,
  scope         text NOT NULL,
  threshold     integer NOT NULL,
  period        text NOT NULL,
  spent_usd     numeric(12,4),
  cap_usd       numeric(12,2),
  acknowledged  boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE spend_alerts
  DROP CONSTRAINT IF EXISTS spend_alerts_scope_check,
  ADD CONSTRAINT spend_alerts_scope_check CHECK (scope IN ('project', 'key'));

-- Each threshold fires at most once per period per scope.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_spend_alerts_project
  ON spend_alerts(project_id, threshold, period)
  WHERE scope = 'project';
CREATE UNIQUE INDEX IF NOT EXISTS uniq_spend_alerts_key
  ON spend_alerts(app_id, threshold, period)
  WHERE scope = 'key';
CREATE INDEX IF NOT EXISTS idx_spend_alerts_open
  ON spend_alerts(workspace_id, acknowledged, created_at DESC);

-- ---------------------------------------------------------------------------
-- Seed the Aether Sandbox project + its three build-tier aliases.
-- Conservative defaults: $20/mo project cap, 30 req/min, 60k tokens/min.
-- Alias chains start EMPTY (D-004: no auto-config) and are wired to the real
-- anthropic (api_key) and openai providers at deploy via scripts/aether-seed.
-- ---------------------------------------------------------------------------
INSERT INTO projects (
  workspace_id, name, description, kind,
  monthly_budget_usd, default_rpm_limit, default_tpm_limit, enabled
)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'aether-sandbox',
  'Locked-down lane for the Aether build sandbox (low-trust, network-sealed). Build-tier models only.',
  'sandbox',
  20.00, 30, 60000, true
)
ON CONFLICT (workspace_id, name) DO NOTHING;

INSERT INTO aliases (
  workspace_id, name, description, fallback_chain,
  capability_type, fallback_allowed, local_only_eligible,
  retention_policy_notes, cost_latency_priority, sandbox_only, max_output_tokens
)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'aether-claude-build',
   'Aether sandbox: Anthropic Sonnet build tier. Real API billing, capped.',
   '[]'::jsonb, 'generation', true, false,
   'No raw prompt or response body stored by default (sandbox lane).',
   'quality', true, 8192),
  ('00000000-0000-0000-0000-000000000001', 'aether-claude-mechanical',
   'Aether sandbox: Anthropic Haiku mechanical tier. Real API billing, capped.',
   '[]'::jsonb, 'generation', true, false,
   'No raw prompt or response body stored by default (sandbox lane).',
   'latency', true, 8192),
  ('00000000-0000-0000-0000-000000000001', 'aether-codex-build',
   'Aether sandbox: OpenAI Codex build tier. Real API billing, capped.',
   '[]'::jsonb, 'generation', true, false,
   'No raw prompt or response body stored by default (sandbox lane).',
   'balanced', true, 8192)
ON CONFLICT (workspace_id, name) DO UPDATE SET
  description        = EXCLUDED.description,
  sandbox_only       = EXCLUDED.sandbox_only,
  max_output_tokens  = EXCLUDED.max_output_tokens,
  updated_at         = now();
