-- 008_gateway_alias_policy.sql
-- Gateway-owned alias metadata, per-app policy, and correlation telemetry for
-- Document Vault and future SDM apps.

ALTER TABLE aliases
  ADD COLUMN IF NOT EXISTS capability_type text NOT NULL DEFAULT 'generation',
  ADD COLUMN IF NOT EXISTS fallback_allowed boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS local_only_eligible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS retention_policy_notes text,
  ADD COLUMN IF NOT EXISTS cost_latency_priority text NOT NULL DEFAULT 'balanced',
  ADD COLUMN IF NOT EXISTS embedding_dimension integer,
  ADD COLUMN IF NOT EXISTS embedding_model_family text,
  ADD COLUMN IF NOT EXISTS embedding_model_version text;

ALTER TABLE aliases
  DROP CONSTRAINT IF EXISTS aliases_capability_type_check,
  ADD CONSTRAINT aliases_capability_type_check
    CHECK (capability_type IN ('generation', 'structured', 'embedding', 'rerank', 'vision', 'classification'));

ALTER TABLE aliases
  DROP CONSTRAINT IF EXISTS aliases_cost_latency_priority_check,
  ADD CONSTRAINT aliases_cost_latency_priority_check
    CHECK (cost_latency_priority IN ('cost', 'latency', 'quality', 'balanced', 'local'));

ALTER TABLE aliases
  DROP CONSTRAINT IF EXISTS aliases_embedding_metadata_check,
  ADD CONSTRAINT aliases_embedding_metadata_check
    CHECK (
      capability_type <> 'embedding'
      OR (
        embedding_dimension IS NOT NULL
        AND embedding_model_family IS NOT NULL
        AND embedding_model_version IS NOT NULL
      )
    );

ALTER TABLE apps
  ADD COLUMN IF NOT EXISTS allowed_aliases text[],
  ADD COLUMN IF NOT EXISTS fallback_allowed boolean NOT NULL DEFAULT true;

ALTER TABLE call_logs
  ADD COLUMN IF NOT EXISTS correlation_id text,
  ADD COLUMN IF NOT EXISTS policy_snapshot jsonb;

CREATE INDEX IF NOT EXISTS idx_call_logs_correlation
  ON call_logs(workspace_id, correlation_id)
  WHERE correlation_id IS NOT NULL;

UPDATE aliases
   SET capability_type = 'generation',
       fallback_allowed = true,
       local_only_eligible = false,
       retention_policy_notes = 'No raw prompt or response body stored by default.',
       cost_latency_priority = 'quality'
 WHERE name IN ('default', 'reasoning');

UPDATE aliases
   SET capability_type = 'generation',
       fallback_allowed = true,
       local_only_eligible = false,
       retention_policy_notes = 'No raw prompt or response body stored by default.',
       cost_latency_priority = 'latency'
 WHERE name = 'fast';

UPDATE aliases
   SET capability_type = 'vision',
       fallback_allowed = true,
       local_only_eligible = false,
       retention_policy_notes = 'Image content is forwarded to the selected provider but not stored in gateway logs by default.',
       cost_latency_priority = 'quality'
 WHERE name = 'vision';

UPDATE aliases
   SET capability_type = 'classification',
       fallback_allowed = true,
       local_only_eligible = false,
       retention_policy_notes = 'No raw prompt or response body stored by default.',
       cost_latency_priority = 'cost'
 WHERE name = 'bulk-classify';

INSERT INTO aliases (
  workspace_id, name, description, fallback_chain, capability_type,
  fallback_allowed, local_only_eligible, retention_policy_notes,
  cost_latency_priority, embedding_dimension, embedding_model_family,
  embedding_model_version
)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'doc-answer',
   'Document Vault question answering over retrieved document context.',
   '[]'::jsonb, 'generation', true, false,
   'No raw document content stored in gateway logs by default.',
   'quality', null, null, null),
  ('00000000-0000-0000-0000-000000000001', 'doc-summarize',
   'Document Vault summarization for files, folders, and result sets.',
   '[]'::jsonb, 'generation', true, false,
   'No raw document content stored in gateway logs by default.',
   'balanced', null, null, null),
  ('00000000-0000-0000-0000-000000000001', 'doc-rerank',
   'Document Vault search-result reranking.',
   '[]'::jsonb, 'rerank', true, false,
   'Only metadata needed for provider routing is logged by default.',
   'latency', null, null, null),
  ('00000000-0000-0000-0000-000000000001', 'doc-embed',
   'Document Vault embeddings. Fallbacks must preserve vector dimension.',
   '[]'::jsonb, 'embedding', false, false,
   'Document chunks are forwarded to the selected embedding provider but not stored in gateway logs by default.',
   'cost', 1536, 'openai-text-embedding', 'text-embedding-3-small'),
  ('00000000-0000-0000-0000-000000000001', 'vision-ocr',
   'Vision and OCR extraction for document images.',
   '[]'::jsonb, 'vision', true, false,
   'Image content is forwarded to the selected provider but not stored in gateway logs by default.',
   'balanced', null, null, null),
  ('00000000-0000-0000-0000-000000000001', 'fast-classify',
   'Fast low-cost classification for routing and tagging.',
   '[]'::jsonb, 'classification', true, false,
   'No raw prompt or response body stored by default.',
   'latency', null, null, null),
  ('00000000-0000-0000-0000-000000000001', 'local-private',
   'Local-only private inference. Never falls back to cloud providers.',
   '[]'::jsonb, 'generation', false, true,
   'Local-only route for sensitive content; no cloud fallback is allowed.',
   'local', null, null, null)
ON CONFLICT (workspace_id, name) DO UPDATE SET
  description = EXCLUDED.description,
  capability_type = EXCLUDED.capability_type,
  fallback_allowed = EXCLUDED.fallback_allowed,
  local_only_eligible = EXCLUDED.local_only_eligible,
  retention_policy_notes = EXCLUDED.retention_policy_notes,
  cost_latency_priority = EXCLUDED.cost_latency_priority,
  embedding_dimension = EXCLUDED.embedding_dimension,
  embedding_model_family = EXCLUDED.embedding_model_family,
  embedding_model_version = EXCLUDED.embedding_model_version,
  updated_at = now();
