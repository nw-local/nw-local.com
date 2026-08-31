import { isGlossaryCategory } from "../../shared/glossary-categories.ts";
import { blocksToText } from "./portableText.ts";
import type { GlossaryTerm, GlossaryTermSummary, PortableText } from "./sanity";

const WORDS_PER_MINUTE = 200;

export function validateGlossarySummaries(
  terms: readonly GlossaryTermSummary[],
): void {
  for( const term of terms ) {
    if( !isGlossaryCategory( term.category ) ) {
      throw new Error(
        `Glossary term ${term._id} has unknown category ${JSON.stringify( term.category )}.`,
      );
    }

    if( !term.featured ) continue;

    const missingFields: string[] = [];
    if( !term.hasBody ) missingFields.push( "body" );
    if( !term.image?.asset ) missingFields.push( "image" );
    if( !term.image?.alt?.trim() ) missingFields.push( "image.alt" );
    if( !term.lastReviewedAt ) missingFields.push( "lastReviewedAt" );

    if( missingFields.length > 0 ) {
      throw new Error(
        `Featured glossary term ${term._id} is missing: ${missingFields.join( ", " )}.`,
      );
    }
  }
}

export function validateGlossaryTerm( term: GlossaryTerm ): void {
  validateGlossarySummaries( [ term ] );

  for( const relatedTerm of term.relatedTerms ?? [] ) {
    if( !relatedTerm ) {
      throw new Error( `Glossary term ${term._id} has an unresolved related term reference.` );
    }

    if( !isGlossaryCategory( relatedTerm.category ) ) {
      throw new Error(
        `Glossary term ${relatedTerm._id} has unknown category ${JSON.stringify( relatedTerm.category )}.`,
      );
    }
  }
}

export function glossaryReadingMinutes( body: PortableText | undefined ): number | undefined {
  if( !body ) return undefined;

  const wordCount = blocksToText( body )
    .trim()
    .split( /\s+/ )
    .filter( Boolean )
    .length;

  return Math.ceil( wordCount / WORDS_PER_MINUTE );
}
