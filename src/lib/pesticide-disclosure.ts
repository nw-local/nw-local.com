export interface PesticideApplication {
  productName: string;
  activeIngredient: string;
  epaRegistrationNumber: string;
  appliedOn: string; // "YYYY-MM-DD"
  targetPest: string;
}

export interface PesticideDisclosure {
  _id: string;
  publicCode: string;
  strain: string;
  grade?: string;
  noneApplied: boolean;
  applications: PesticideApplication[];
}

export const DISCLOSURE_DOCUMENT_ID_PREFIX = "disclosure.";

const DISCLOSURE_FIELDS = new Set( [
  "_id",
  "publicCode",
  "strain",
  "grade",
  "noneApplied",
  "applications",
] );
const APPLICATION_FIELDS = new Set( [
  "productName",
  "activeIngredient",
  "epaRegistrationNumber",
  "appliedOn",
  "targetPest",
] );
const SANITY_DOCUMENT_SYSTEM_FIELDS = [ "_id", "_type", "_rev", "_createdAt", "_updatedAt" ];
const SANITY_ARRAY_OBJECT_SYSTEM_FIELDS = [ "_key", "_type" ];
const DESTINATION_DOCUMENT_FIELDS = new Set( [
  ...SANITY_DOCUMENT_SYSTEM_FIELDS,
  "publicCode",
  "strain",
  "grade",
  "noneApplied",
  "applications",
] );
const DESTINATION_APPLICATION_FIELDS = new Set( [
  ...SANITY_ARRAY_OBJECT_SYSTEM_FIELDS,
  "productName",
  "activeIngredient",
  "epaRegistrationNumber",
  "appliedOn",
  "targetPest",
] );
const NULLABLE_DISCLOSURE_FIELDS = [ "grade" ];
const FETCH_RESULT_FIELDS = new Set( [ "disclosure", "destination" ] );
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
// The vendor-neutral public reference: NWL- + 5 Crockford base32 chars (alphabet
// excludes I L O U). Minted and stored uppercase by nw-local-ops; the route
// normalizes user input case before lookup.
const PUBLIC_CODE_PATTERN = /^NWL-[0-9ABCDEFGHJKMNPQRSTVWXYZ]{5}$/;

// The buyer projection is the whole document minus Sanity system noise. grade is
// conditionally projected so an absent grade is omitted rather than sent as null.
export const DISCLOSURE_BUYER_PROJECTION = `{
  _id, publicCode, strain, noneApplied,
  defined(grade) => { "grade": grade },
  "applications": coalesce( applications[] {
    productName, activeIngredient, epaRegistrationNumber, appliedOn, targetPest
  }, [] )
}`;

const DISCLOSURE_FETCH_PROJECTION = `{
  "disclosure": ${DISCLOSURE_BUYER_PROJECTION},
  "destination": @
}`;

export const DISCLOSURE_LIST_QUERY =
  `*[_type == "pesticideDisclosure"] | order(publicCode asc) ${DISCLOSURE_FETCH_PROJECTION}`;
// Case-insensitive by-code lookup: a scanned uppercase code and a typed lowercase
// code resolve to the same lot.
export const DISCLOSURE_BY_PUBLIC_CODE_QUERY =
  `*[_type == "pesticideDisclosure" && lower(publicCode) == lower($publicCode)][0] ${DISCLOSURE_FETCH_PROJECTION}`;

export type PesticideDisclosureFetcher = (
  query: string,
  parameters?: Record<string, string>,
) => Promise<unknown>;

export function isRecord( value: unknown ): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray( value );
}

function assertRecord( value: unknown, path: string ): asserts value is Record<string, unknown> {
  if( !isRecord( value ) ) throw new Error( `${path} must be an object.` );
}

function assertExactFields(
  value: Record<string, unknown>,
  fields: ReadonlySet<string>,
  path: string,
): void {
  for( const fieldName of Object.keys( value ) ) {
    if( !fields.has( fieldName ) ) throw new Error( `${path} has an unknown field: ${fieldName}.` );
  }
}

function assertRequiredString( value: unknown, path: string ): asserts value is string {
  if( typeof value !== "string" || !value.trim() ) {
    throw new Error( `${path} must be a non-empty string.` );
  }
}

function assertCalendarDate( value: unknown, path: string ): asserts value is string {
  assertRequiredString( value, path );
  const match = DATE_PATTERN.exec( value );
  if( !match ) throw new Error( `${path} must be a YYYY-MM-DD date.` );
  const year = Number( match[1] );
  const month = Number( match[2] );
  const day = Number( match[3] );
  const daysInMonth = month >= 1 && month <= 12
    ? new Date( Date.UTC( year, month, 0 ) ).getUTCDate()
    : 0;
  if( day < 1 || day > daysInMonth ) throw new Error( `${path} must be a valid calendar date.` );
}

function assertApplication( value: unknown, path: string ): asserts value is PesticideApplication {
  assertRecord( value, path );
  assertExactFields( value, APPLICATION_FIELDS, path );
  assertRequiredString( value[ "productName" ], `${path}.productName` );
  assertRequiredString( value[ "activeIngredient" ], `${path}.activeIngredient` );
  assertRequiredString( value[ "epaRegistrationNumber" ], `${path}.epaRegistrationNumber` );
  assertCalendarDate( value[ "appliedOn" ], `${path}.appliedOn` );
  assertRequiredString( value[ "targetPest" ], `${path}.targetPest` );
}

