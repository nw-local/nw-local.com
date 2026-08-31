// Fetch a published document's revision history from the Sanity History API.
//
// Resolves "which revision changed what, when" for content forensics: alt-text
// drift, silently dropped blocks, an edit that cannot be attributed to a known
// write. The published document keeps per-revision history, retrievable at any
// revision id, or as of any point in time with ?time=<ISO>. Draft-side history
// is NOT retained, so Studio draft saves leave no trace here; only publishes
// and published-doc mutations appear. Walk time to find the revision that
// first lacks a block, then check whether it also contains every change from
// your own patch: if it does, the patch landed intact and the absence came
// from elsewhere (a Studio edit riding the same publish is the usual suspect).
//
//   make sanity-history DOC=post-co2-enrichment
//   make sanity-history DOC=post-co2-enrichment "QUERY=revision=<revId>"
//   make sanity-history DOC=post-co2-enrichment "QUERY=time=2026-08-29T10:10:00.000Z"
//   MATCH="If you finish cool for color" make sanity-history ...
//   RAW=y make sanity-history ... ; prints the full JSON snapshot(s)
//
// Env comes from the Makefile (-include .env + export) and the token is read
// strictly from the environment, mirroring src/lib/sanity.ts. It is never
// printed; only HTTP status and revision metadata reach stdout.

// A file with no imports or exports is checked as a global script rather than
// a module, which collides a local `status` with the DOM's window.status.
export {};

const projectId = process.env.SANITY_PROJECT_ID;
const dataset = process.env.SANITY_DATASET;
const token = process.env.SANITY_API_TOKEN;

for( const [ envName, value ] of Object.entries({ projectId, dataset, token }) ) {
  if( !value ) {
    console.error( "Missing required env var " + envName + ". Run through a make target so .env is loaded." );
    process.exit( 1 );
  }
}

const argDocId = process.argv[ 2 ];
const argQuery = process.argv[ 3 ];
if( !argDocId ) {
  console.error( "Usage: make sanity-history DOC=<documentId> [QUERY=revision=<revId> | QUERY=time=<ISO>] [MATCH=<text>] [RAW=y]" );
  process.exit( 1 );
}

const url = "https://" + projectId + ".api.sanity.io/v1/data/history/" + dataset + "/documents/" + encodeURIComponent( argDocId ) + ( argQuery === undefined ? "" : "?" + argQuery );
const response = await fetch( url, { headers: { Authorization: "Bearer " + token } });
const status = response.status;
const bodyText = await response.text();

let data;
try {
  data = JSON.parse( bodyText );
} catch {
  console.log( "HTTP " + status + " - non-JSON response:" );
  console.log( bodyText.slice( 0, 500 ) );
  process.exit( status === 200 ? 0 : 1 );
}

if( status !== 200 ) {
  console.log( "HTTP " + status + " - " + ( data.error ? data.error.description : bodyText.slice( 0, 300 ) ) );
  process.exit( 1 );
}

// Sanity's History API needs an anchor: revision=<revId> or time=<ISO>. Without
// one it answers "None of revision id, time or last revision specified", so an
// unanchored call is a usage error, not missing history.
const documents = data.documents;
if( documents === undefined || documents.length === 0 ) {
  console.log( "No revision at this anchor. Known revision ids come from _rev on any query; ?time=<ISO> between mutations resolves the doc as of then." );
  process.exit( 0 );
}

if( process.env.SANITY_HISTORY_RAW === "y" || process.env.RAW === "y" ) {
  console.log( JSON.stringify( documents, null, 2 ) );
  process.exit( 0 );
}

const matchText = process.env.MATCH;
for( const doc of documents ) {
  const summary: Record<string, unknown> = {
    rev: doc._rev,
    updatedAt: doc._updatedAt,
    createdAt: doc._createdAt,
  };
  if( matchText !== undefined ) {
    summary.matches = JSON.stringify( doc ).includes( matchText );
  }
  console.log( JSON.stringify( summary ) );
}