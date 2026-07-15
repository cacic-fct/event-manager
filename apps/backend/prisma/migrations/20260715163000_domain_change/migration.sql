UPDATE "certificate_templates"
SET "template" = jsonb_set(
    "template"::jsonb,
    '{verificationUrlPattern}',
    to_jsonb(
        replace(
            "template"::jsonb->>'verificationUrlPattern',
            'eventos.cacic.dev.br',
            'eventos.cacic.com.br'
        )
    )
)
WHERE "template"::jsonb->>'verificationUrlPattern' LIKE '%eventos.cacic.dev.br%';