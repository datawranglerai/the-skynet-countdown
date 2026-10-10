BEGIN;

DO $prerequisites$
DECLARE
    missing_tables text;
BEGIN
    SELECT string_agg(table_name, ', ' ORDER BY table_name)
      INTO missing_tables
      FROM unnest(ARRAY['public.assessments', 'public.stories', 'public.events', 'public.record_history']) AS required(table_name)
     WHERE to_regclass(table_name) IS NULL;
    IF missing_tables IS NOT NULL THEN
        RAISE EXCEPTION USING
            ERRCODE = '55000',
            MESSAGE = format('Event reconciliation prerequisites are missing in database "%s".', current_database()),
            DETAIL = 'Missing tables: ' || missing_tables,
            HINT = 'Select the same Neon project, branch and database as the app DATABASE_URL. Migration 002 requires the populated events/history schema from migration 001; do not create empty replacement tables.';
    END IF;
END
$prerequisites$;

CREATE TABLE IF NOT EXISTS public.event_identity_decisions (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    decision_key text NOT NULL UNIQUE CHECK (btrim(decision_key) <> ''),
    action text NOT NULL CHECK (action IN ('merge', 'review', 'different', 'reject', 'unmerge', 'stale')),
    left_event_id bigint NOT NULL REFERENCES public.events(id) ON DELETE RESTRICT,
    right_event_id bigint NOT NULL REFERENCES public.events(id) ON DELETE RESTRICT,
    left_fingerprint text NOT NULL CHECK (btrim(left_fingerprint) <> ''),
    right_fingerprint text NOT NULL CHECK (btrim(right_fingerprint) <> ''),
    proposal_id bigint REFERENCES public.event_identity_decisions(id) ON DELETE RESTRICT,
    rationale text NOT NULL,
    confidence numeric NOT NULL CHECK (confidence BETWEEN 0 AND 1),
    evidence jsonb NOT NULL CHECK (jsonb_typeof(evidence) = 'object'),
    actor text NOT NULL CHECK (btrim(actor) <> ''),
    model text,
    prompt_version text,
    execution_id text,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (left_event_id < right_event_id)
);

