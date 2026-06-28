import type { Logger } from '@nestjs/common';
import Typesense from 'typesense';
import type { Client as TypesenseClient } from 'typesense';
import type { TypesenseNodeConfig } from './typesense-search.types';

export function buildTypesenseClient(input: {
  enabled: boolean;
  apiKey?: string;
  rawUrl?: string;
  logger: Logger;
}): TypesenseClient | null {
  if (!input.enabled) {
    return null;
  }

  const apiKey = normalizeTypesenseConfigValue(input.apiKey);
  const urlConfig = buildTypesenseNodeConfigFromUrl(input.rawUrl, input.logger);

  if (!apiKey) {
    input.logger.warn('Typesense is enabled but TYPESENSE_API_KEY is missing. Disabling search indexing.');
    return null;
  }

  if (!urlConfig) {
    input.logger.warn('Typesense is enabled but TYPESENSE_URL is missing or invalid. Disabling search indexing.');
    return null;
  }

  return new Typesense.Client({
    apiKey,
    nodes: [urlConfig],
    connectionTimeoutSeconds: 5,
  });
}

export function buildTypesenseNodeConfigFromUrl(
  rawUrl: string | undefined,
  logger: Pick<Logger, 'warn'>,
): TypesenseNodeConfig | null {
  const value = normalizeTypesenseConfigValue(rawUrl);
  if (!value) {
    return null;
  }

  try {
    const parsed = new URL(value);
    const protocol = parsed.protocol.replace(':', '');
    if (protocol !== 'http' && protocol !== 'https') {
      logger.warn('Typesense URL protocol must be http or https.');
      return null;
    }

    return {
      host: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : protocol === 'https' ? 443 : 80,
      protocol,
    };
  } catch {
    logger.warn('Typesense URL is invalid.');
    return null;
  }
}

function normalizeTypesenseConfigValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  const quote = trimmed[0];
  if ((quote === '"' || quote === "'") && trimmed.endsWith(quote)) {
    return trimmed.slice(1, -1).trim() || undefined;
  }

  return trimmed;
}
