/**
 * Stable anchor ids for Portable Text headings.
 *
 * Section headings are linkable across posts, so the id has to stay put: it is
 * derived from the heading's own text rather than from its position or its
 * Sanity `_key`. `_key` would be stable too, but `#h52` tells a reader nothing
 * and cannot survive a heading being rewritten in a way anyone would notice.
 */

/**
 * Slugify heading text into an anchor id.
 *
 * Heading text here carries degree symbols, parentheses, colons and en dashes
 * (`Canopy temperature: 76 to 78 °F (24 to 26 °C) becomes ...`), so the rule is
 * to keep ASCII alphanumerics, fold everything else to a separator, and collapse
 * runs. Accented characters are decomposed first so `é` becomes `e` rather than
 * being dropped, which would silently weld two words together.
 */
export function headingId( text: string ): string {
  const slug = text
    .normalize( "NFKD" )
    // Strip combining marks left behind by the decomposition above.
    .replace( /[̀-ͯ]/g, "" )
    .toLowerCase()
    .replace( /[^a-z0-9]+/g, "-" )
    .replace( /^-+|-+$/g, "" );

  // A heading of nothing but symbols would slugify to an empty string, and an
  // `id=""` is invalid and unlinkable. Fail loudly rather than emit one: this
  // is a content problem, and the build is the only place anyone would see it.
  if( !slug ) {
    throw new Error(
      `Heading produced an empty anchor id: ${ JSON.stringify( text ) }`,
    );
  }

  return slug;
}

/**
 * A Portable Text child that carries rendered text.
 *
 * `children` is not all spans: a block can hold inline objects that have no
 * `text` at all, so this narrows rather than assuming. A guard is used instead
 * of a cast so a future child shape cannot be waved through the type checker.
 */
function hasText( child: unknown ): child is { text: string } {
  return (
    typeof child === "object" &&
    child !== null &&
    "text" in child &&
    typeof child.text === "string"
  );
}

/**
 * Extract the plain text of a Portable Text block.
 *
 * Marks live on spans, so a heading carrying bold or a link arrives as several
 * children rather than one. Joining them is what makes the id reflect the whole
 * heading instead of its first fragment.
 */
export function blockText( node: { children?: readonly unknown[] }): string {
  return ( node.children ?? [] )
    .filter( hasText )
    .map( child => child.text )
    .join( "" );
}
