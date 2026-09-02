// Drop-page-only transform of a strain description's Portable Text.
//
// The drop page's job is to send a retail buyer to purchase, not off to a
// breeder or reference site, so on the DROP PAGE (never the strain page) two
// things are removed from the shared strain description:
//
//   1. Inline link marks are stripped to plain text — breeder and reference
//      names stay legible but stop being clickable. This is deterministic:
//      Portable Text marks are structured, so we drop the link/glossaryRef
//      markDefs and the span references to them and keep every decorator
//      (strong, em, code) untouched.
//
//   2. The trailing "Learn More" section (a heading followed by a list of
//      external reference links) is removed. This part is NOT structured — the
//      references live as free-form prose today — so it is matched by heading
//      text. That is a deliberately Drop-page-scoped stopgap for the September
//      launch; nw-local.com#101 promotes references to a structured strain
//      field and retires this heading match. Because the section is always the
//      tail of the description, everything from the first "Learn More" heading
//      onward is dropped.
//
// The strain page renders the untouched description, so nothing here changes
// what a strain page shows.

import type { PortableText, PortableTextBlock } from "./sanity";
import { childrenToText } from "./portableText";

// Annotation mark types that turn description text into an outbound link.
// Decorators (strong, em, code) are not here and are never stripped.
const LINK_MARK_TYPES: ReadonlySet<string> = new Set( [ "link", "glossaryRef" ] );
const HEADING_STYLES: ReadonlySet<string> = new Set( [ "h2", "h3", "h4" ] );
const REFERENCES_HEADING = "learn more";

interface MarkDef {
  _key: string;
  _type: string;
}

function isRecord( value: unknown ): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isMarkDef( value: unknown ): value is MarkDef {
  return isRecord( value ) && typeof value._key === "string" && typeof value._type === "string";
}

function isTextBlock( block: PortableTextBlock ): boolean {
  return block._type === "block";
}

function isReferencesHeading( block: PortableTextBlock ): boolean {
  if( !isTextBlock( block ) ) return false;
  const style = block[ "style" ];
  if( typeof style !== "string" || !HEADING_STYLES.has( style ) ) return false;
  return childrenToText( block[ "children" ] ).trim().toLowerCase() === REFERENCES_HEADING;
}

// Remove link/glossaryRef markDefs from a block and the span marks that point at
// them. Non-text blocks (image, video, table) carry no markDefs and pass
// through unchanged.
function stripLinkMarks( block: PortableTextBlock ): PortableTextBlock {
  if( !isTextBlock( block ) ) return block;

  const markDefs = Array.isArray( block[ "markDefs" ] ) ? block[ "markDefs" ] : [];
  const removedKeys = new Set(
    markDefs
      .filter( isMarkDef )
      .filter( markDef => LINK_MARK_TYPES.has( markDef._type ) )
      .map( markDef => markDef._key ),
  );

  if( removedKeys.size === 0 ) return block;

  const keptMarkDefs = markDefs.filter(
    markDef => !( isMarkDef( markDef ) && removedKeys.has( markDef._key ) ),
  );

  const children = Array.isArray( block[ "children" ] )
    ? block[ "children" ].map( child => {
      if( !isRecord( child ) || !Array.isArray( child.marks ) ) return child;
      return { ...child, marks: child.marks.filter( mark => !removedKeys.has( mark ) ) };
    })
    : block[ "children" ];

  return { ...block, markDefs: keptMarkDefs, children };
}

export function stripDropReferences( value: PortableText | undefined ): PortableText | undefined {
  if( !Array.isArray( value ) ) return value;
  const referencesIndex = value.findIndex( isReferencesHeading );
  const withoutReferences = referencesIndex === -1 ? value : value.slice( 0, referencesIndex );
  return withoutReferences.map( stripLinkMarks );
}
