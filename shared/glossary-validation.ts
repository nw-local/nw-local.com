export type GlossaryFeaturedRequirement =
  | "body"
  | "image"
  | "image.alt"
  | "lastReviewedAt";

export interface GlossaryFeaturedFields {
  hasBody: boolean;
  imageAsset: unknown;
  imageAlt: unknown;
  lastReviewedAt: unknown;
}

export function hasGlossaryBody( body: unknown ): boolean {
  return Array.isArray( body ) && body.length > 0;
}

export function firstBlankGlossaryAliasIndex( aliases: unknown ): number | undefined {
  if( !Array.isArray( aliases ) ) return undefined;

  for( const [ aliasIndex, alias ] of aliases.entries() ) {
    if( typeof alias !== "string" || !alias.trim() ) return aliasIndex;
  }

  return undefined;
}

export function glossaryFeaturedMissingFields(
  fields: GlossaryFeaturedFields,
): GlossaryFeaturedRequirement[] {
  const missingFields: GlossaryFeaturedRequirement[] = [];
  if( !fields.hasBody ) missingFields.push( "body" );
  if( !fields.imageAsset ) missingFields.push( "image" );
  if( typeof fields.imageAlt !== "string" || !fields.imageAlt.trim() ) {
    missingFields.push( "image.alt" );
  }
  if( typeof fields.lastReviewedAt !== "string" || !fields.lastReviewedAt.trim() ) {
    missingFields.push( "lastReviewedAt" );
  }
  return missingFields;
}
