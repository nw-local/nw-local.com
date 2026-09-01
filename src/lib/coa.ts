export type CoaStatus = "pass" | "fail";

export interface CoaReading {
  label: string;
  value: string;
  unit: string;
}

export interface CoaMetric {
  name: string;
  value: string;
  unit: string;
  status?: CoaStatus;
}

export interface CoaPanel {
  name: string;
  status: CoaStatus;
  metrics: CoaMetric[];
}

export interface CoaStrain {
  name: string;
  url: string;
}

export interface CoaCertificate {
  filename: string;
  sha256: string;
  url: string;
}

export interface Coa {
  _id: string;
  sourceId: string;
  labResultId: string;
  sampleId: string;
  status: CoaStatus;
  totalThc?: CoaReading;
  waterActivity?: CoaReading;
  panels: CoaPanel[];
  strain?: CoaStrain;
  certificate: CoaCertificate;
}

const COA_STATUSES: ReadonlySet<string> = new Set( [ "pass", "fail" ] );
const COA_FIELDS = new Set( [
  "_id",
  "sourceId",
  "labResultId",
  "sampleId",
  "status",
  "totalThc",
  "waterActivity",
  "panels",
  "strain",
  "certificate",
] );
const READING_FIELDS = new Set( [ "label", "value", "unit" ] );
const METRIC_FIELDS = new Set( [ "name", "value", "unit", "status" ] );
const PANEL_FIELDS = new Set( [ "name", "status", "metrics" ] );
const STRAIN_FIELDS = new Set( [ "name", "url" ] );
const CERTIFICATE_FIELDS = new Set( [ "filename", "sha256", "url" ] );
const NULLABLE_COA_FIELDS = [ "totalThc", "waterActivity", "strain" ];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const CANONICAL_DECIMAL_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d*[1-9])?$/;

function isRecord( value: unknown ): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray( value );
}

function assertRecord( value: unknown, path: string ): asserts value is Record<string, unknown> {
  if( !isRecord( value ) ) {
    throw new Error( `${path} must be an object.` );
  }
}

function normalizeMetric( value: unknown ): unknown {
  if( !isRecord( value ) ) return value;
  const normalizedMetric = { ...value };
  if( normalizedMetric[ "status" ] === null ) delete normalizedMetric[ "status" ];
  return normalizedMetric;
}

function normalizePanel( value: unknown ): unknown {
  if( !isRecord( value ) ) return value;
  const normalizedPanel = { ...value };
  const metrics = normalizedPanel[ "metrics" ];
  if( Array.isArray( metrics ) ) normalizedPanel[ "metrics" ] = metrics.map( normalizeMetric );
  return normalizedPanel;
}

export function normalizeCoa( value: unknown ): unknown {
  if( !isRecord( value ) ) return value;
  const normalizedCoa = { ...value };
  for( const fieldName of NULLABLE_COA_FIELDS ) {
    if( normalizedCoa[ fieldName ] === null ) delete normalizedCoa[ fieldName ];
  }

  const panels = normalizedCoa[ "panels" ];
  if( Array.isArray( panels ) ) normalizedCoa[ "panels" ] = panels.map( normalizePanel );
  return normalizedCoa;
}

function assertExactFields(
  value: Record<string, unknown>,
  fields: ReadonlySet<string>,
  path: string,
): void {
  for( const fieldName of Object.keys( value ) ) {
    if( !fields.has( fieldName ) ) {
      throw new Error( `${path} has an unknown field: ${fieldName}.` );
    }
  }
}

function assertRequiredString( value: unknown, path: string ): asserts value is string {
  if( typeof value !== "string" || !value.trim() ) {
    throw new Error( `${path} must be a non-empty string.` );
  }
}

function assertHttpsUrl( value: unknown, path: string ): asserts value is string {
  assertRequiredString( value, path );
  try {
    const parsedUrl = new URL( value );
    if( parsedUrl.protocol !== "https:" ) {
      throw new Error( "URLs must use HTTPS." );
    }
  } catch ( error ) {
    const detail = error instanceof Error ? ` ${error.message}` : "";
    throw new Error( `${path} must be an HTTPS URL.${detail}`, { cause: error });
  }
}

