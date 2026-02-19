-- Prostyle Strength Finder - Trait Taxonomy SQL Draft (Review Only)
-- Date: 2026-02-19
-- Status: Draft / not applied as migration
--
-- Purpose:
-- Companion SQL model for:
-- - design-documenatation/TRAIT_TAXONOMY_SCHEMA_DRAFT.json
-- - design-documenatation/LLM_WORKFLOW.md (Trait Synonym Squashing Policy)
--
-- Notes:
-- 1) Keep this as design draft until canonical trait taxonomy is marked Decided.
-- 2) Uses SQLite-compatible DDL and CHECK constraints.
-- 3) Deprecation is non-destructive; aliases/traits are never hard-deleted by policy.

-- Canonical trait registry.
CREATE TABLE IF NOT EXISTS canonical_traits (
  canonical_trait_id TEXT NOT NULL,
  trait_schema_version TEXT NOT NULL,
  display_label TEXT NOT NULL,
  family TEXT NOT NULL,
  definition TEXT NOT NULL,
  score_type TEXT NOT NULL,
  applicable_mediums_json TEXT,         -- JSON array of medium enums
  allowed_categories_json TEXT,          -- JSON array, required for categorical traits
  status TEXT NOT NULL DEFAULT 'active', -- active | deprecated
  created_at TEXT NOT NULL,
  updated_at TEXT,
  deprecated_at TEXT,
  created_by TEXT NOT NULL,
  notes TEXT,
  PRIMARY KEY (canonical_trait_id, trait_schema_version),
  CHECK (trait_schema_version GLOB 'v[0-9]*' OR trait_schema_version GLOB 'v[0-9]*.[0-9]*'),
  CHECK (family IN (
    'composition',
    'value_illumination_logic',
    'color',
    'surface_mark_making',
    'form_language',
    'spatial_construction',
    'mood_atmosphere',
    'finish_material_treatment',
    'photo_specific',
    'traditional_2d_specific',
    'cross_medium'
  )),
  CHECK (score_type IN ('continuous_0_1', 'ordinal_0_3', 'categorical')),
  CHECK (status IN ('active', 'deprecated')),
  CHECK (score_type != 'categorical' OR allowed_categories_json IS NOT NULL),
  CHECK (status != 'deprecated' OR deprecated_at IS NOT NULL)
);

-- Alias mapping table used by synonym squashing pipeline.
CREATE TABLE IF NOT EXISTS trait_aliases (
  alias_id TEXT PRIMARY KEY,
  alias_text TEXT NOT NULL,
  normalized_alias TEXT NOT NULL,
  canonical_trait_id TEXT NOT NULL,
  trait_schema_version TEXT NOT NULL,
  source TEXT NOT NULL,                  -- manual_review | discovery_auto_merge | ...
  merge_method TEXT NOT NULL,            -- exact/normalized/manual/auto methods
  lexical_similarity REAL,               -- [0,1], required for lexical_semantic_auto
  semantic_similarity REAL,              -- [0,1], required for lexical_semantic_auto
  ambiguity_flag INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT,
  deprecated_at TEXT,
  created_by TEXT NOT NULL,
  review_ticket TEXT,
  FOREIGN KEY (canonical_trait_id, trait_schema_version)
    REFERENCES canonical_traits(canonical_trait_id, trait_schema_version),
  CHECK (source IN (
    'manual_review',
    'discovery_auto_merge',
    'discovery_manual_merge',
    'import',
    'migration'
  )),
  CHECK (merge_method IN (
    'exact_canonical',
    'exact_alias',
    'normalized_match',
    'lexical_semantic_auto',
    'manual_review'
  )),
  CHECK (status IN ('active', 'deprecated')),
  CHECK (ambiguity_flag IN (0, 1)),
  CHECK (lexical_similarity IS NULL OR (lexical_similarity >= 0.0 AND lexical_similarity <= 1.0)),
  CHECK (semantic_similarity IS NULL OR (semantic_similarity >= 0.0 AND semantic_similarity <= 1.0)),
  CHECK (
    merge_method != 'lexical_semantic_auto'
    OR (
      lexical_similarity IS NOT NULL
      AND semantic_similarity IS NOT NULL
      AND lexical_similarity >= 0.70
      AND semantic_similarity >= 0.88
    )
  ),
  CHECK (status != 'deprecated' OR deprecated_at IS NOT NULL)
);

-- Prevent multiple active aliases with the same normalized token in a schema version.
CREATE UNIQUE INDEX IF NOT EXISTS idx_trait_aliases_norm_active
  ON trait_aliases(normalized_alias, trait_schema_version)
  WHERE status = 'active';

-- Speed up canonical lookup and version slicing.
CREATE INDEX IF NOT EXISTS idx_trait_aliases_canonical
  ON trait_aliases(canonical_trait_id, trait_schema_version, status);

CREATE INDEX IF NOT EXISTS idx_canonical_traits_family
  ON canonical_traits(trait_schema_version, family, status);

-- Optional helper view for active synonym resolution by version.
CREATE VIEW IF NOT EXISTS v_active_trait_alias_resolution AS
SELECT
  a.alias_id,
  a.alias_text,
  a.normalized_alias,
  a.trait_schema_version,
  a.canonical_trait_id,
  c.display_label AS canonical_display_label,
  a.source,
  a.merge_method,
  a.lexical_similarity,
  a.semantic_similarity,
  a.ambiguity_flag
FROM trait_aliases a
JOIN canonical_traits c
  ON c.canonical_trait_id = a.canonical_trait_id
 AND c.trait_schema_version = a.trait_schema_version
WHERE a.status = 'active'
  AND c.status = 'active';
