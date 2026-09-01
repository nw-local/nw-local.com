import { isGlossaryCategory } from "../../shared/glossary-categories.ts";
import { firstBlankGlossaryAliasIndex } from "../../shared/glossary-validation.ts";
import type { GlossaryTerm, GlossaryTermSummary } from "./sanity";

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
