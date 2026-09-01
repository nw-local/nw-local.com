#!/usr/bin/env node
/**
 * Exercise the progressive glossary controller without a server or DOM package.
 *
 * The small element double implements only browser behavior the controller
 * consumes. The assertions cover observable filtering and input behavior, not
 * the double itself.
 */

import type { GlossaryBrowserEnvironment } from "../src/lib/glossary-browser.ts";

type TestListener = () => void;

class TestElement {
  dataset: Record<string, string> = {};
  hidden = false;
  textContent: string | null = "";
  focused = false;

  private readonly attributes = new Map<string, string>();
  private readonly listeners = new Map<string, TestListener[]>();
  private readonly queryResults = new Map<string, TestElement[]>();

  setQueryResults( selector: string, elements: TestElement[] ): void {
    this.queryResults.set( selector, elements );
  }

  querySelector( selector: string ): TestElement | null {
    return this.queryResults.get( selector )?.[ 0 ] ?? null;
  }

  querySelectorAll( selector: string ): TestElement[] {
    return this.queryResults.get( selector ) ?? [];
  }

  addEventListener( eventName: string, listener: TestListener ): void {
    const listeners = this.listeners.get( eventName ) ?? [];
    listeners.push( listener );
    this.listeners.set( eventName, listeners );
  }

  dispatch( eventName: string ): void {
    for( const listener of this.listeners.get( eventName ) ?? [] ) listener();
  }

  setAttribute( name: string, value: string ): void {
    this.attributes.set( name, value );
  }

  focus(): void {
    this.focused = true;
  }
}

class TestInputElement extends TestElement {
  value = "";
}

class TestButtonElement extends TestElement {}

Object.defineProperties( globalThis, {
  HTMLElement: { value: TestElement, configurable: true },
  HTMLInputElement: { value: TestInputElement, configurable: true },
  HTMLButtonElement: { value: TestButtonElement, configurable: true },
});

const { initializeGlossaryBrowser } = await import( "../src/lib/glossary-browser.ts" );

const failures: string[] = [];

function expectEqual( label: string, actual: unknown, expected: unknown ): void {
  if( !Object.is( actual, expected ) ) {
    failures.push( `${label}: expected ${JSON.stringify( expected )}, got ${JSON.stringify( actual )}` );
  }
}

function expectIncludes( label: string, actual: string | null, expected: string ): void {
  if( !actual?.includes( expected ) ) {
    failures.push( `${label}: expected ${JSON.stringify( actual )} to include ${JSON.stringify( expected )}` );
  }
}

function filterButton( value: string ): TestButtonElement {
  const button = new TestButtonElement();
  button.dataset.filterValue = value;
  return button;
}

function directoryEntry(
  id: string,
  term: string,
  initial: string,
  category: string,
  searchText: string,
): TestElement {
  const entry = new TestElement();
  entry.dataset.glossaryId = id;
  entry.dataset.glossaryTerm = term;
  entry.dataset.glossaryInitial = initial;
  entry.dataset.glossaryCategory = category;
  entry.dataset.glossarySearchText = searchText;
  return entry;
}

const searchRoot = new TestElement();
const searchControls = new TestElement();
searchControls.hidden = true;
const queryInput = new TestInputElement();
const resultCount = new TestElement();
const clearButton = new TestButtonElement();
const emptyState = new TestElement();
const emptyStateMessage = new TestElement();
const allLettersButton = filterButton( "" );
const eLetterButton = filterButton( "e" );
const allCategoriesButton = filterButton( "" );
const nutritionButton = filterButton( "nutrition" );
const ecEntry = directoryEntry(
  "ec",
  "Electrical conductivity (EC)",
  "e",
  "nutrition",
  "electrical conductivity ec fertilizer nutrition",
);
const vaporPressureEntry = directoryEntry(
  "vpd",
  "Vapor pressure deficit (VPD)",
  "v",
  "environment",
  "vapor pressure deficit vpd environment",
);

