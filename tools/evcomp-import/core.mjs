const CONFIG_FIELDS = new Set([
  'sourceNamespace',
  'sourceSchema',
  'eventMappings',
  'activityMappings',
  'modalityMappings',
  'personMappings',
]);

export function toSourceBoolean(value) {
  if (value === true || value === 1 || value === '1') {
    return true;
  }
  if (value === false || value === 0 || value === '0') {
    return false;
  }
  throw new Error(`Unexpected EvComp boolean value: ${String(value)}`);
}

export function toAmountInCents(value) {
  const match = String(value ?? '').match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) {
    throw new Error(`Invalid EvComp applied amount: ${String(value)}`);
  }
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents > 2147483647) {
    throw new Error('EvComp applied amount exceeds the target integer range.');
  }
  return cents;
}

export function assertConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('Configuration must be a JSON object.');
  }

  for (const field of Object.keys(config)) {
    if (!CONFIG_FIELDS.has(field)) {
      throw new Error(`Unsupported configuration option: ${field}.`);
    }
  }

  if (
    config.sourceNamespace !== undefined &&
    (typeof config.sourceNamespace !== 'string' ||
      !config.sourceNamespace.trim() ||
      config.sourceNamespace !== config.sourceNamespace.trim())
  ) {
    throw new Error('sourceNamespace must be a nonempty, trimmed string.');
  }

  if (
    config.sourceSchema !== undefined &&
    (!config.sourceSchema || typeof config.sourceSchema !== 'object' || Array.isArray(config.sourceSchema))
  ) {
    throw new Error('sourceSchema must be a JSON object.');
  }

  const mappings = [
    ['eventMappings', 'event', 'sourceEventId', 'targetMajorEventId'],
    ['activityMappings', 'activity', 'sourceActivityId', 'targetEventId'],
    ['modalityMappings', 'modality', 'sourceModalityId', 'targetPriceTierId'],
    ['personMappings', 'person', 'sourcePersonId', 'targetPersonId'],
  ];
  for (const [field, label, sourceField, targetField] of mappings) {
    const rows = config[field];
    if (rows !== undefined && !Array.isArray(rows)) {
      throw new Error(`${field} must be an array.`);
    }

    const sourceIds = new Set();
    for (const mapping of rows ?? []) {
      if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) {
        throw new Error(`${field} entries must be objects.`);
      }
      requireValue(mapping[sourceField], `${field}[].${sourceField}`);
      requireUuid(mapping[targetField], `${field}[].${targetField}`);
      const key = String(mapping[sourceField]);
      if (sourceIds.has(key)) {
        throw new Error(`Duplicate source ${label} mapping: ${key}`);
      }
      sourceIds.add(key);
    }
  }
}

export function quoteMysqlIdentifier(identifier) {
  if (typeof identifier !== 'string' || !/^[\p{L}\p{N}_]+$/u.test(identifier)) {
    throw new Error(`Unsafe MySQL identifier in source schema mapping: ${String(identifier)}`);
  }
  return `\`${identifier.replaceAll('`', '``')}\``;
}

function requireValue(value, path) {
  if (value === undefined || value === null || String(value).trim() === '') {
    throw new Error(`Missing ${path}.`);
  }
}

function requireUuid(value, path) {
  requireValue(value, path);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`${path} must be a UUID.`);
  }
}
