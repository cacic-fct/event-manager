UPDATE "certificate_templates"
SET
  "template" = jsonb_set(
    jsonb_set(
      jsonb_set(
        "template",
        '{verificationUrlPattern}',
        '"eventos.cacic.dev.br/validar/{certificateID}"'::jsonb
      ),
      '{htmlTemplatePath}',
      to_jsonb(
        'certificate-templates/cacic-unesp/' ||
        CASE "name"
          WHEN 'CACiC Unesp - Participante' THEN 'attendee'
          WHEN 'CACiC Unesp - Organizador' THEN 'organizer'
          WHEN 'CACiC Unesp - Palestrante/Ministrante' THEN 'lecturer'
          WHEN 'CACiC Unesp - Extensão' THEN 'extension'
        END ||
        '/cacic-unesp-' ||
        CASE "name"
          WHEN 'CACiC Unesp - Participante' THEN 'attendee'
          WHEN 'CACiC Unesp - Organizador' THEN 'organizer'
          WHEN 'CACiC Unesp - Palestrante/Ministrante' THEN 'lecturer'
          WHEN 'CACiC Unesp - Extensão' THEN 'extension'
        END ||
        '.template.html'
      )
    ),
    '{cssTemplatePath}',
    to_jsonb(
      'certificate-templates/cacic-unesp/' ||
      CASE "name"
        WHEN 'CACiC Unesp - Participante' THEN 'attendee'
        WHEN 'CACiC Unesp - Organizador' THEN 'organizer'
        WHEN 'CACiC Unesp - Palestrante/Ministrante' THEN 'lecturer'
        WHEN 'CACiC Unesp - Extensão' THEN 'extension'
      END ||
      '/cacic-unesp-' ||
      CASE "name"
        WHEN 'CACiC Unesp - Participante' THEN 'attendee'
        WHEN 'CACiC Unesp - Organizador' THEN 'organizer'
        WHEN 'CACiC Unesp - Palestrante/Ministrante' THEN 'lecturer'
        WHEN 'CACiC Unesp - Extensão' THEN 'extension'
      END ||
      '.template.css'
    )
  ),
  "updatedAt" = NOW()
WHERE "deletedAt" IS NULL
  AND "name" IN (
    'CACiC Unesp - Participante',
    'CACiC Unesp - Organizador',
    'CACiC Unesp - Palestrante/Ministrante',
    'CACiC Unesp - Extensão'
  );