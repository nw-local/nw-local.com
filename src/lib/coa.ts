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
  publishedAt: string;
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
  "publishedAt",
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
const FETCH_RESULT_FIELDS = new Set( [ "coa", "destination" ] );
const SANITY_DOCUMENT_SYSTEM_FIELDS = [ "_id", "_type", "_rev", "_createdAt", "_updatedAt" ];
const SANITY_OBJECT_SYSTEM_FIELDS = [ "_type" ];
const SANITY_ARRAY_OBJECT_SYSTEM_FIELDS = [ "_key", "_type" ];
const DESTINATION_DOCUMENT_FIELDS = new Set( [
  ...SANITY_DOCUMENT_SYSTEM_FIELDS,
  "sourceId",
  "labResultId",
  "sampleId",
  "status",
  "publishedAt",
  "totalThc",
  "waterActivity",
  "panels",
  "strain",
  "certificate",
] );
const DESTINATION_READING_FIELDS = new Set( [
  ...SANITY_OBJECT_SYSTEM_FIELDS,
  "label",
  "value",
  "unit",
] );
const DESTINATION_PANEL_FIELDS = new Set( [
  ...SANITY_ARRAY_OBJECT_SYSTEM_FIELDS,
  "name",
  "status",
  "metrics",
] );
const DESTINATION_METRIC_FIELDS = new Set( [
  ...SANITY_ARRAY_OBJECT_SYSTEM_FIELDS,
  "name",
  "value",
  "unit",
  "status",
] );
const DESTINATION_STRAIN_FIELDS = new Set( [ ...SANITY_OBJECT_SYSTEM_FIELDS, "name", "url" ] );
const DESTINATION_CERTIFICATE_FIELDS = new Set( [
  ...SANITY_OBJECT_SYSTEM_FIELDS,
  "filename",
  "sha256",
  "asset",
] );
const DESTINATION_CERTIFICATE_ASSET_FIELDS = new Set( [ ...SANITY_OBJECT_SYSTEM_FIELDS, "asset" ] );
const DESTINATION_ASSET_REFERENCE_FIELDS = new Set( [ "_type", "_ref" ] );
const NULLABLE_COA_FIELDS = [ "totalThc", "waterActivity", "strain" ];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const CANONICAL_DECIMAL_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d*[1-9])?$/;
const RFC3339_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-](\d{2}):(\d{2}))$/;

export const COA_DOCUMENT_ID_PREFIX = "coa.";

export const COA_BUYER_PROJECTION = `{
  _id, sourceId, labResultId, sampleId, status, publishedAt,
  defined(totalThc) => { "totalThc": totalThc { label, value, unit } },
  defined(waterActivity) => { "waterActivity": waterActivity { label, value, unit } },
  panels[] {
    name, status,
    metrics[] {
      name, value, unit,
      defined(status) => { "status": status }
    }
  },
  defined(strain) => { "strain": strain { name, url } },
  certificate { filename, sha256, "url": asset.asset->url }
}`;

const COA_FETCH_PROJECTION = `{
  "coa": ${COA_BUYER_PROJECTION},
  "destination": @
}`;

export const COA_LIST_QUERY = `*[_type == "coa"] | order(sourceId asc) ${COA_FETCH_PROJECTION}`;
export const COA_BY_SOURCE_ID_QUERY = `*[_type == "coa" && sourceId == $sourceId][0] ${COA_FETCH_PROJECTION}`;

export type CoaDestinationFetcher = (
  query: string,
  parameters?: Record<string, string>,
) => Promise<unknown>;

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