export function assertPesticideDisclosure( value: unknown ): asserts value is PesticideDisclosure {
  const path = "Pesticide disclosure";
  assertRecord( value, path );
  assertExactFields( value, DISCLOSURE_FIELDS, path );

  const documentId = value[ "_id" ];
  assertRequiredString( documentId, `${path}._id` );
  if( !documentId.startsWith( DISCLOSURE_DOCUMENT_ID_PREFIX ) ) {
    throw new Error( `${path}._id must start with ${DISCLOSURE_DOCUMENT_ID_PREFIX}.` );
  }
  const lotUuid = documentId.slice( DISCLOSURE_DOCUMENT_ID_PREFIX.length );
  if( !UUID_PATTERN.test( lotUuid ) ) {
    throw new Error( `${path}._id must be ${DISCLOSURE_DOCUMENT_ID_PREFIX}<lot uuid>.` );
  }

  const publicCode = value[ "publicCode" ];
  assertRequiredString( publicCode, `${path}.publicCode` );
  if( !PUBLIC_CODE_PATTERN.test( publicCode ) ) {
    throw new Error( `${path}.publicCode must be NWL- followed by 5 Crockford base32 chars.` );
  }
  assertRequiredString( value[ "strain" ], `${path}.strain` );
  if( value[ "grade" ] !== undefined ) assertRequiredString( value[ "grade" ], `${path}.grade` );

  const noneApplied = value[ "noneApplied" ];
  if( typeof noneApplied !== "boolean" ) throw new Error( `${path}.noneApplied must be a boolean.` );

  const applications = value[ "applications" ];
  if( !Array.isArray( applications ) ) throw new Error( `${path}.applications must be an array.` );
  applications.forEach(
    ( application, index ) => assertApplication( application, `${path}.applications[${index}]` ),
  );

  if( noneApplied !== ( applications.length === 0 ) ) {
    throw new Error( `${path}.noneApplied must be true iff applications is empty.` );
  }
}

export function normalizePesticideDisclosure( value: unknown ): unknown {
  if( !isRecord( value ) ) return value;
  const normalized = { ...value };
  for( const fieldName of NULLABLE_DISCLOSURE_FIELDS ) {
    if( normalized[ fieldName ] === null ) delete normalized[ fieldName ];
  }
  return normalized;
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
  const path = "Pesticide disclosure destination";
  assertDestinationObject( value, DESTINATION_DOCUMENT_FIELDS, path );
  const applications = value[ "applications" ];
  if( applications !== undefined && applications !== null ) {
    if( !Array.isArray( applications ) ) throw new Error( `${path}.applications must be an array.` );
    applications.forEach( ( application, index ) => {
      assertDestinationObject(
        application,
        DESTINATION_APPLICATION_FIELDS,
        `${path}.applications[${index}]`,
      );
    });
  }
}

export function normalizeDisclosureFetchResult( value: unknown ): PesticideDisclosure {
  const path = "Pesticide disclosure fetch result";
  assertRecord( value, path );
  assertExactFields( value, FETCH_RESULT_FIELDS, path );
  assertDestinationAudit( value[ "destination" ] );
  const normalized = normalizePesticideDisclosure( value[ "disclosure" ] );
  assertPesticideDisclosure( normalized );
  return normalized;
}

function assertUniquePublicCodes( disclosures: PesticideDisclosure[], description: string ): void {
  const seen = new Set<string>();
  for( const disclosure of disclosures ) {
    if( seen.has( disclosure.publicCode ) ) {
      throw new Error( `duplicate pesticide disclosure ${description} for publicCode ${disclosure.publicCode}.` );
    }
    seen.add( disclosure.publicCode );
  }
}

export function normalizeDisclosureFetchResults( value: unknown ): PesticideDisclosure[] {
  if( !Array.isArray( value ) ) throw new Error( "Pesticide disclosure query must return an array." );
  const disclosures = value.map( normalizeDisclosureFetchResult );
  assertUniquePublicCodes( disclosures, "list result" );
  return disclosures;
}

export async function fetchPesticideDisclosuresFromDestination(
  fetcher: PesticideDisclosureFetcher,
): Promise<PesticideDisclosure[]> {
  return normalizeDisclosureFetchResults( await fetcher( DISCLOSURE_LIST_QUERY ) );
}

export async function fetchPesticideDisclosureByPublicCodeFromDestination(
  fetcher: PesticideDisclosureFetcher,
  publicCode: string,
): Promise<PesticideDisclosure | null> {
  const value = await fetcher( DISCLOSURE_BY_PUBLIC_CODE_QUERY, { publicCode });
  if( value === null ) return null;
  return normalizeDisclosureFetchResult( value );
}

export interface PesticideDisclosureStaticPath {
  params: { code: string };
  props: { disclosure: PesticideDisclosure };
}

export function preparePesticideDisclosureStaticPaths(
  disclosures: PesticideDisclosure[],
): PesticideDisclosureStaticPath[] {
  assertUniquePublicCodes( disclosures, "static route" );
  return disclosures.map( disclosure => ({
    params: { code: disclosure.publicCode },
    props: { disclosure },
  }) );
}

export function resolvePesticideDisclosureRouteDocument(
  publicCode: string,
  disclosure: PesticideDisclosure,
): PesticideDisclosure {
  if( disclosure.publicCode !== publicCode ) {
    throw new Error( `pesticide disclosure build data drifted for publicCode ${publicCode}.` );
  }
  return disclosure;
}
