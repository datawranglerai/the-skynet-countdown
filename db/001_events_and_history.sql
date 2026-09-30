CREATE TABLE IF NOT EXISTS public.events (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
    public_id text NOT NULL UNIQUE CHECK (public_id ~ '^SKYNET-[0-9]{4}-[0-9]{4,}$'),
    selected_assessment_id bigint,
    selected_assessment_version_key text,
    selected_story_id bigint,
    selected_story_version_key text,
    selection_rationale text NOT NULL DEFAULT 'The only assessment source for this event is canonical.',
    bootstrap_completed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.events
    ADD COLUMN IF NOT EXISTS selected_story_id bigint,
    ADD COLUMN IF NOT EXISTS selected_story_version_key text,
    ADD COLUMN IF NOT EXISTS bootstrap_completed_at timestamptz;

ALTER TABLE public.assessments
    ADD COLUMN IF NOT EXISTS event_id bigint REFERENCES public.events(id);
ALTER TABLE public.stories
    ADD COLUMN IF NOT EXISTS event_id bigint REFERENCES public.events(id),
    ADD COLUMN IF NOT EXISTS assessment_version_key text;

DO $constraints$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_selected_assessment_id_fkey') THEN
        ALTER TABLE public.events ADD CONSTRAINT events_selected_assessment_id_fkey
            FOREIGN KEY (selected_assessment_id) REFERENCES public.assessments(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_selected_story_id_fkey') THEN
        ALTER TABLE public.events ADD CONSTRAINT events_selected_story_id_fkey
            FOREIGN KEY (selected_story_id) REFERENCES public.stories(id);
    END IF;
END
$constraints$;

CREATE TABLE IF NOT EXISTS public.record_history (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    kind text NOT NULL CHECK (kind IN ('assessment', 'story')),
    source_row_id bigint NOT NULL,
    event_id bigint NOT NULL REFERENCES public.events(id) ON DELETE RESTRICT,
    version_key text NOT NULL UNIQUE,
    assessment_version_key text,
    payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
    provenance text NOT NULL CHECK (btrim(provenance) <> ''),
    provenance_details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(provenance_details) = 'object'),
    import_key text UNIQUE,
    recorded_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.record_history
    ADD COLUMN IF NOT EXISTS provenance_details jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $history_constraints$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_selected_assessment_version_fkey') THEN
        ALTER TABLE public.events ADD CONSTRAINT events_selected_assessment_version_fkey
            FOREIGN KEY (selected_assessment_version_key) REFERENCES public.record_history(version_key)
            DEFERRABLE INITIALLY DEFERRED;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_selected_story_version_fkey') THEN
        ALTER TABLE public.events ADD CONSTRAINT events_selected_story_version_fkey
            FOREIGN KEY (selected_story_version_key) REFERENCES public.record_history(version_key)
            DEFERRABLE INITIALLY DEFERRED;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stories_assessment_version_fkey') THEN
        ALTER TABLE public.stories ADD CONSTRAINT stories_assessment_version_fkey
            FOREIGN KEY (assessment_version_key) REFERENCES public.record_history(version_key)
            DEFERRABLE INITIALLY DEFERRED;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'record_history_assessment_version_fkey') THEN
        ALTER TABLE public.record_history ADD CONSTRAINT record_history_assessment_version_fkey
            FOREIGN KEY (assessment_version_key) REFERENCES public.record_history(version_key)
            DEFERRABLE INITIALLY DEFERRED;
    END IF;
END
$history_constraints$;

CREATE SEQUENCE IF NOT EXISTS public.skynet_history_version_seq;

CREATE INDEX IF NOT EXISTS record_history_event_kind_idx
    ON public.record_history (event_id, kind, recorded_at, id);
CREATE INDEX IF NOT EXISTS record_history_source_idx
    ON public.record_history (kind, source_row_id, recorded_at, id);

CREATE OR REPLACE FUNCTION public.skynet_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
    IF (to_jsonb(NEW) - 'updated_at') IS NOT DISTINCT FROM (to_jsonb(OLD) - 'updated_at') THEN
        NEW.updated_at := OLD.updated_at;
    ELSE
        NEW.updated_at := clock_timestamp();
    END IF;
    RETURN NEW;
END
$fn$;

CREATE OR REPLACE FUNCTION public.skynet_event_identity_is_immutable()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
    IF NEW.slug IS DISTINCT FROM OLD.slug OR NEW.public_id IS DISTINCT FROM OLD.public_id THEN
        RAISE EXCEPTION 'Event slug and public ID are immutable';
    END IF;
    RETURN NEW;
END
$fn$;

CREATE OR REPLACE FUNCTION public.skynet_history_is_append_only()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
    RAISE EXCEPTION 'record_history is append-only';
END
$fn$;

DROP TRIGGER IF EXISTS record_history_append_only ON public.record_history;
CREATE TRIGGER record_history_append_only
BEFORE UPDATE OR DELETE ON public.record_history
FOR EACH ROW EXECUTE FUNCTION public.skynet_history_is_append_only();

DROP TRIGGER IF EXISTS assessments_touch_updated_at ON public.assessments;
CREATE TRIGGER assessments_touch_updated_at
BEFORE UPDATE ON public.assessments
FOR EACH ROW EXECUTE FUNCTION public.skynet_touch_updated_at();
DROP TRIGGER IF EXISTS stories_touch_updated_at ON public.stories;
CREATE TRIGGER stories_touch_updated_at
BEFORE UPDATE ON public.stories
FOR EACH ROW EXECUTE FUNCTION public.skynet_touch_updated_at();
DROP TRIGGER IF EXISTS events_touch_updated_at ON public.events;
CREATE TRIGGER events_touch_updated_at
BEFORE UPDATE ON public.events
FOR EACH ROW EXECUTE FUNCTION public.skynet_touch_updated_at();
DROP TRIGGER IF EXISTS events_identity_immutable ON public.events;
CREATE TRIGGER events_identity_immutable
BEFORE UPDATE ON public.events
FOR EACH ROW EXECUTE FUNCTION public.skynet_event_identity_is_immutable();

CREATE OR REPLACE FUNCTION public.skynet_next_public_id(event_date date)
RETURNS text LANGUAGE plpgsql AS $fn$
DECLARE
    event_year integer := EXTRACT(YEAR FROM event_date);
    next_number integer;
BEGIN
    PERFORM pg_advisory_xact_lock(194299, event_year);
    SELECT COALESCE(MAX(substring(public_id FROM '([0-9]+)$')::integer), 0) + 1
      INTO next_number
      FROM public.events
     WHERE public_id LIKE format('SKYNET-%s-%%', event_year);
    RETURN format('SKYNET-%s-%s', event_year, lpad(next_number::text, greatest(4, length(next_number::text)), '0'));
END
$fn$;

CREATE OR REPLACE FUNCTION public.skynet_slug(title text, event_date date, row_id bigint)
RETURNS text LANGUAGE sql IMMUTABLE AS $fn$
    SELECT to_char(event_date, 'YYYY-MM-DD') || '-' ||
      trim(BOTH '-' FROM regexp_replace(lower(title), '[^a-z0-9]+', '-', 'g')) || '-' || row_id::text
$fn$;

CREATE OR REPLACE FUNCTION public.skynet_capture_assessment()
RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE
    resolved_event_id bigint;
    version_key_value text;
    record_payload jsonb;
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.event_id IS NOT NULL
       AND (to_jsonb(NEW) - 'updated_at') IS NOT DISTINCT FROM (to_jsonb(OLD) - 'updated_at') THEN
        RETURN NULL;
    END IF;
    resolved_event_id := NEW.event_id;
    IF resolved_event_id IS NULL THEN
        INSERT INTO public.events (slug, public_id)
        VALUES (
            public.skynet_slug(NEW.incident_title, NEW.incident_date, NEW.id),
            public.skynet_next_public_id(NEW.incident_date)
        ) RETURNING id INTO resolved_event_id;
    END IF;

    UPDATE public.assessments SET event_id = resolved_event_id WHERE id = NEW.id AND event_id IS DISTINCT FROM resolved_event_id;
    SELECT to_jsonb(a) INTO record_payload FROM public.assessments a WHERE id = NEW.id;

    version_key_value := format('assessment:%s:%s', NEW.id, nextval('public.skynet_history_version_seq'));
    INSERT INTO public.record_history (
        kind, source_row_id, event_id, version_key, payload, provenance, provenance_details
    ) VALUES (
        'assessment', NEW.id, resolved_event_id, version_key_value, record_payload, 'n8n',
        COALESCE(NULLIF(current_setting('skynet.provenance_details', true), ''), '{}')::jsonb
    ) ON CONFLICT (version_key) DO NOTHING;

    IF EXISTS (
        SELECT 1 FROM public.events
         WHERE id = resolved_event_id
           AND (selected_assessment_id IS NULL OR selected_assessment_id = NEW.id)
    ) THEN
        UPDATE public.events
           SET selected_assessment_id = NEW.id,
               selected_assessment_version_key = version_key_value
         WHERE id = resolved_event_id;
    END IF;
    RETURN NULL;
END
$fn$;

CREATE OR REPLACE FUNCTION public.skynet_capture_story()
RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE
    resolved_event_id bigint;
    assessment_version text;
    version_key_value text;
    record_payload jsonb;
BEGIN
    SELECT event_id INTO resolved_event_id FROM public.assessments WHERE id = NEW.assessment_id;
    IF resolved_event_id IS NULL THEN
        RAISE EXCEPTION 'Assessment % is not attached to an event', NEW.assessment_id;
    END IF;
    IF (TG_OP = 'INSERT' AND NEW.assessment_version_key IS NOT NULL)
       OR (TG_OP = 'UPDATE' AND NEW.assessment_version_key IS DISTINCT FROM OLD.assessment_version_key) THEN
        assessment_version := NEW.assessment_version_key;
    ELSE
        SELECT version_key INTO assessment_version
         FROM public.record_history
         WHERE kind = 'assessment' AND source_row_id = NEW.assessment_id AND provenance = 'n8n'
         ORDER BY recorded_at DESC, id DESC LIMIT 1;
    END IF;
    IF assessment_version IS NULL THEN
        RAISE EXCEPTION 'Assessment % has no captured version', NEW.assessment_id;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.record_history WHERE version_key = assessment_version
          AND kind = 'assessment' AND source_row_id = NEW.assessment_id AND event_id = resolved_event_id
    ) THEN
        RAISE EXCEPTION 'Story assessment version belongs to another source or event';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.event_id = resolved_event_id
       AND OLD.assessment_version_key = assessment_version
       AND (to_jsonb(NEW) - 'updated_at') IS NOT DISTINCT FROM (to_jsonb(OLD) - 'updated_at') THEN
        RETURN NULL;
    END IF;
    UPDATE public.stories
       SET event_id = resolved_event_id, assessment_version_key = assessment_version
     WHERE id = NEW.id
       AND (event_id IS DISTINCT FROM resolved_event_id OR assessment_version_key IS DISTINCT FROM assessment_version);
    version_key_value := format('story:%s:%s', NEW.id, nextval('public.skynet_history_version_seq'));
    SELECT to_jsonb(s) INTO record_payload FROM public.stories s WHERE id = NEW.id;
    INSERT INTO public.record_history (
        kind, source_row_id, event_id, version_key, assessment_version_key, payload, provenance, provenance_details
    ) VALUES (
        'story', NEW.id, resolved_event_id, version_key_value, assessment_version, record_payload, 'n8n',
        COALESCE(NULLIF(current_setting('skynet.provenance_details', true), ''), '{}')::jsonb
    ) ON CONFLICT (version_key) DO NOTHING;
    IF EXISTS (
        SELECT 1 FROM public.events
         WHERE id = resolved_event_id
           AND (selected_story_id IS NULL OR selected_story_id = NEW.id)
    ) THEN
        UPDATE public.events
           SET selected_story_id = NEW.id,
               selected_story_version_key = version_key_value
         WHERE id = resolved_event_id;
    END IF;
    RETURN NULL;
END
$fn$;

DROP TRIGGER IF EXISTS assessments_capture_history ON public.assessments;
CREATE TRIGGER assessments_capture_history
AFTER INSERT OR UPDATE ON public.assessments
FOR EACH ROW WHEN (pg_trigger_depth() < 1)
EXECUTE FUNCTION public.skynet_capture_assessment();
DROP TRIGGER IF EXISTS stories_capture_history ON public.stories;
CREATE TRIGGER stories_capture_history
AFTER INSERT OR UPDATE ON public.stories
FOR EACH ROW WHEN (pg_trigger_depth() < 1)
EXECUTE FUNCTION public.skynet_capture_story();

COMMENT ON TABLE public.events IS
    'Public incidents: stable route slug, immutable display ID, reviewed grouping and canonical assessment selection.';
COMMENT ON TABLE public.record_history IS
    'Append-only assessment and story versions, including exact story-to-assessment-version links.';
