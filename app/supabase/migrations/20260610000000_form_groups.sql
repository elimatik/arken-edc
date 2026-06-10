-- ════════════════════════════════════════════════════════════════════════════
-- Form groups — forms can nest one level. A "group" form is a container with no
-- fields; its sub-forms reference it via parent_form_id. The form sidebar renders
-- groups as collapsible sections whose status icon = the worst status among the
-- group's children. Standalone forms (Adverse Event, Unscheduled Visit, ConMed)
-- have parent_form_id = null and no children.
--
-- Also adds 'file' to the field_type enum (consent / radiograph uploads).
--
-- ⚠️ Apply with:  cd app && npx supabase db reset --linked --yes
-- ════════════════════════════════════════════════════════════════════════════

alter table forms
  add column if not exists parent_form_id uuid references forms(id) on delete cascade;
create index if not exists idx_forms_parent on forms(parent_form_id);

-- File-upload field type (consent_upload, radiograph_upload). ADD VALUE is not
-- used within this migration, so it is transaction-safe.
alter type field_type add value if not exists 'file';
