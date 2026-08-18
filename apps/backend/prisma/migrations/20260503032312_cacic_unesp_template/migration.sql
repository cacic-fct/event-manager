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
  'CACiC Unesp',
  'Playwright certificate template CACiC Unesp',
  1,
  $template$
  {
    "engine": "playwright",
    "templateName": "CACiC Unesp",
    "htmlTemplatePath": "apps/events-backend/src/app/certificate/templates/cacic-unesp/cacic-unesp.template.html",
    "cssTemplatePath": "apps/events-backend/src/app/certificate/templates/cacic-unesp/cacic-unesp.template.css",
    "verificationUrlPattern": "eventos.cacic.dev.br/app/validate/{certificateID}"
  }
  $template$::jsonb,
  true,
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1
  FROM "certificate_templates"
  WHERE "name" = 'CACiC Unesp'
    AND "deletedAt" IS NULL
);
