-- Certificate templates are now synchronized from metadata files into
-- self-contained database snapshots. Existing relations keep their template
-- row, so previously issued certificates and configurations move to the new
-- format without maintaining versioned rendering paths.
ALTER TABLE "certificate_templates"
ADD COLUMN "registryKey" TEXT,
ADD COLUMN "htmlTemplate" TEXT,
ADD COLUMN "cssTemplate" TEXT,
ADD COLUMN "contentChecksum" TEXT;

-- Keep the old path configuration as recovery-only data during the cutover.
-- The new backend never reads this column, but a failed metadata deployment
-- does not irreversibly erase a custom template definition.
ALTER TABLE "certificate_templates"
RENAME COLUMN "template" TO "legacyTemplate";

-- Collapse accidental version duplicates before assigning stable registry
-- keys. All configurations and issued certificates keep pointing to the
-- canonical row selected for their template family.
WITH template_families("name", "registryKey") AS (
  VALUES
    ('CACiC Unesp - Participante', 'cacic-unesp/attendee'),
    ('CACiC Unesp - Organizador', 'cacic-unesp/organizer'),
    ('CACiC Unesp - Palestrante/Ministrante', 'cacic-unesp/lecturer'),
    ('CACiC Unesp - Extensão', 'cacic-unesp/extension')
), ranked AS (
  SELECT
    template."id",
    family."registryKey",
    first_value(template."id") OVER (
      PARTITION BY family."registryKey"
      ORDER BY
        (template."deletedAt" IS NULL) DESC,
        template."isActive" DESC,
        template."version" DESC,
        template."createdAt" DESC,
        template."id"
    ) AS "canonicalId"
  FROM "certificate_templates" template
  JOIN template_families family ON family."name" = template."name"
)
UPDATE "certificate_configs" config
SET "certificateTemplateId" = ranked."canonicalId"
FROM ranked
WHERE config."certificateTemplateId" = ranked."id"
  AND ranked."id" <> ranked."canonicalId";

WITH template_families("name", "registryKey") AS (
  VALUES
    ('CACiC Unesp - Participante', 'cacic-unesp/attendee'),
    ('CACiC Unesp - Organizador', 'cacic-unesp/organizer'),
    ('CACiC Unesp - Palestrante/Ministrante', 'cacic-unesp/lecturer'),
    ('CACiC Unesp - Extensão', 'cacic-unesp/extension')
), ranked AS (
  SELECT
    template."id",
    first_value(template."id") OVER (
      PARTITION BY family."registryKey"
      ORDER BY
        (template."deletedAt" IS NULL) DESC,
        template."isActive" DESC,
        template."version" DESC,
        template."createdAt" DESC,
        template."id"
    ) AS "canonicalId"
  FROM "certificate_templates" template
  JOIN template_families family ON family."name" = template."name"
)
UPDATE "certificates" certificate
SET "certificateTemplateId" = ranked."canonicalId"
FROM ranked
WHERE certificate."certificateTemplateId" = ranked."id"
  AND ranked."id" <> ranked."canonicalId";

WITH template_families("name", "registryKey") AS (
  VALUES
    ('CACiC Unesp - Participante', 'cacic-unesp/attendee'),
    ('CACiC Unesp - Organizador', 'cacic-unesp/organizer'),
    ('CACiC Unesp - Palestrante/Ministrante', 'cacic-unesp/lecturer'),
    ('CACiC Unesp - Extensão', 'cacic-unesp/extension')
), ranked AS (
  SELECT
    template."id",
    first_value(template."id") OVER (
      PARTITION BY family."registryKey"
      ORDER BY
        (template."deletedAt" IS NULL) DESC,
        template."isActive" DESC,
        template."version" DESC,
        template."createdAt" DESC,
        template."id"
    ) AS "canonicalId"
  FROM "certificate_templates" template
  JOIN template_families family ON family."name" = template."name"
)
DELETE FROM "certificate_templates" template
USING ranked
WHERE template."id" = ranked."id"
  AND ranked."id" <> ranked."canonicalId";

UPDATE "certificate_templates"
SET "registryKey" = CASE "name"
  WHEN 'CACiC Unesp - Participante' THEN 'cacic-unesp/attendee'
  WHEN 'CACiC Unesp - Organizador' THEN 'cacic-unesp/organizer'
  WHEN 'CACiC Unesp - Palestrante/Ministrante' THEN 'cacic-unesp/lecturer'
  WHEN 'CACiC Unesp - Extensão' THEN 'cacic-unesp/extension'
  ELSE 'legacy/' || "id"
END,
"htmlTemplate" = '',
"contentChecksum" = 'pending-metadata',
"deletedAt" = CASE
  WHEN "name" IN (
    'CACiC Unesp - Participante',
    'CACiC Unesp - Organizador',
    'CACiC Unesp - Palestrante/Ministrante',
    'CACiC Unesp - Extensão'
  ) THEN NULL
  ELSE "deletedAt"
END,
"isActive" = CASE
  WHEN "name" IN (
    'CACiC Unesp - Participante',
    'CACiC Unesp - Organizador',
    'CACiC Unesp - Palestrante/Ministrante',
    'CACiC Unesp - Extensão'
  ) THEN "isActive"
  ELSE false
END;

ALTER TABLE "certificate_templates"
ALTER COLUMN "registryKey" SET NOT NULL,
ALTER COLUMN "htmlTemplate" SET NOT NULL,
ALTER COLUMN "contentChecksum" SET NOT NULL,
DROP COLUMN "version";

CREATE UNIQUE INDEX "certificate_templates_registryKey_key"
ON "certificate_templates"("registryKey");
