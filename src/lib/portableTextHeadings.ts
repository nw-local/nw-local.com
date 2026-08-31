import { blockText, headingId } from "./headingId.ts";
import type { PortableText, PortableTextBlock } from "./sanity.ts";

export interface PortableTextHeadingRecord {
  id: string;
  level: 2 | 3;
  text: string;
}

function headingLevel( block: PortableTextBlock ): 2 | 3 | undefined {
  if( block.style === "h2" ) return 2;
  if( block.style === "h3" ) return 3;
  return undefined;
}

function preparedHeadingId( block: PortableTextBlock ): string | undefined {
  const candidate = block._headingId;
  if( typeof candidate === "string" && candidate ) return candidate;
  return undefined;
}

function headingText( block: PortableTextBlock ): string {
  const children = block.children;
  return Array.isArray( children ) ? blockText({ children }) : blockText({});
}

function blockLabel( block: PortableTextBlock ): string {
  return JSON.stringify( block._key ?? "unknown" );
}

/**
 * Assign collision-safe anchor ids to every h2 and h3 in source order.
 *
 * Non-heading blocks retain their identity. Heading blocks are cloned so the
 * source value remains usable by other consumers without a hidden mutation.
 */
export function preparePortableTextHeadings(
  value: PortableText,
): { value: PortableText; headings: PortableTextHeadingRecord[] } {
  const occurrences = new Map<string, number>();
  const headings: PortableTextHeadingRecord[] = [];

  const preparedValue = value.map( block => {
    const level = headingLevel( block );
    if( !level ) return block;

    const text = headingText( block );
    const baseId = headingId( text );
    const occurrence = ( occurrences.get( baseId ) ?? 0 ) + 1;
    occurrences.set( baseId, occurrence );

    const id = occurrence === 1 ? baseId : `${baseId}-${occurrence}`;
    headings.push({ id, level, text });

    return { ...block, _headingId: id };
  });

  return { value: preparedValue, headings };
}

/**
 * Require ids prepared by preparePortableTextHeadings before rendering a body
 * that has already been prepared for another consumer, such as a table of
 * contents. Re-preparing would duplicate work and make the two views diverge.
 */
export function validatePreparedPortableTextHeadings( value: PortableText ): void {
  for( const block of value ) {
    if( headingLevel( block ) && !preparedHeadingId( block ) ) {
      throw new Error(
        `Portable Text heading block ${blockLabel( block )} is missing a prepared _headingId.`,
      );
    }
  }
}
