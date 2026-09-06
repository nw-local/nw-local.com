import { filterPesticideDisclosures, type DisclosureSearchRecord } from "./pesticide-search.ts";

const QUERY_PARAM = "q";

interface DisclosureRow {
  element: HTMLElement;
  record: DisclosureSearchRecord;
}

function requireElement( selector: string, errorMessage: string ): HTMLElement {
  const candidate = document.querySelector( selector );
  if( !( candidate instanceof HTMLElement ) ) throw new Error( errorMessage );
  return candidate;
}

function collectDisclosureRows(): DisclosureRow[] {
  return Array.from( document.querySelectorAll( "[data-disclosure-row]" ) ).map( element => {
    if( !( element instanceof HTMLElement ) ) {
      throw new Error( "Pesticide disclosure rows must be HTML elements." );
    }

    const publicCode = element.dataset.disclosureRowId;
    const strain = element.dataset.disclosureRowStrain;
    const grade = element.dataset.disclosureRowGrade;
    if( !publicCode || !strain ) {
      throw new Error( "Pesticide disclosure row is missing search metadata." );
    }

    return {
      element,
      record: { publicCode, strain, grade: grade || undefined },
    };
  });
}

function readQueryParam(): string {
  return new URLSearchParams( window.location.search ).get( QUERY_PARAM ) ?? "";
}

function syncQueryParam( query: string ): void {
  const params = new URLSearchParams( window.location.search );
  if( query ) params.set( QUERY_PARAM, query );
  else params.delete( QUERY_PARAM );

  const search = params.toString();
  const nextUrl = `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`;
  history.replaceState({}, "", nextUrl );
}

export function initializePesticideBrowser(): void {
  const searchControls = requireElement(
    "[data-disclosure-controls]",
    "Pesticide search control band is missing.",
  );

  const queryInputCandidate = document.querySelector( "[data-disclosure-query]" );
  if( !( queryInputCandidate instanceof HTMLInputElement ) ) {
    throw new Error( "Pesticide search input is missing." );
  }
  const queryInput = queryInputCandidate;

  const resultCount = requireElement(
    "[data-disclosure-result-count]",
    "Pesticide result count is missing.",
  );

  const emptyState = requireElement(
    "[data-disclosure-empty]",
    "Pesticide empty state is missing.",
  );

  const rows = collectDisclosureRows();

  function render(): void {
    const matchingIds = new Set(
      filterPesticideDisclosures( rows.map( row => row.record ), queryInput.value ),
    );

    for( const row of rows ) {
      row.element.hidden = !matchingIds.has( row.record.publicCode );
    }

    const matchCount = matchingIds.size;
    resultCount.textContent = `${matchCount} ${matchCount === 1 ? "lot" : "lots"}`;
    emptyState.hidden = matchCount !== 0;
  }

  queryInput.addEventListener( "input", () => {
    render();
    syncQueryParam( queryInput.value );
  });

  queryInput.value = readQueryParam();
  render();
  searchControls.hidden = false;
}
