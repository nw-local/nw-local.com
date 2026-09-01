// Shared low-level helpers for reading text back out of Portable Text nodes.
//
// Both consumers walk a `children` array looking for text spans, but they do
// very different things with the result: jsonld.ts flattens whole blocks into a
// meta description, while PortableTextLink.astro compares one mark's text to its
// own href. The walk is the same mechanic; the orchestration around it is not,
// so only the walk lives here.

/**
 * Narrows an unknown Portable Text child to a text-bearing span.
 *
 * A `children` array holds text spans, nested spans, and arbitrary inline
 * objects, and only the first kind carries a `text` string.
 */
export function isTextSpan( child: unknown ): child is { text: string } {
  if( typeof child !== "object" || child === null ) return false;
  if( !( "text" in child ) ) return false;
  return typeof child.text === "string";
}

/**
 * Concatenates the text spans in a `children` array, ignoring anything else.
 *
 * Non-text children are skipped rather than rejected: an inline object inside a
 * link is unusual but legal, and the caller wants whatever prose is there.
 */
export function childrenToText( children: unknown ): string {
  if( !Array.isArray( children ) ) return "";
  return children
    .filter( isTextSpan )
    .map( child => child.text )
    .join( "" );
}
