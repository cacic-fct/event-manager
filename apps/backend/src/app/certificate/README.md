# Certificates

Certificate eligibility, issuance, revocation, public verification and preview rendering are separate concerns. Read the owning service and its regression tests before changing one of these flows.

## Issuance and revocation

- [certificate-eligibility.service.ts](certificate-eligibility.service.ts) decides current eligibility; the frontend does not.
- [certificate-issuing.service.ts](certificate-issuing.service.ts) preserves the certificate ID and verification link during restoration. “Permitir emissão” reissues an eligible certificate immediately; for configurations that support deferred issuance, it can instead clear revocation while leaving the certificate invalid until later eligible issuance. Manual configurations do not use that deferred path. LGPD-deleted certificates are excluded from restoration.
- [certificate-issuance-jobs.service.ts](certificate-issuance-jobs.service.ts) keeps automatic reconciliation silent, including legacy automatic runs whose stored notification option was enabled. Explicit admin issuance follows its notification setting. Keep tests for both paths.
- Keep certificate changes, recipient locking and audit records consistent; use the existing issuance/refresh helpers instead of creating a second issuance path.

## PDF and preview pipeline

- [protect-certificate-pdf.ts](protect-certificate-pdf.ts) invokes qpdf with a fresh random owner password per PDF. The job file keeps that password out of process arguments. Preserve temporary-file cleanup and avoid exposing the password.
- [extract-certificate-pdf-id.ts](extract-certificate-pdf-id.ts) uses Poppler `pdftotext` server-side, with bounded output and process limits. Keep upload admission and extraction protections in [the PDF validation controller](certificate-pdf-validation.controller.ts).
- [certificate-preview-renderer.ts](certificate-preview-renderer.ts) uses Chromium print layout to produce the first PDF page, Poppler `pdftoppm` to rasterize it, and Sharp to encode a bounded AVIF. Preserve print layout, page selection, blocked network requests, timeouts and size limits.
- [certificate-preview-source.ts](certificate-preview-source.ts) owns source limits and the rendering revision in the cache key. Revisit that revision when changing rendering semantics so old previews are not reused.
- Preview admission, queued workers, isolated rendering processes and storage caching have separate helpers and tests. Keep their resource limits and failure behavior intact.

## Validation

Run relevant backend suites and `bunx nx lint backend`. PDF integration checks require qpdf, Poppler (`pdftotext`, `pdftoppm`) and the configured Chromium installation; CI installs PDF tools in `.github/workflows/ci.yml`. Check prerequisites and skipped tests before claiming the pipeline passed.

For rendering changes, use [certificate-pdf.fixtures.ts](certificate-pdf.fixtures.ts), exercise real extraction/rasterization and inspect the output. Mock-only tests cannot verify print layout or PDF-tool behavior. Public validation UI lives in `apps/public/src/app/certificates/validation`; admin issuance UI lives in `apps/admin/src/app/certificates`.
