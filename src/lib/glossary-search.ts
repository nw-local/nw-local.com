import {
  glossaryCategoryLabel,
  isGlossaryCategory,
} from "../../shared/glossary-categories.ts";
import type { GlossaryTermSummary } from "./sanity.ts";

const QUERY_PARAM = "q";
const LETTER_PARAM = "letter";
const CATEGORY_PARAM = "category";
const SINGLE_LETTER = /^[a-z]$/;

type GlossarySearchFields = Pick<
  GlossaryTermSummary,
  "_id" | "term" | "shortDefinition" | "aliases"
>;

export interface GlossarySearchRecord extends GlossarySearchFields {
  category: string;
  initial?: string;
  searchText?: string;
}

export interface GlossaryFilters {
  query: string;
  letter?: string;
  category?: string;
}

export function normalizeGlossarySearchText( value: string ): string {
  return value
    .normalize( "NFKD" )
    .replace( /\p{M}+/gu, "" )
    .toLowerCase()
    .replace( /[\p{P}\p{S}]+/gu, " " )
    .replace( /\s+/g, " " )
    .trim();
}

export function normalizeGlossaryQueryValue( value: string ): string {
  const trimmedValue = value.trim();
  return normalizeGlossarySearchText( trimmedValue ) ? trimmedValue : "";
}

export function hasActiveGlossaryFilters( filters: GlossaryFilters ): boolean {
  return Boolean(
    normalizeGlossaryQueryValue( filters.query )
    || filters.letter
    || filters.category,
  );
}

export function glossarySearchText( term: GlossarySearchRecord ): string {
  if( term.searchText !== undefined ) {
    return normalizeGlossarySearchText( term.searchText );
  }

  if( !isGlossaryCategory( term.category ) ) {
    throw new Error(
      `Glossary search record ${term._id} has unknown category ${JSON.stringify( term.category )}.`,
    );
  }

  return normalizeGlossarySearchText( [
    term.term,
    ...( term.aliases ?? [] ),
    term.shortDefinition,
    glossaryCategoryLabel( term.category ),
  ].join( " " ) );
}

export function filterGlossaryTerms(
  terms: readonly GlossarySearchRecord[],
  filters: GlossaryFilters,
): string[] {
  const normalizedQuery = normalizeGlossarySearchText(
    normalizeGlossaryQueryValue( filters.query ),
  );
  const normalizedLetter = normalizeGlossarySearchText( filters.letter ?? "" );

  return terms
    .filter( term => !normalizedQuery || glossarySearchText( term ).includes( normalizedQuery ) )
    .filter( term => !normalizedLetter
      || normalizeGlossarySearchText( term.initial ?? term.term ).startsWith( normalizedLetter ) )
    .filter( term => !filters.category || term.category === filters.category )
    .map( term => term._id );
}

export function parseGlossaryFilters( params: URLSearchParams ): GlossaryFilters {
  const query = normalizeGlossaryQueryValue( params.get( QUERY_PARAM ) ?? "" );
  const letterCandidate = params.get( LETTER_PARAM )?.trim().toLowerCase() ?? "";
  const categoryCandidate = params.get( CATEGORY_PARAM )?.trim() ?? "";
  const filters: GlossaryFilters = { query };

  if( SINGLE_LETTER.test( letterCandidate ) ) filters.letter = letterCandidate;
  if( isGlossaryCategory( categoryCandidate ) ) filters.category = categoryCandidate;

  return filters;
}

export function serializeGlossaryFilters( filters: GlossaryFilters ): URLSearchParams {
  const params = new URLSearchParams();
  const query = normalizeGlossaryQueryValue( filters.query );
  const letter = filters.letter?.trim().toLowerCase() ?? "";
  const category = filters.category?.trim() ?? "";

  if( query ) params.set( QUERY_PARAM, query );
  if( SINGLE_LETTER.test( letter ) ) params.set( LETTER_PARAM, letter );
  if( isGlossaryCategory( category ) ) params.set( CATEGORY_PARAM, category );

  return params;
}
