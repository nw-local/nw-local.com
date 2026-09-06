export interface DisclosureSearchRecord {
  publicCode: string;
  strain: string;
  grade?: string;
}

export function normalizeDisclosureSearchText( value: string ): string {
  return value
    .normalize( "NFKD" )
    .replace( /\p{M}+/gu, "" )
    .toLowerCase()
    .replace( /[\p{P}\p{S}]+/gu, " " )
    .replace( /\s+/g, " " )
    .trim();
}

function disclosureSearchText( record: DisclosureSearchRecord ): string {
  return normalizeDisclosureSearchText(
    [ record.publicCode, record.strain, record.grade ?? "" ].join( " " ),
  );
}

export function filterPesticideDisclosures(
  records: readonly DisclosureSearchRecord[],
  query: string,
): string[] {
  const normalizedQuery = normalizeDisclosureSearchText( query );
  return records
    .filter( record => !normalizedQuery || disclosureSearchText( record ).includes( normalizedQuery ) )
    .map( record => record.publicCode );
}
