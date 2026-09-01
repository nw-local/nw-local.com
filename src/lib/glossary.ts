import { isGlossaryCategory } from "../../shared/glossary-categories.ts";
import {
  firstBlankGlossaryAliasIndex,
  glossaryFeaturedMissingFields,
} from "../../shared/glossary-validation.ts";
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

    if(
      term.aliases !== undefined
      && term.aliases !== null
      && !Array.isArray( term.aliases )
    ) {
      throw new Error(
        `Glossary term ${term._id} has aliases that are not an array.`,
      );
    }

    const blankAliasIndex = firstBlankGlossaryAliasIndex( term.aliases );
    if( blankAliasIndex !== undefined ) {
      throw new Error(
        `Glossary term ${term._id} has a blank alias at index ${blankAliasIndex}.`,
      );
    }

    if( term.featured ) {
      const missingFields = glossaryFeaturedMissingFields({
        hasBody: term.hasBody,
        imageAsset: term.image?.asset,
        imageAlt: term.image?.alt,
        lastReviewedAt: term.lastReviewedAt,
      });

      if( missingFields.length > 0 ) {
        throw new Error(
          `Featured glossary term ${term._id} is missing: ${missingFields.join( ", " )}.`,
        );
      }
    } else if( term.image?.asset && !term.image.alt?.trim() ) {
      throw new Error(
        `Glossary term ${term._id} has an image asset but image.alt is missing or blank.`,
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

  return Math.max( 1, Math.ceil( wordCount / WORDS_PER_MINUTE ) );
}