function assertRfc3339Timestamp( value: unknown, path: string ): asserts value is string {
  assertRequiredString( value, path );
  const match = RFC3339_PATTERN.exec( value );
  if( !match ) throw new Error( `${path} must be a strict RFC3339 timestamp.` );

  const year = Number( match[1] );
  const month = Number( match[2] );
  const day = Number( match[3] );
  const hour = Number( match[4] );
  const minute = Number( match[5] );
  const second = Number( match[6] );
  const offsetHour = Number( match[7] ?? 0 );
  const offsetMinute = Number( match[8] ?? 0 );
  const daysInMonth = month >= 1 && month <= 12
    ? new Date( Date.UTC( year, month, 0 ) ).getUTCDate()
    : 0;
  if(
    day < 1
    || day > daysInMonth
    || hour > 23
    || minute > 59
    || second > 59
    || offsetHour > 23
    || offsetMinute > 59
  ) {
    throw new Error( `${path} must be a strict RFC3339 timestamp.` );
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
  const expectedDocumentId = `${COA_DOCUMENT_ID_PREFIX}${sourceId}`;
  if( value[ "_id" ] !== expectedDocumentId ) {
    throw new Error( `${path}._id must equal ${expectedDocumentId}.` );
  }

  assertRequiredString( value[ "labResultId" ], `${path}.labResultId` );
  assertRequiredString( value[ "sampleId" ], `${path}.sampleId` );
  assertStatus( value[ "status" ], `${path}.status` );
  assertRfc3339Timestamp( value[ "publishedAt" ], `${path}.publishedAt` );

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

function assertDestinationObject(
  value: unknown,
  allowedFields: ReadonlySet<string>,
  path: string,
): asserts value is Record<string, unknown> {
  assertRecord( value, path );
  for( const fieldName of Object.keys( value ) ) {
    if( !allowedFields.has( fieldName ) ) {
      throw new Error( `${path} has an unknown destination field: ${fieldName}.` );
    }
  }
}

function assertDestinationAudit( value: unknown ): void {
  const path = "COA destination";
  assertDestinationObject( value, DESTINATION_DOCUMENT_FIELDS, path );

  for( const readingField of [ "totalThc", "waterActivity" ] ) {
    const reading = value[ readingField ];
    if( reading !== undefined && reading !== null ) {
      assertDestinationObject( reading, DESTINATION_READING_FIELDS, `${path}.${readingField}` );
    }
  }

  const panels = value[ "panels" ];
  if( !Array.isArray( panels ) ) throw new Error( `${path}.panels must be an array.` );
  panels.forEach( ( panel, panelIndex ) => {
    const panelPath = `${path}.panels[${panelIndex}]`;
    assertDestinationObject( panel, DESTINATION_PANEL_FIELDS, panelPath );
    const metrics = panel[ "metrics" ];
    if( !Array.isArray( metrics ) ) throw new Error( `${panelPath}.metrics must be an array.` );
    metrics.forEach( ( metric, metricIndex ) => {
      const metricPath = `${panelPath}.metrics[${metricIndex}]`;
      assertDestinationObject( metric, DESTINATION_METRIC_FIELDS, metricPath );
    });
  });

  const strain = value[ "strain" ];
  if( strain !== undefined && strain !== null ) {
    assertDestinationObject( strain, DESTINATION_STRAIN_FIELDS, `${path}.strain` );
  }
  const certificate = value[ "certificate" ];
  assertDestinationObject( certificate, DESTINATION_CERTIFICATE_FIELDS, `${path}.certificate` );
  const certificateAsset = certificate[ "asset" ];
  assertDestinationObject(
    certificateAsset,
    DESTINATION_CERTIFICATE_ASSET_FIELDS,
    `${path}.certificate.asset`,
  );
  assertDestinationObject(
    certificateAsset[ "asset" ],
    DESTINATION_ASSET_REFERENCE_FIELDS,
    `${path}.certificate.asset.asset`,
  );
}

export function normalizeCoaFetchResult( value: unknown ): Coa {
  const path = "COA fetch result";
  assertRecord( value, path );
  assertExactFields( value, FETCH_RESULT_FIELDS, path );
  assertDestinationAudit( value[ "destination" ] );
  const normalizedValue = normalizeCoa( value[ "coa" ] );
  assertCoa( normalizedValue );
  return normalizedValue;
}

function assertUniqueCoaSourceIds( coas: Coa[], description: string ): void {
  const sourceIds = new Set<string>();
  for( const coa of coas ) {
    if( sourceIds.has( coa.sourceId ) ) {
      throw new Error( `duplicate COA ${description} for source ID ${coa.sourceId}.` );
    }
    sourceIds.add( coa.sourceId );
  }
}

export function normalizeCoaFetchResults( value: unknown ): Coa[] {
  if( !Array.isArray( value ) ) throw new Error( "COA query must return an array." );
  const coas = value.map( normalizeCoaFetchResult );
  assertUniqueCoaSourceIds( coas, "source ID" );
  return coas;
}

export async function fetchCoasFromDestination( fetcher: CoaDestinationFetcher ): Promise<Coa[]> {
  return normalizeCoaFetchResults( await fetcher( COA_LIST_QUERY ) );
}

export async function fetchCoaBySourceIdFromDestination(
  fetcher: CoaDestinationFetcher,
  sourceId: string,
): Promise<Coa | null> {
  const value = await fetcher( COA_BY_SOURCE_ID_QUERY, { sourceId });
  if( value === null ) return null;
  return normalizeCoaFetchResult( value );
}

export interface CoaStaticPath {
  params: { sourceId: string };
  props: { coa: Coa };
}

export function prepareCoaStaticPaths( coas: Coa[] ): CoaStaticPath[] {
  assertUniqueCoaSourceIds( coas, "static route" );
  return coas.map( coa => ({
    params: { sourceId: coa.sourceId },
    props: { coa },
  }) );
}

export function resolveCoaRouteDocument( sourceId: string, directlyFetchedCoa: Coa ): Coa {
  if( directlyFetchedCoa.sourceId !== sourceId ) {
    throw new Error( `COA build data drifted for source ID ${sourceId}.` );
  }
  return directlyFetchedCoa;
}