function assertStatus( value: unknown, path: string ): asserts value is CoaStatus {
  if( typeof value !== "string" || !COA_STATUSES.has( value ) ) {
    throw new Error( `${path} must be "pass" or "fail".` );
  }
}

function assertMeasurement( value: Record<string, unknown>, path: string ): void {
  const measurement = value[ "value" ];
  if( typeof measurement !== "string" || !CANONICAL_DECIMAL_PATTERN.test( measurement ) ) {
    throw new Error( `${path}.value must be a canonical decimal string.` );
  }
  assertRequiredString( value[ "unit" ], `${path}.unit` );
}

function assertReading( value: unknown, path: string ): asserts value is CoaReading {
  assertRecord( value, path );
  assertExactFields( value, READING_FIELDS, path );
  assertRequiredString( value[ "label" ], `${path}.label` );
  assertMeasurement( value, path );
}

function assertMetric( value: unknown, path: string ): asserts value is CoaMetric {
  assertRecord( value, path );
  assertExactFields( value, METRIC_FIELDS, path );
  assertRequiredString( value[ "name" ], `${path}.name` );
  assertMeasurement( value, path );
  if( value[ "status" ] !== undefined ) assertStatus( value[ "status" ], `${path}.status` );
}

function assertPanel( value: unknown, path: string ): asserts value is CoaPanel {
  assertRecord( value, path );
  assertExactFields( value, PANEL_FIELDS, path );
  assertRequiredString( value[ "name" ], `${path}.name` );
  assertStatus( value[ "status" ], `${path}.status` );

  const metrics = value[ "metrics" ];
  if( !Array.isArray( metrics ) ) throw new Error( `${path}.metrics must be an array.` );
  metrics.forEach( ( metric, index ) => assertMetric( metric, `${path}.metrics[${index}]` ) );
}

function assertStrain( value: unknown ): asserts value is CoaStrain {
  const path = "COA strain";
  assertRecord( value, path );
  assertExactFields( value, STRAIN_FIELDS, path );
  assertRequiredString( value[ "name" ], `${path}.name` );
  assertHttpsUrl( value[ "url" ], `${path}.url` );
}

function assertCertificate( value: unknown ): asserts value is CoaCertificate {
  const path = "COA certificate";
  assertRecord( value, path );
  assertExactFields( value, CERTIFICATE_FIELDS, path );
  assertRequiredString( value[ "filename" ], `${path}.filename` );

  const sha256 = value[ "sha256" ];
  if( typeof sha256 !== "string" || !SHA256_PATTERN.test( sha256 ) ) {
    throw new Error( `${path}.sha256 must be a lowercase 64-character SHA-256 digest.` );
  }

  assertHttpsUrl( value[ "url" ], `${path}.url` );
}

export function assertCoa( value: unknown ): asserts value is Coa {
  const path = "COA";
  assertRecord( value, path );
  assertExactFields( value, COA_FIELDS, path );
  assertRequiredString( value[ "_id" ], `${path}._id` );

  const sourceId = value[ "sourceId" ];
  assertRequiredString( sourceId, `${path}.sourceId` );
  if( !UUID_PATTERN.test( sourceId ) ) {
    throw new Error( `${path}.sourceId must be a UUID.` );
  }

  assertRequiredString( value[ "labResultId" ], `${path}.labResultId` );
  assertRequiredString( value[ "sampleId" ], `${path}.sampleId` );
  assertStatus( value[ "status" ], `${path}.status` );

  if( value[ "totalThc" ] !== undefined ) assertReading( value[ "totalThc" ], `${path}.totalThc` );
  if( value[ "waterActivity" ] !== undefined ) {
    assertReading( value[ "waterActivity" ], `${path}.waterActivity` );
  }

  const panels = value[ "panels" ];
  if( !Array.isArray( panels ) ) throw new Error( `${path}.panels must be an array.` );
  panels.forEach( ( panel, index ) => assertPanel( panel, `${path}.panels[${index}]` ) );

  if( value[ "strain" ] !== undefined ) assertStrain( value[ "strain" ] );
  assertCertificate( value[ "certificate" ] );
}
