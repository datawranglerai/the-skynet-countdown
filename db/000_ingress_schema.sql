BEGIN;

CREATE TABLE IF NOT EXISTS public.assessments (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    cve_id text NOT NULL CHECK (btrim(cve_id) <> ''),
    incident_title text NOT NULL,
    incident_date date NOT NULL,
    source_url text NOT NULL CHECK (btrim(source_url) <> ''),
    classification text NOT NULL CHECK (classification IN ('CANARY', 'NOTABLE', 'SIGNIFICANT', 'CRITICAL', 'EXISTENTIAL')),
    total_score smallint NOT NULL CHECK (total_score BETWEEN 0 AND 13),
    clock_delta_minutes integer NOT NULL CHECK (clock_delta_minutes >= 0),
    full_trifecta boolean NOT NULL,
    t1_score smallint NOT NULL CHECK (t1_score BETWEEN 0 AND 1), t1_rationale text NOT NULL,
    t2_score smallint NOT NULL CHECK (t2_score BETWEEN 0 AND 1), t2_rationale text NOT NULL,
    t3_score smallint NOT NULL CHECK (t3_score BETWEEN 0 AND 1), t3_rationale text NOT NULL,
    amp_governance_vacuum_score smallint NOT NULL CHECK (amp_governance_vacuum_score BETWEEN 0 AND 2), amp_governance_vacuum_rationale text NOT NULL,
    amp_autonomy_score smallint NOT NULL CHECK (amp_autonomy_score BETWEEN 0 AND 2), amp_autonomy_rationale text NOT NULL,
    amp_capability_erosion_score smallint NOT NULL CHECK (amp_capability_erosion_score BETWEEN 0 AND 2), amp_capability_erosion_rationale text NOT NULL,
    amp_sentience_score smallint NOT NULL CHECK (amp_sentience_score BETWEEN 0 AND 2), amp_sentience_rationale text NOT NULL,
    amp_physical_score smallint NOT NULL CHECK (amp_physical_score BETWEEN 0 AND 2), amp_physical_rationale text NOT NULL,
    is_leading_indicator boolean NOT NULL,
    leading_indicator_note text NOT NULL,
    scoring_notes text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT assessments_source_url_key UNIQUE (source_url)
);

CREATE TABLE IF NOT EXISTS public.stories (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    assessment_id bigint NOT NULL UNIQUE REFERENCES public.assessments(id),
    cve_id text NOT NULL CHECK (btrim(cve_id) <> ''),
    headline text NOT NULL,
    severity_label text NOT NULL CHECK (severity_label IN ('CANARY', 'NOTABLE', 'SIGNIFICANT', 'CRITICAL', 'EXISTENTIAL')),
    clock_delta_label text NOT NULL,
    metadata_line text NOT NULL,
    the_story text NOT NULL,
    our_take text NOT NULL,
    updated_clock_position text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS assessments_incident_date_idx ON public.assessments (incident_date DESC);
CREATE INDEX IF NOT EXISTS assessments_classification_idx ON public.assessments (classification);

COMMIT;

