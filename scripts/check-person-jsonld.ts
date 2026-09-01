#!/usr/bin/env node

import { buildPerson } from "../src/lib/jsonld.ts";

const author = {
  _id: "author-ben-petty",
  name: "Ben Petty",
  slug: { current: "ben-petty" },
  role: "Co-Founder",
  email: "benny@nw-local.com",
  sameAs: [ "https://example.com/ben-petty" ],
};

const person = buildPerson({
  author,
  siteUrl: "https://nw-local.com/",
  photoUrl: "https://cdn.sanity.io/ben-petty.jpg",
});

const failures: string[] = [];

function expectEqual( label: string, actual: unknown, expected: unknown ): void {
  if( !Object.is( actual, expected ) ) {
    failures.push( `${label}: expected ${JSON.stringify( expected )}, got ${JSON.stringify( actual )}` );
  }
}

expectEqual( "person type", person[ "@type" ], "Person" );
expectEqual( "person URL", person.url, "https://nw-local.com/authors/ben-petty/" );
expectEqual( "person email", person.email, "benny@nw-local.com" );

const { email: omittedEmail, ...authorWithoutEmail } = author;
void omittedEmail;
const personWithoutEmail = buildPerson({
  author: authorWithoutEmail,
  siteUrl: "https://nw-local.com/",
});
expectEqual(
  "absent author email is omitted from Person metadata",
  "email" in personWithoutEmail,
  false,
);

if( failures.length > 0 ) {
  for( const failure of failures ) console.error( `FAIL: ${failure}` );
  process.exit( 1 );
}

console.log( "Person JSON-LD checks passed." );