CREATE TABLE IF NOT EXISTS public.event_parents (
    child_event_id bigint PRIMARY KEY REFERENCES public.events(id) ON DELETE RESTRICT,
    parent_event_id bigint NOT NULL REFERENCES public.events(id) ON DELETE RESTRICT,
    merge_decision_id bigint NOT NULL UNIQUE REFERENCES public.event_identity_decisions(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (child_event_id <> parent_event_id)
);

CREATE INDEX IF NOT EXISTS event_parents_parent_idx ON public.event_parents (parent_event_id);
CREATE INDEX IF NOT EXISTS event_identity_decisions_pair_idx
    ON public.event_identity_decisions (left_event_id, right_event_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS event_identity_decisions_proposal_idx
    ON public.event_identity_decisions (proposal_id) WHERE proposal_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.skynet_reconciliation_write_lock()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
    -- Source writes and reconciliation share this lock, so a fingerprint can never
    -- be approved while an assessment or story update is partially captured.
    PERFORM pg_advisory_xact_lock(194299, 42);
    RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS assessments_reconciliation_write_lock ON public.assessments;
CREATE TRIGGER assessments_reconciliation_write_lock
BEFORE INSERT OR UPDATE ON public.assessments
FOR EACH ROW EXECUTE FUNCTION public.skynet_reconciliation_write_lock();
DROP TRIGGER IF EXISTS stories_reconciliation_write_lock ON public.stories;
CREATE TRIGGER stories_reconciliation_write_lock
BEFORE INSERT OR UPDATE ON public.stories
FOR EACH ROW EXECUTE FUNCTION public.skynet_reconciliation_write_lock();

CREATE OR REPLACE FUNCTION public.skynet_identity_decisions_are_append_only()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
    RAISE EXCEPTION 'event_identity_decisions is append-only';
END
$fn$;

DROP TRIGGER IF EXISTS event_identity_decisions_append_only ON public.event_identity_decisions;
CREATE TRIGGER event_identity_decisions_append_only
BEFORE UPDATE OR DELETE ON public.event_identity_decisions
FOR EACH ROW EXECUTE FUNCTION public.skynet_identity_decisions_are_append_only();

CREATE OR REPLACE FUNCTION public.skynet_validate_event_parent()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
    IF NEW.child_event_id = NEW.parent_event_id THEN
        RAISE EXCEPTION 'An event cannot be its own parent';
    END IF;
    IF EXISTS (
        WITH RECURSIVE ancestors(event_id, path) AS (
            SELECT NEW.parent_event_id, ARRAY[NEW.parent_event_id]
            UNION ALL
            SELECT ep.parent_event_id, a.path || ep.parent_event_id
              FROM ancestors a
              JOIN public.event_parents ep ON ep.child_event_id = a.event_id
             WHERE NOT ep.parent_event_id = ANY(a.path)
        )
        SELECT 1 FROM ancestors WHERE event_id = NEW.child_event_id
    ) THEN
        RAISE EXCEPTION 'Event parent would create a cycle';
    END IF;
    RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS event_parents_no_cycles ON public.event_parents;
CREATE TRIGGER event_parents_no_cycles
BEFORE INSERT OR UPDATE ON public.event_parents
FOR EACH ROW EXECUTE FUNCTION public.skynet_validate_event_parent();

CREATE OR REPLACE FUNCTION public.skynet_event_root(p_event_id bigint)
RETURNS bigint LANGUAGE sql STABLE SET search_path = pg_catalog, public AS $fn$
    WITH RECURSIVE chain(event_id, path) AS (
        SELECT p_event_id, ARRAY[p_event_id]
        UNION ALL
        SELECT ep.parent_event_id, c.path || ep.parent_event_id
          FROM chain c
          JOIN public.event_parents ep ON ep.child_event_id = c.event_id
         WHERE NOT ep.parent_event_id = ANY(c.path)
    )
    SELECT event_id FROM chain ORDER BY cardinality(path) DESC LIMIT 1
$fn$;

CREATE OR REPLACE FUNCTION public.skynet_event_group_snapshot(p_root_event_id bigint)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = pg_catalog, public AS $fn$
    WITH RECURSIVE members(event_id) AS (
        SELECT p_root_event_id
        UNION ALL
        SELECT ep.child_event_id
          FROM members m
          JOIN public.event_parents ep ON ep.parent_event_id = m.event_id
    ), states AS (
        SELECT e.id,
               e.selected_assessment_version_key,
               e.selected_story_version_key,
               COALESCE((SELECT max(h.id) FROM public.record_history h WHERE h.event_id = e.id), 0) AS max_history_id,
               COALESCE((SELECT max(a.updated_at) FROM public.assessments a WHERE a.event_id = e.id), '-infinity'::timestamptz) AS assessment_state,
               COALESCE((SELECT max(s.updated_at) FROM public.stories s WHERE s.event_id = e.id), '-infinity'::timestamptz) AS story_state
          FROM members m JOIN public.events e ON e.id = m.event_id
    )
    SELECT jsonb_build_object(
        'root', p_root_event_id::text,
        'members', COALESCE(jsonb_agg(jsonb_build_object(
            'event_id', id::text,
            'assessment_version', selected_assessment_version_key,
            'story_version', selected_story_version_key,
            'max_history_id', max_history_id::text,
            'assessment_state_epoch', extract(epoch FROM assessment_state)::text,
            'story_state_epoch', extract(epoch FROM story_state)::text
        ) ORDER BY id), '[]'::jsonb)
    ) FROM states
$fn$;

CREATE OR REPLACE FUNCTION public.skynet_event_fingerprint(p_root_event_id bigint)
RETURNS text LANGUAGE sql STABLE SET search_path = pg_catalog, public AS $fn$
    SELECT md5(public.skynet_event_group_snapshot(p_root_event_id)::text)
$fn$;

CREATE OR REPLACE FUNCTION public.skynet_event_evidence(p_root_event_id bigint)
RETURNS text LANGUAGE sql STABLE SET search_path = pg_catalog, public AS $fn$
    WITH RECURSIVE members(event_id) AS (
        SELECT p_root_event_id
        UNION ALL
        SELECT ep.child_event_id FROM members m JOIN public.event_parents ep ON ep.parent_event_id = m.event_id
    ), evidence_rows AS (
        SELECT a.event_id,
               a.id AS assessment_id,
               COALESCE(s.id, 0) AS story_id,
               a.incident_date,
               concat_ws(E'\n',
                   'Event ' || e.public_id || ' / ' || e.slug,
                   'Title: ' || a.incident_title,
                   'Date: ' || to_char(a.incident_date, 'YYYY-MM-DD'),
                   'Source: ' || a.source_url,
                   CASE WHEN s.id IS NULL THEN NULL ELSE 'Story headline: ' || s.headline END,
                   CASE WHEN s.id IS NULL THEN NULL ELSE 'Story: ' || left(s.the_story, 2400) END
               ) AS evidence
          FROM members m
          JOIN public.events e ON e.id = m.event_id
          JOIN public.assessments a ON a.event_id = e.id
          LEFT JOIN public.stories s ON s.assessment_id = a.id
    )
    SELECT left(string_agg(evidence, E'\n\n---\n\n' ORDER BY incident_date, event_id, assessment_id, story_id), 12000)
      FROM evidence_rows
$fn$;

CREATE OR REPLACE FUNCTION public.skynet_event_incident_date(p_root_event_id bigint)
RETURNS date LANGUAGE sql STABLE SET search_path = pg_catalog, public AS $fn$
    WITH RECURSIVE members(event_id) AS (
        SELECT p_root_event_id
        UNION ALL
        SELECT ep.child_event_id FROM members m JOIN public.event_parents ep ON ep.parent_event_id = m.event_id
    )
    SELECT max(a.incident_date)
      FROM members m
      JOIN public.assessments a ON a.event_id = m.event_id
$fn$;

CREATE OR REPLACE FUNCTION public.skynet_dedup_candidates(
    p_limit integer DEFAULT 20,
    p_window_days integer DEFAULT 45
) RETURNS TABLE(pair jsonb)
LANGUAGE sql STABLE SET search_path = pg_catalog, public AS $fn$
    WITH roots AS (
        SELECT e.id, e.public_id, e.slug,
               a.incident_title,
               public.skynet_event_incident_date(e.id) AS incident_date,
               public.skynet_event_fingerprint(e.id) AS fingerprint,
               public.skynet_event_evidence(e.id) AS evidence,
               ARRAY(SELECT DISTINCT token FROM unnest(regexp_split_to_array(
                         lower(regexp_replace(a.incident_title, 'cite[^]*', '', 'g')), '[^a-z0-9]+'
                     )) token
                     WHERE length(token) >= 4
                       AND token <> ALL(ARRAY['about','after','again','against','amid','been','from','into','over','that','their','this','through','under','with','without','agent','model','system'])) AS title_tokens
          FROM public.events e
          JOIN public.assessments a ON a.id = e.selected_assessment_id
         WHERE NOT EXISTS (SELECT 1 FROM public.event_parents ep WHERE ep.child_event_id = e.id)
    ), candidates AS (
        SELECT l.*, r.id AS r_id, r.public_id AS r_public_id, r.slug AS r_slug,
               r.incident_date AS r_date, r.fingerprint AS r_fingerprint, r.evidence AS r_evidence,
               (SELECT count(*) FROM unnest(l.title_tokens) token WHERE token = ANY(r.title_tokens)) AS overlap
          FROM roots l JOIN roots r ON l.id < r.id
         WHERE abs(l.incident_date - r.incident_date) <= greatest(0, p_window_days)
           AND (
               abs(l.incident_date - r.incident_date) <= 7
               OR EXISTS (SELECT 1 FROM unnest(l.title_tokens) token WHERE token = ANY(r.title_tokens))
           )
           AND NOT EXISTS (
               SELECT 1 FROM public.event_identity_decisions d
                WHERE d.left_event_id = l.id AND d.right_event_id = r.id
                  AND d.left_fingerprint = l.fingerprint AND d.right_fingerprint = r.fingerprint
                  AND d.action IN ('merge', 'review', 'different', 'reject', 'unmerge')
           )
    )
    SELECT jsonb_build_object(
        'left', jsonb_build_object('event_id', id::text, 'public_id', public_id, 'slug', slug,
            'fingerprint', fingerprint, 'incident_date', to_char(incident_date, 'YYYY-MM-DD'), 'evidence', evidence),
        'right', jsonb_build_object('event_id', r_id::text, 'public_id', r_public_id, 'slug', r_slug,
            'fingerprint', r_fingerprint, 'incident_date', to_char(r_date, 'YYYY-MM-DD'), 'evidence', r_evidence)
    )
      FROM candidates
     ORDER BY overlap DESC, abs(incident_date - r_date), greatest(incident_date, r_date) DESC, id, r_id
     LIMIT greatest(0, least(COALESCE(p_limit, 20), 100))
$fn$;

CREATE OR REPLACE FUNCTION public.skynet_record_duplicate_decision(
    p_pair jsonb,
    p_classification jsonb,
    p_context jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $fn$
DECLARE
    left_id bigint;
    right_id bigint;
    supplied_left_fp text;
    supplied_right_fp text;
    current_left_fp text;
    current_right_fp text;
    left_evidence text;
    right_evidence text;
    relation text;
    confidence_value numeric;
    action_value text;
    decision_id bigint;
    canonical_id bigint;
    child_id bigint;
    decision_key_value text;
    expected_keys text[] := ARRAY['confidence','evidence_left','evidence_right','material_followup','rationale','relation','same_action','same_actor','same_occurrence'];
BEGIN
    IF jsonb_typeof(p_pair) <> 'object' OR jsonb_typeof(p_pair->'left') <> 'object'
       OR jsonb_typeof(p_pair->'right') <> 'object' OR jsonb_typeof(p_classification) <> 'object'
       OR jsonb_typeof(p_context) <> 'object' THEN
        RAISE EXCEPTION 'Malformed duplicate decision input';
    END IF;
    IF ARRAY(SELECT key FROM jsonb_object_keys(p_classification) key ORDER BY key) <> expected_keys THEN
        RAISE EXCEPTION 'Classification must contain exactly the documented fields';
    END IF;
    BEGIN
        left_id := (p_pair#>>'{left,event_id}')::bigint;
        right_id := (p_pair#>>'{right,event_id}')::bigint;
        confidence_value := (p_classification->>'confidence')::numeric;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Malformed event IDs or confidence';
    END;
    IF left_id >= right_id OR confidence_value < 0 OR confidence_value > 1 THEN
        RAISE EXCEPTION 'Pair IDs must be sorted and confidence must be between zero and one';
    END IF;
    relation := p_classification->>'relation';
    IF relation NOT IN ('same_event', 'different_event', 'uncertain')
       OR jsonb_typeof(p_classification->'same_actor') <> 'boolean'
       OR jsonb_typeof(p_classification->'same_action') <> 'boolean'
       OR jsonb_typeof(p_classification->'same_occurrence') <> 'boolean'
       OR jsonb_typeof(p_classification->'material_followup') <> 'boolean' THEN
        RAISE EXCEPTION 'Malformed duplicate classification';
    END IF;
    supplied_left_fp := p_pair#>>'{left,fingerprint}';
    supplied_right_fp := p_pair#>>'{right,fingerprint}';
    left_evidence := p_pair#>>'{left,evidence}';
    right_evidence := p_pair#>>'{right,evidence}';
    IF length(btrim(COALESCE(p_classification->>'rationale', ''))) < 8
       OR length(btrim(COALESCE(p_classification->>'evidence_left', ''))) < 24
       OR length(btrim(COALESCE(p_classification->>'evidence_right', ''))) < 24
       OR position(lower(p_classification->>'evidence_left') IN lower(COALESCE(left_evidence, ''))) = 0
       OR position(lower(p_classification->>'evidence_right') IN lower(COALESCE(right_evidence, ''))) = 0 THEN
        RAISE EXCEPTION 'Evidence excerpts must be nontrivial verbatim text from each candidate';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.events WHERE id IN (left_id, right_id) HAVING count(*) = 2) THEN
        RAISE EXCEPTION 'Candidate contains an unknown event ID';
    END IF;

    PERFORM pg_advisory_xact_lock(194299, 42);
    PERFORM 1 FROM public.events e
     WHERE public.skynet_event_root(e.id) IN (public.skynet_event_root(left_id), public.skynet_event_root(right_id))
     ORDER BY e.id FOR UPDATE;
    IF public.skynet_event_root(left_id) <> left_id OR public.skynet_event_root(right_id) <> right_id THEN
        action_value := 'stale';
    ELSE
        current_left_fp := public.skynet_event_fingerprint(left_id);
        current_right_fp := public.skynet_event_fingerprint(right_id);
        action_value := CASE
            WHEN current_left_fp IS DISTINCT FROM supplied_left_fp OR current_right_fp IS DISTINCT FROM supplied_right_fp THEN 'stale'
            WHEN public.skynet_event_evidence(left_id) IS DISTINCT FROM left_evidence
              OR public.skynet_event_evidence(right_id) IS DISTINCT FROM right_evidence THEN 'stale'
            WHEN relation = 'different_event' AND confidence_value >= 0.98 THEN 'different'
            WHEN relation = 'same_event' AND confidence_value >= 0.98
                 AND (p_classification->>'same_actor')::boolean
                 AND (p_classification->>'same_action')::boolean
                 AND (p_classification->>'same_occurrence')::boolean
                 AND NOT (p_classification->>'material_followup')::boolean
                 AND abs(public.skynet_event_incident_date(left_id) - public.skynet_event_incident_date(right_id)) <= 7
                 AND COALESCE((p_context->>'auto_merge')::boolean, false) THEN 'merge'
            ELSE 'review'
        END;
    END IF;
    decision_key_value := md5(concat_ws('|', 'classifier', left_id, right_id, supplied_left_fp, supplied_right_fp,
        COALESCE(p_context->>'prompt_version', '')));
    INSERT INTO public.event_identity_decisions (
        decision_key, action, left_event_id, right_event_id, left_fingerprint, right_fingerprint,
        rationale, confidence, evidence, actor, model, prompt_version, execution_id
    ) VALUES (
        decision_key_value, action_value, left_id, right_id, supplied_left_fp, supplied_right_fp,
        p_classification->>'rationale', confidence_value,
        jsonb_build_object('classification', p_classification, 'pair', p_pair),
        'n8n', nullif(p_context->>'model', ''), nullif(p_context->>'prompt_version', ''), nullif(p_context->>'execution_id', '')
    ) ON CONFLICT (decision_key) DO NOTHING
    RETURNING id INTO decision_id;
    IF decision_id IS NULL THEN
        SELECT id, action INTO decision_id, action_value
          FROM public.event_identity_decisions WHERE decision_key = decision_key_value;
        IF action_value = 'merge' THEN
            SELECT parent_event_id, child_event_id INTO canonical_id, child_id
              FROM public.event_parents WHERE merge_decision_id = decision_id;
        END IF;
        RETURN jsonb_build_object('decision_id', decision_id::text, 'action', action_value,
            'canonical_event_id', CASE WHEN action_value = 'merge' THEN canonical_id::text ELSE NULL END,
            'child_event_id', CASE WHEN action_value = 'merge' THEN child_id::text ELSE NULL END,
            'idempotent', true);
    END IF;
    IF action_value = 'merge' THEN
        SELECT id INTO canonical_id FROM public.events WHERE id IN (left_id, right_id) ORDER BY created_at, id LIMIT 1;
        child_id := CASE WHEN canonical_id = left_id THEN right_id ELSE left_id END;
        INSERT INTO public.event_parents (child_event_id, parent_event_id, merge_decision_id)
        VALUES (child_id, canonical_id, decision_id)
        ON CONFLICT (child_event_id) DO NOTHING;
    END IF;
    RETURN jsonb_build_object('decision_id', decision_id::text, 'action', action_value,
        'canonical_event_id', CASE WHEN action_value = 'merge' THEN canonical_id::text ELSE NULL END,
        'child_event_id', CASE WHEN action_value = 'merge' THEN child_id::text ELSE NULL END);
END
$fn$;

CREATE OR REPLACE FUNCTION public.skynet_review_duplicate(
    p_proposal_id bigint,
    p_accept boolean,
    p_reason text,
    p_actor text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $fn$
DECLARE
    proposal public.event_identity_decisions%ROWTYPE;
    existing public.event_identity_decisions%ROWTYPE;
    action_value text;
    decision_id bigint;
    canonical_id bigint;
    child_id bigint;
BEGIN
    IF length(btrim(COALESCE(p_reason, ''))) < 4 OR btrim(COALESCE(p_actor, '')) = '' THEN
        RAISE EXCEPTION 'Review reason and actor are required';
    END IF;
    SELECT * INTO proposal FROM public.event_identity_decisions WHERE id = p_proposal_id AND action = 'review';
    IF NOT FOUND THEN RAISE EXCEPTION 'Pending duplicate proposal % does not exist', p_proposal_id; END IF;
    PERFORM pg_advisory_xact_lock(194299, 42);
    SELECT * INTO existing FROM public.event_identity_decisions WHERE proposal_id = p_proposal_id ORDER BY id LIMIT 1;
    IF FOUND THEN
        RETURN jsonb_build_object('decision_id', existing.id::text, 'action', existing.action, 'idempotent', true);
    END IF;
    PERFORM 1 FROM public.events e
     WHERE public.skynet_event_root(e.id) IN (public.skynet_event_root(proposal.left_event_id), public.skynet_event_root(proposal.right_event_id))
     ORDER BY e.id FOR UPDATE;
    IF public.skynet_event_root(proposal.left_event_id) <> proposal.left_event_id
       OR public.skynet_event_root(proposal.right_event_id) <> proposal.right_event_id
       OR public.skynet_event_fingerprint(proposal.left_event_id) IS DISTINCT FROM proposal.left_fingerprint
       OR public.skynet_event_fingerprint(proposal.right_event_id) IS DISTINCT FROM proposal.right_fingerprint THEN
        action_value := 'stale';
    ELSE
        action_value := CASE WHEN p_accept THEN 'merge' ELSE 'reject' END;
    END IF;
    INSERT INTO public.event_identity_decisions (
        decision_key, action, left_event_id, right_event_id, left_fingerprint, right_fingerprint,
        proposal_id, rationale, confidence, evidence, actor, model, prompt_version, execution_id
    ) VALUES (
        md5(concat_ws('|', 'review', p_proposal_id, p_accept, action_value)), action_value,
        proposal.left_event_id, proposal.right_event_id, proposal.left_fingerprint, proposal.right_fingerprint,
        proposal.id, p_reason, proposal.confidence, proposal.evidence, p_actor,
        proposal.model, proposal.prompt_version, proposal.execution_id
    ) RETURNING id INTO decision_id;
    IF action_value = 'merge' THEN
        SELECT id INTO canonical_id FROM public.events
         WHERE id IN (proposal.left_event_id, proposal.right_event_id) ORDER BY created_at, id LIMIT 1;
        child_id := CASE WHEN canonical_id = proposal.left_event_id THEN proposal.right_event_id ELSE proposal.left_event_id END;
        INSERT INTO public.event_parents (child_event_id, parent_event_id, merge_decision_id)
        VALUES (child_id, canonical_id, decision_id);
    END IF;
    RETURN jsonb_build_object('decision_id', decision_id::text, 'action', action_value,
        'canonical_event_id', CASE WHEN action_value = 'merge' THEN canonical_id::text ELSE NULL END,
        'child_event_id', CASE WHEN action_value = 'merge' THEN child_id::text ELSE NULL END);
END
$fn$;

CREATE OR REPLACE FUNCTION public.skynet_unmerge_event(
    p_child_event_id bigint,
    p_expected_merge_decision_id bigint,
    p_reason text,
    p_actor text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $fn$
DECLARE
    edge public.event_parents%ROWTYPE;
    prestate jsonb;
    restored_root_id bigint;
    remaining_root_id bigint;
    left_id bigint;
    right_id bigint;
    left_fingerprint_value text;
    right_fingerprint_value text;
    decision_id bigint;
BEGIN
    IF length(btrim(COALESCE(p_reason, ''))) < 4 OR btrim(COALESCE(p_actor, '')) = '' THEN
        RAISE EXCEPTION 'Unmerge reason and actor are required';
    END IF;
    PERFORM pg_advisory_xact_lock(194299, 42);
    SELECT * INTO edge FROM public.event_parents
     WHERE child_event_id = p_child_event_id AND merge_decision_id = p_expected_merge_decision_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'The expected merge edge no longer exists'; END IF;
    PERFORM 1 FROM public.events WHERE id IN (edge.child_event_id, edge.parent_event_id) ORDER BY id FOR UPDATE;
    prestate := jsonb_build_object(
        'removed_edge', to_jsonb(edge),
        'group_root_event_id', public.skynet_event_root(edge.child_event_id)::text,
        'group_fingerprint', public.skynet_event_fingerprint(public.skynet_event_root(edge.child_event_id))
    );
    DELETE FROM public.event_parents
     WHERE child_event_id = p_child_event_id AND merge_decision_id = p_expected_merge_decision_id;
    restored_root_id := edge.child_event_id;
    remaining_root_id := public.skynet_event_root(edge.parent_event_id);
    left_id := least(restored_root_id, remaining_root_id);
    right_id := greatest(restored_root_id, remaining_root_id);
    left_fingerprint_value := public.skynet_event_fingerprint(left_id);
    right_fingerprint_value := public.skynet_event_fingerprint(right_id);
    INSERT INTO public.event_identity_decisions (
        decision_key, action, left_event_id, right_event_id, left_fingerprint, right_fingerprint,
        proposal_id, rationale, confidence, evidence, actor
    ) VALUES (
        md5(concat_ws('|', 'unmerge', p_child_event_id, p_expected_merge_decision_id)), 'unmerge', left_id, right_id,
        left_fingerprint_value, right_fingerprint_value,
        p_expected_merge_decision_id, p_reason, 1, prestate || jsonb_build_object(
            'restored_root_event_id', restored_root_id::text,
            'remaining_root_event_id', remaining_root_id::text,
            'restored_fingerprint', public.skynet_event_fingerprint(restored_root_id),
            'remaining_fingerprint', public.skynet_event_fingerprint(remaining_root_id)
        ), p_actor
    ) RETURNING id INTO decision_id;
    RETURN jsonb_build_object('decision_id', decision_id::text, 'action', 'unmerge',
        'child_event_id', p_child_event_id::text, 'restored_root_event_id', p_child_event_id::text);
END
$fn$;

CREATE OR REPLACE VIEW public.event_duplicate_review_queue AS
SELECT d.id AS proposal_id,
       d.left_event_id,
       d.right_event_id,
       public.skynet_event_root(d.left_event_id) AS left_root_event_id,
       public.skynet_event_root(d.right_event_id) AS right_root_event_id,
       d.left_fingerprint,
       d.right_fingerprint,
       d.confidence,
       d.rationale,
       d.evidence,
       d.model,
       d.prompt_version,
       d.execution_id,
       d.created_at,
       public.skynet_event_root(d.left_event_id) = d.left_event_id
         AND public.skynet_event_root(d.right_event_id) = d.right_event_id
         AND public.skynet_event_fingerprint(d.left_event_id) = d.left_fingerprint
         AND public.skynet_event_fingerprint(d.right_event_id) = d.right_fingerprint AS is_fresh
  FROM public.event_identity_decisions d
 WHERE d.action = 'review'
   AND NOT EXISTS (SELECT 1 FROM public.event_identity_decisions resolution WHERE resolution.proposal_id = d.id);

COMMENT ON TABLE public.event_parents IS
    'Current reversible event grouping. A child retains its immutable identity and history while its root is displayed.';
COMMENT ON TABLE public.event_identity_decisions IS
    'Append-only audit log for automated duplicate classifications, human reviews, stale proposals and unmerges.';
COMMENT ON VIEW public.event_duplicate_review_queue IS
    'Unresolved duplicate proposals. is_fresh is false when either event changed or was regrouped after classification.';

REVOKE ALL ON public.event_parents FROM PUBLIC;
REVOKE ALL ON public.event_identity_decisions FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.skynet_record_duplicate_decision(jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.skynet_review_duplicate(bigint, boolean, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.skynet_unmerge_event(bigint, bigint, text, text) FROM PUBLIC;

DO $grants$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'skynet_api_reader') THEN
        REVOKE ALL ON public.event_identity_decisions, public.event_duplicate_review_queue FROM skynet_api_reader;
        GRANT SELECT ON public.event_parents TO skynet_api_reader;
        GRANT SELECT (created_at) ON public.event_identity_decisions TO skynet_api_reader;
    END IF;
END
$grants$;

COMMIT;
