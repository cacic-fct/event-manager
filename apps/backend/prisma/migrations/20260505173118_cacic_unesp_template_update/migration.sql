UPDATE "certificate_templates"
SET
  "name" = 'CACiC Unesp - Participante',
  "description" = 'Certificado para participantes',
  "template" = $template$
  {
    "engine": "playwright",
    "templateName": "CACiC Unesp - Participante",
    "htmlTemplatePath": "certificate-templates/cacic-unesp/cacic-unesp-attendee.template.html",
    "cssTemplatePath": "certificate-templates/cacic-unesp/cacic-unesp-attendee.template.css",
    "verificationUrlPattern": "eventos.cacic.dev.br/app/validar/{certificateID}"
  }
  $template$::jsonb,
  "certificateFields" = $fields$
  {
    "top-text": {
      "label": "Texto em cima do nome",
      "type": "string",
      "required": true,
      "default": "Certificamos a participação de"
    },
    "bottom-text": {
      "label": "Texto embaixo do nome",
      "type": "string",
      "required": true,
      "default": "no evento"
    }
  }
  $fields$::jsonb,
  "updatedAt" = NOW()
WHERE "id" = '01964110-9af3-7091-9f0c-3f9d5964a201'
  AND "name" = 'CACiC Unesp'
  AND "deletedAt" IS NULL;


-- New templates
INSERT INTO "certificate_templates" (
  "id",
  "name",
  "description",
  "version",
  "template",
  "certificateFields",
  "isActive",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid(),
  'CACiC Unesp - Organizador',
  'Certificado para organizadores',
  1,
  $template$
  {
    "engine": "playwright",
    "templateName": "CACiC Unesp - Organizador",
    "htmlTemplatePath": "certificate-templates/cacic-unesp/cacic-unesp-organizer.template.html",
    "cssTemplatePath": "certificate-templates/cacic-unesp/cacic-unesp-organizer.template.css",
    "verificationUrlPattern": "eventos.cacic.dev.br/app/validar/{certificateID}"
  }
  $template$::jsonb,
  $fields$
  {
    "top-text": {
      "label": "Texto em cima do nome",
      "type": "string",
      "required": true,
      "default": "Certificamos a participação de"
    },
    "bottom-text": {
      "label": "Texto embaixo do nome",
      "type": "string",
      "required": true,
      "default": "como organizador do evento"
    }
  }
  $fields$::jsonb,
  true,
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1
  FROM "certificate_templates"
  WHERE "name" = 'CACiC Unesp - Organizador'
    AND "deletedAt" IS NULL
);


INSERT INTO "certificate_templates" (
  "id",
  "name",
  "description",
  "version",
  "template",
  "certificateFields",
  "isActive",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid(),
  'CACiC Unesp - Palestrante/Ministrante',
  'Certificado para palestrantes e ministrantes',
  1,
  $template$
  {
    "engine": "playwright",
    "templateName": "CACiC Unesp - Palestrante/Ministrante",
    "htmlTemplatePath": "certificate-templates/cacic-unesp/cacic-unesp-lecturer.template.html",
    "cssTemplatePath": "certificate-templates/cacic-unesp/cacic-unesp-lecturer.template.css",
    "verificationUrlPattern": "eventos.cacic.dev.br/app/validar/{certificateID}"
  }
  $template$::jsonb,
  $fields$
  {
    "top-text": {
      "label": "Texto em cima do nome",
      "type": "string",
      "required": true,
      "default": "Certificamos que"
    },
    "bottom-text": {
      "label": "Texto embaixo do nome",
      "type": "string",
      "required": true,
      "default": "foi ministrante/palestrante (EDITE) no evento"
    }
  }
  $fields$::jsonb,
  true,
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1
  FROM "certificate_templates"
  WHERE "name" = 'CACiC Unesp - Palestrante/Ministrante'
    AND "deletedAt" IS NULL
);

INSERT INTO "certificate_templates" (
  "id",
  "name",
  "description",
  "version",
  "template",
  "certificateFields",
  "isActive",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid(),
  'CACiC Unesp - Extensão',
  'Certificado para alunos de extensão',
  1,
  $template$
  {
    "engine": "playwright",
    "templateName": "CACiC Unesp - Extensão",
    "htmlTemplatePath": "certificate-templates/cacic-unesp/cacic-unesp-extension.template.html",
    "cssTemplatePath": "certificate-templates/cacic-unesp/cacic-unesp-extension.template.css",
    "verificationUrlPattern": "eventos.cacic.dev.br/app/validar/{certificateID}"
  }
  $template$::jsonb,
  $fields$
  {
    "top-text": {
      "label": "Texto em cima do nome",
      "type": "string",
      "required": true,
      "default": "Certificamos a participação de"
    },
    "bottom-text": {
      "label": "Texto embaixo do nome",
      "type": "string",
      "required": true,
      "default": "como aluno de extensão no evento"
    }
  }
  $fields$::jsonb,
  true,
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1
  FROM "certificate_templates"
  WHERE "name" = 'CACiC Unesp - Extensão'
    AND "deletedAt" IS NULL
);