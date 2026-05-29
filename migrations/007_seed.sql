-- 007_seed.sql
-- Seed the single workspace row and the five default aliases (D-011).
-- fallback_chain entries start empty because no providers exist yet; the
-- operator populates each alias with a chain in the admin UI after the
-- first provider is added.

INSERT INTO workspaces (id, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'default')
ON CONFLICT (id) DO NOTHING;

INSERT INTO aliases (workspace_id, name, description, fallback_chain)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'default',
   'Balanced general purpose. Sonnet-class quality.',
   '[]'::jsonb),
  ('00000000-0000-0000-0000-000000000001', 'reasoning',
   'Hard reasoning and long context. Opus-class quality.',
   '[]'::jsonb),
  ('00000000-0000-0000-0000-000000000001', 'fast',
   'Cheap, high-volume, latency-sensitive. Haiku-class.',
   '[]'::jsonb),
  ('00000000-0000-0000-0000-000000000001', 'vision',
   'Image understanding.',
   '[]'::jsonb),
  ('00000000-0000-0000-0000-000000000001', 'bulk-classify',
   'High-volume classification, cheapest-first.',
   '[]'::jsonb)
ON CONFLICT (workspace_id, name) DO NOTHING;