searchRoot.setQueryResults( "[data-glossary-controls]", [ searchControls ] );
searchRoot.setQueryResults( "[data-glossary-query]", [ queryInput ] );
searchRoot.setQueryResults( "[data-glossary-result-count]", [ resultCount ] );
searchRoot.setQueryResults( "[data-glossary-clear]", [ clearButton ] );
searchRoot.setQueryResults( "[data-glossary-empty]", [ emptyState ] );
searchRoot.setQueryResults( "[data-glossary-empty-message]", [ emptyStateMessage ] );
searchRoot.setQueryResults( "[data-glossary-entry]", [ ecEntry, vaporPressureEntry ] );
searchControls.setQueryResults(
  "[data-glossary-letter]",
  [ allLettersButton, eLetterButton ],
);
searchControls.setQueryResults(
  "[data-glossary-category-filter]",
  [ allCategoriesButton, nutritionButton ],
);

// A root-wide category query deliberately includes an entry. Initialization
// succeeds only when the controller scopes filter discovery to the controls.
searchRoot.setQueryResults(
  "[data-glossary-category-filter]",
  [ allCategoriesButton, nutritionButton, ecEntry ],
);

let browserLocation = { pathname: "/glossary/", search: "", hash: "" };
let popStateListener = (): void => {};
const browserEnvironment: GlossaryBrowserEnvironment = {
  readLocation: () => browserLocation,
  updateHistory: ( _method, nextUrl ) => {
    const parsedUrl = new URL( nextUrl, "https://nw-local.test" );
    browserLocation = {
      pathname: parsedUrl.pathname,
      search: parsedUrl.search,
      hash: parsedUrl.hash,
    };
  },
  onPopState: listener => {
    popStateListener = listener;
  },
};

try {
  initializeGlossaryBrowser( searchRoot, browserEnvironment );
} catch ( error ) {
  failures.push( `initialization: ${error instanceof Error ? error.message : String( error )}` );
}

expectEqual( "controls reveal after successful initialization", searchControls.hidden, false );

queryInput.value = "vapor ";
queryInput.dispatch( "input" );
expectEqual( "typing preserves a trailing word separator", queryInput.value, "vapor " );
expectEqual( "first search word keeps the matching entry", vaporPressureEntry.hidden, false );
expectEqual( "first search word hides a nonmatch", ecEntry.hidden, true );

queryInput.value += "pressure";
queryInput.dispatch( "input" );
expectEqual( "a second search word remains separated", queryInput.value, "vapor pressure" );
expectEqual( "multi-word search keeps the matching entry", vaporPressureEntry.hidden, false );

queryInput.value = "not present";
queryInput.dispatch( "input" );
expectEqual( "zero-result state appears", emptyState.hidden, false );
expectIncludes( "zero-result state names the active query", emptyStateMessage.textContent, "not present" );

// Keep the registered callback live in the test surface and prove restoration
// uses the same render path without manufacturing a separate controller state.
browserLocation = { pathname: "/glossary/", search: "?q=conductivity", hash: "" };
popStateListener();
expectEqual( "popstate restores the query input", queryInput.value, "conductivity" );
expectEqual( "popstate restores matching entries", ecEntry.hidden, false );

queryInput.value = "";
queryInput.dispatch( "input" );
nutritionButton.dispatch( "click" );
expectEqual( "category selection hides entries outside the category", vaporPressureEntry.hidden, true );
nutritionButton.dispatch( "click" );
expectEqual( "clicking the active category deselects it", vaporPressureEntry.hidden, false );
expectEqual( "deselecting the category removes it from the URL", browserLocation.search, "" );

eLetterButton.dispatch( "click" );
expectEqual( "letter selection hides entries with another initial", vaporPressureEntry.hidden, true );
eLetterButton.dispatch( "click" );
expectEqual( "clicking the active letter deselects it", vaporPressureEntry.hidden, false );
expectEqual( "deselecting the letter removes it from the URL", browserLocation.search, "" );

if( failures.length > 0 ) {
  console.error( "Glossary browser controller contract violated:" );
  for( const failure of failures ) console.error( `  - ${failure}` );
  process.exit( 1 );
}

console.log( "Glossary browser controller contract holds" );
