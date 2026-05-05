INSERT INTO "certificate_templates" (
  "id",
  "name",
  "description",
  "version",
  "template",
  "isActive",
  "createdAt",
  "updatedAt"
)
SELECT
  '01964110-9af3-7091-9f0c-3f9d5964a201',
  'Example',
  'Playwright certificate template example',
  1,
  $template$
  {
    "engine": "playwright",
    "templateName": "Example",
    "htmlTemplatePath": "apps/events-backend/src/app/certificate/templates/example/example.template.html",
    "cssTemplatePath": "apps/events-backend/src/app/certificate/templates/example/example.template.css",
    "verificationUrlPattern": "eventos.cacic.dev.br/app/validate/{certificateID}"
  }
  $template$::jsonb,
  true,
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1
  FROM "certificate_templates"
  WHERE "name" = 'Example'
    AND "deletedAt" IS NULL
);
