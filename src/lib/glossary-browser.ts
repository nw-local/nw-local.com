import {
  filterGlossaryTerms,
  glossaryEmptyStateMessage,
  hasActiveGlossaryFilters,
  parseGlossaryFilters,
  serializeGlossaryFilters,
  type GlossaryFilters,
  type GlossarySearchRecord,
} from "./glossary-search.ts";

export interface GlossaryBrowserLocation {
  pathname: string;
  search: string;
  hash: string;
}

export interface GlossaryBrowserEnvironment {
  readLocation: () => GlossaryBrowserLocation;
  updateHistory: ( method: "push" | "replace", nextUrl: string ) => void;
  onPopState: ( listener: () => void ) => void;
}

interface GlossarySearchRoot {
  querySelector: ( selector: string ) => unknown;
  querySelectorAll: ( selector: string ) => Iterable<unknown>;
}

interface GlossaryDirectoryEntry {
  element: HTMLElement;
  record: GlossarySearchRecord;
}

function requireElement(
  searchRoot: GlossarySearchRoot,
  selector: string,
  errorMessage: string,
): HTMLElement {
  const candidate = searchRoot.querySelector( selector );
  if( !( candidate instanceof HTMLElement ) ) throw new Error( errorMessage );
  return candidate;
}

function collectButtons(
  searchControls: GlossarySearchRoot,
  selector: string,
): HTMLButtonElement[] {
  return Array.from( searchControls.querySelectorAll( selector ) ).map( element => {
    if( !( element instanceof HTMLButtonElement ) ) {
      throw new Error( `Glossary filter ${selector} must be a button.` );
    }
    return element;
  });
}

function collectDirectoryEntries( searchRoot: GlossarySearchRoot ): GlossaryDirectoryEntry[] {
  return Array.from( searchRoot.querySelectorAll( "[data-glossary-entry]" ) ).map( element => {
    if( !( element instanceof HTMLElement ) ) {
      throw new Error( "Glossary directory entries must be HTML elements." );
    }

    const id = element.dataset.glossaryId;
    const term = element.dataset.glossaryTerm;
    const initial = element.dataset.glossaryInitial;
    const category = element.dataset.glossaryCategory;
    const normalizedSearchText = element.dataset.glossarySearchText;
    if( !id || !term || !initial || !category || !normalizedSearchText ) {
      throw new Error( "Glossary directory entry is missing search metadata." );
    }

    return {
      element,
      record: {
        _id: id,
        term,
        shortDefinition: "",
        category,
        initial,
        searchText: normalizedSearchText,
      },
    };
  });
}

function updatePressedState(
  buttons: readonly HTMLButtonElement[],
  activeValue: string | undefined,
): void {
  for( const button of buttons ) {
    const buttonValue = button.dataset.filterValue ?? "";
    button.setAttribute( "aria-pressed", String( buttonValue === ( activeValue ?? "" ) ) );
  }
}

export function initializeGlossaryBrowser(
  searchRoot: GlossarySearchRoot,
  environment: GlossaryBrowserEnvironment,
): void {
  const searchControls = requireElement(
    searchRoot,
    "[data-glossary-controls]",
    "Glossary search control band is missing.",
  );

  const queryInputCandidate = searchRoot.querySelector( "[data-glossary-query]" );
  if( !( queryInputCandidate instanceof HTMLInputElement ) ) {
    throw new Error( "Glossary search input is missing." );
  }
  const queryInput = queryInputCandidate;

  const resultCount = requireElement(
    searchRoot,
    "[data-glossary-result-count]",
    "Glossary result count is missing.",
  );

  const clearButtonCandidate = searchRoot.querySelector( "[data-glossary-clear]" );
  if( !( clearButtonCandidate instanceof HTMLButtonElement ) ) {
    throw new Error( "Glossary clear button is missing." );
  }
  const clearButton = clearButtonCandidate;

  const emptyState = requireElement(
    searchRoot,
    "[data-glossary-empty]",
    "Glossary empty state is missing.",
  );
  const emptyStateMessage = requireElement(
    searchRoot,
    "[data-glossary-empty-message]",
    "Glossary empty-state message is missing.",
  );

  const featuredGuidesCandidate = searchRoot.querySelector( "[data-glossary-featured]" );
  if( featuredGuidesCandidate !== null && !( featuredGuidesCandidate instanceof HTMLElement ) ) {
    throw new Error( "Glossary featured guide container is invalid." );
  }
  const featuredGuides = featuredGuidesCandidate instanceof HTMLElement
    ? featuredGuidesCandidate
    : undefined;

  const letterButtons = collectButtons( searchControls, "[data-glossary-letter]" );
  const categoryButtons = collectButtons(
    searchControls,
    "[data-glossary-category-filter]",
  );
  const directoryEntries = collectDirectoryEntries( searchRoot );

  let filters: GlossaryFilters = parseGlossaryFilters(
    new URLSearchParams( environment.readLocation().search ),
  );

  function render( syncQueryInput = true ): void {
    const matchingIds = new Set(
      filterGlossaryTerms( directoryEntries.map( entry => entry.record ), filters ),
    );

    for( const entry of directoryEntries ) {
      entry.element.hidden = !matchingIds.has( entry.record._id );
    }

    const matchCount = matchingIds.size;
    const activeFilters = hasActiveGlossaryFilters( filters );
    if( syncQueryInput ) queryInput.value = filters.query;
    resultCount.textContent = `${matchCount} ${matchCount === 1 ? "term" : "terms"}`;
    clearButton.hidden = !activeFilters;
    emptyState.hidden = matchCount !== 0;
    emptyStateMessage.textContent = glossaryEmptyStateMessage( filters );
    if( featuredGuides ) featuredGuides.hidden = activeFilters;
    updatePressedState( letterButtons, filters.letter );
    updatePressedState( categoryButtons, filters.category );
  }

  function updateUrl( method: "push" | "replace" ): void {
    const params = serializeGlossaryFilters( filters );
    const query = params.toString();
    const location = environment.readLocation();
    const nextUrl = `${location.pathname}${query ? `?${query}` : ""}${location.hash}`;
    environment.updateHistory( method, nextUrl );
  }

  queryInput.addEventListener( "input", () => {
    filters = { ...filters, query: queryInput.value };
    render( false );
    updateUrl( "replace" );
  });

  for( const button of letterButtons ) {
    button.addEventListener( "click", () => {
      const letter = button.dataset.filterValue || undefined;
      filters = { ...filters, letter };
      render();
      updateUrl( "push" );
    });
  }

  for( const button of categoryButtons ) {
    button.addEventListener( "click", () => {
      const category = button.dataset.filterValue || undefined;
      filters = { ...filters, category };
      render();
      updateUrl( "push" );
    });
  }

  clearButton.addEventListener( "click", () => {
    filters = { query: "" };
    render();
    updateUrl( "push" );
    queryInput.focus();
  });

  environment.onPopState( () => {
    filters = parseGlossaryFilters(
      new URLSearchParams( environment.readLocation().search ),
    );
    render();
    updateUrl( "replace" );
  });

  render();
  updateUrl( "replace" );
  searchControls.hidden = false;
}
