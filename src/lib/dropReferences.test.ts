import { describe, expect, test } from "vitest";
import { stripDropReferences } from "./dropReferences.ts";
import type { PortableText } from "./sanity";

function linkBlock( key: string, text: string, markType: "link" | "glossaryRef" ): PortableText[number] {
  return {
    _type: "block",
    _key: key,
    style: "normal",
    markDefs: [ { _key: `${key}-mark`, _type: markType, href: "https://example.com" } ],
    children: [ { _type: "span", _key: `${key}-span`, text, marks: [ `${key}-mark` ] } ],
  };
}

function heading( key: string, style: string, text: string ): PortableText[number] {
  return {
    _type: "block",
    _key: key,
    style,
    markDefs: [],
    children: [ { _type: "span", _key: `${key}-span`, text, marks: [] } ],
  };
}

describe( "stripDropReferences", () => {
  test( "passes undefined through unchanged", () => {
    expect( stripDropReferences( undefined ) ).toBeUndefined();
  });

  test( "strips an external link mark to plain text, keeping the prose and decorators", () => {
    const value: PortableText = [
      {
        _type: "block", _key: "b1", style: "normal",
        markDefs: [ { _key: "m1", _type: "link", href: "https://compoundgenetics.example" } ],
        children: [
          { _type: "span", _key: "s1", text: "Bred by ", marks: [] },
          { _type: "span", _key: "s2", text: "Compound Genetics", marks: [ "m1" ] },
          { _type: "span", _key: "s3", text: " — potent.", marks: [ "strong" ] },
        ],
      },
    ];

    expect( stripDropReferences( value ) ).toEqual( [
      {
        _type: "block", _key: "b1", style: "normal", markDefs: [],
        children: [
          { _type: "span", _key: "s1", text: "Bred by ", marks: [] },
          { _type: "span", _key: "s2", text: "Compound Genetics", marks: [] },
          // The decorator survives; only the link mark is removed.
          { _type: "span", _key: "s3", text: " — potent.", marks: [ "strong" ] },
        ],
      },
    ] );
  });

  test( "strips a glossaryRef mark too", () => {
    const stripped = stripDropReferences( [ linkBlock( "b1", "myrcene", "glossaryRef" ) ] );
    expect( stripped ).toEqual( [
      {
        _type: "block", _key: "b1", style: "normal", markDefs: [],
        children: [ { _type: "span", _key: "b1-span", text: "myrcene", marks: [] } ],
      },
    ] );
  });

  test( "removes the Learn More heading and everything after it", () => {
    const value: PortableText = [
      heading( "intro", "h2", "About" ),
      linkBlock( "body", "Grown indoors.", "link" ),
      heading( "more", "h4", "Learn More" ),
      linkBlock( "leafly", "Leafly", "link" ),
      linkBlock( "seedfinder", "SeedFinder", "link" ),
    ];

    const stripped = stripDropReferences( value );
    expect( stripped ).toHaveLength( 2 );
    expect( stripped?.map( block => block._key ) ).toEqual( [ "intro", "body" ] );
  });

  test( "matches the Learn More heading case-insensitively and after trimming", () => {
    const value: PortableText = [
      heading( "intro", "h2", "About" ),
      heading( "more", "h3", "  learn more  " ),
      linkBlock( "leafly", "Leafly", "link" ),
    ];
    expect( stripDropReferences( value )?.map( block => block._key ) ).toEqual( [ "intro" ] );
  });

  test( "does not treat a normal paragraph reading 'Learn more' as the section heading", () => {
    const value: PortableText = [
      { _type: "block", _key: "p", style: "normal", markDefs: [], children: [ { _type: "span", _key: "s", text: "Learn more", marks: [] } ] },
    ];
    expect( stripDropReferences( value ) ).toHaveLength( 1 );
  });

  test( "leaves a description with no links or Learn More section untouched in content", () => {
    const value: PortableText = [ heading( "intro", "h2", "About" ) ];
    expect( stripDropReferences( value ) ).toEqual( value );
  });
});
