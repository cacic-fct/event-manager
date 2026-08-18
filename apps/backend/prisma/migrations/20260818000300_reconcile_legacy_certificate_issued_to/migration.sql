DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typnamespace = 'public'::regnamespace
      AND typname = 'CertificateIssuedTo'
  ) THEN
    EXECUTE 'CREATE TYPE "CertificateIssuedTo" AS ENUM (''ATTENDEE'', ''LECTURER'', ''OTHER'')';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_attribute
    WHERE attrelid = '"certificate_configs"'::regclass
      AND attname = 'issuedTo'
      AND NOT attisdropped
  ) THEN
    EXECUTE 'ALTER TABLE "certificate_configs" ADD COLUMN "issuedTo" "CertificateIssuedTo" NOT NULL DEFAULT ''OTHER''';
  END IF;
END $$;
