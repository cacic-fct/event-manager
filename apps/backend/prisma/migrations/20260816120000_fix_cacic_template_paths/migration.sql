-- The original CACiC template was moved from the backend source tree to the
-- repository-level certificate-templates directory. Only rewrite known legacy
-- paths; preserve custom template configuration and verification URLs.
UPDATE "certificate_templates"
SET "template" = jsonb_set(
  "template",
  '{htmlTemplatePath}',
  to_jsonb('certificate-templates/cacic-unesp/attendee/cacic-unesp-attendee.template.html'::text)
),
"updatedAt" = NOW()
WHERE "id" = '01964110-9af3-7091-9f0c-3f9d5964a201'
  AND "template"->>'htmlTemplatePath' IN (
    'apps/events-backend/src/app/certificate/templates/cacic-unesp/cacic-unesp.template.html',
    'apps/backend/src/app/certificate/templates/cacic-unesp/cacic-unesp.template.html'
  );

UPDATE "certificate_templates"
SET "template" = jsonb_set(
  "template",
  '{cssTemplatePath}',
  to_jsonb('certificate-templates/cacic-unesp/attendee/cacic-unesp-attendee.template.css'::text)
),
"updatedAt" = NOW()
WHERE "id" = '01964110-9af3-7091-9f0c-3f9d5964a201'
  AND "template"->>'cssTemplatePath' IN (
    'apps/events-backend/src/app/certificate/templates/cacic-unesp/cacic-unesp.template.css',
    'apps/backend/src/app/certificate/templates/cacic-unesp/cacic-unesp.template.css'
  );
