-- migrate:up

CREATE TABLE IF NOT EXISTS style_dna_canonical_traits (
  canonical_trait_id TEXT PRIMARY KEY,
  taxonomy_version TEXT NOT NULL,
  axis TEXT NOT NULL,
  display_label TEXT NOT NULL,
  normalized_label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT,
  created_by TEXT NOT NULL,
  notes TEXT,
  CHECK (axis IN (
    'composition_and_structure',
    'lighting_and_contrast',
    'color_palette',
    'texture_and_medium',
    'dominant_dna_tags'
  )),
  CHECK (status IN ('active', 'deprecated')),
  UNIQUE (taxonomy_version, axis, normalized_label)
);

CREATE TABLE IF NOT EXISTS style_dna_trait_aliases (
  alias_id TEXT PRIMARY KEY,
  taxonomy_version TEXT NOT NULL,
  axis TEXT NOT NULL,
  alias_text TEXT NOT NULL,
  normalized_alias TEXT NOT NULL,
  canonical_trait_id TEXT NOT NULL,
  source TEXT NOT NULL,
  merge_method TEXT NOT NULL,
  lexical_similarity REAL,
  semantic_similarity REAL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT,
  created_by TEXT NOT NULL,
  review_note TEXT,
  FOREIGN KEY (canonical_trait_id) REFERENCES style_dna_canonical_traits(canonical_trait_id),
  CHECK (axis IN (
    'composition_and_structure',
    'lighting_and_contrast',
    'color_palette',
    'texture_and_medium',
    'dominant_dna_tags'
  )),
  CHECK (source IN ('manual_review', 'discovery_auto_merge', 'discovery_manual_merge', 'migration')),
  CHECK (merge_method IN (
    'exact_canonical',
    'exact_alias',
    'normalized_match',
    'lexical_semantic_auto',
    'manual_review'
  )),
  CHECK (status IN ('active', 'deprecated')),
  CHECK (lexical_similarity IS NULL OR (lexical_similarity >= 0 AND lexical_similarity <= 1)),
  CHECK (semantic_similarity IS NULL OR (semantic_similarity >= 0 AND semantic_similarity <= 1))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_style_dna_trait_aliases_norm_active
  ON style_dna_trait_aliases(taxonomy_version, axis, normalized_alias)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_style_dna_trait_aliases_canonical
  ON style_dna_trait_aliases(canonical_trait_id, taxonomy_version, axis, status);

CREATE TABLE IF NOT EXISTS style_dna_trait_discoveries (
  discovery_id TEXT PRIMARY KEY,
  taxonomy_version TEXT NOT NULL,
  axis TEXT NOT NULL,
  raw_trait_text TEXT NOT NULL,
  normalized_trait TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_review',
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  seen_count INTEGER NOT NULL DEFAULT 1,
  latest_style_dna_run_id TEXT,
  latest_analysis_run_id TEXT,
  top_candidates_json TEXT NOT NULL,
  resolution_payload_json TEXT,
  CHECK (axis IN (
    'composition_and_structure',
    'lighting_and_contrast',
    'color_palette',
    'texture_and_medium',
    'dominant_dna_tags'
  )),
  CHECK (status IN (
    'pending_review',
    'approved_alias',
    'approved_new_canonical',
    'rejected',
    'ignored'
  )),
  CHECK (seen_count >= 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_style_dna_trait_discoveries_pending
  ON style_dna_trait_discoveries(taxonomy_version, axis, normalized_trait)
  WHERE status = 'pending_review';

CREATE INDEX IF NOT EXISTS idx_style_dna_trait_discoveries_recent
  ON style_dna_trait_discoveries(status, last_seen_at DESC);

-- migrate:down

DROP INDEX IF EXISTS idx_style_dna_trait_discoveries_recent;
DROP INDEX IF EXISTS idx_style_dna_trait_discoveries_pending;
DROP TABLE IF EXISTS style_dna_trait_discoveries;
DROP INDEX IF EXISTS idx_style_dna_trait_aliases_canonical;
DROP INDEX IF EXISTS idx_style_dna_trait_aliases_norm_active;
DROP TABLE IF EXISTS style_dna_trait_aliases;
DROP TABLE IF EXISTS style_dna_canonical_traits;
