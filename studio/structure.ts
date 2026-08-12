// The Studio sidebar, as data.
//
// Registering a document type in schemaTypes/index.ts is necessary but not
// sufficient for an editor to reach it: a type with no sidebar entry still exists
// in the dataset and still renders on the public site, but is invisible in the
// Studio and editable only by direct URL or API. That went unnoticed for
// `glossaryTerm` and `terpene` until 15 published documents had accumulated behind
// it, and nearly happened again with `author`.
//
// So this list is curation only — order, grouping, and display titles. Any
// registered document type it does not mention is appended automatically under its
// raw type name, which is deliberately ugly: the type stays reachable, and the
// ugliness is the prompt to give it a proper home here.
//
// A build-time assertion was tried first and does not work. `sanity build` bundles
// the config for the browser rather than evaluating it, so a throw there never
// fails the build; it only fires when someone loads the Studio, taking the whole
// Studio down over one missing entry. Correct-by-construction removes the need for
// the check.
//
// This module deliberately imports nothing, so the planning logic can be run and
// checked outside the Studio bundle.

export type StructureEntry =
  | { kind: 'divider' }
  | { kind: 'list'; type: string; title: string }
  | { kind: 'singleton'; type: string; title: string }

// Singleton entries assume the document ID equals the type name, which holds for
// both of the current ones.
export const STRUCTURE: StructureEntry[] = [
  { kind: 'singleton', type: 'siteSettings', title: 'Site Settings' },
  { kind: 'divider' },
  { kind: 'list', type: 'strain', title: 'Strains' },
  { kind: 'list', type: 'product', title: 'Products' },
  { kind: 'divider' },
  { kind: 'list', type: 'blogPost', title: 'Blog Posts' },
  { kind: 'list', type: 'author', title: 'Authors' },
  { kind: 'divider' },
  { kind: 'list', type: 'glossaryTerm', title: 'Glossary' },
  { kind: 'list', type: 'terpene', title: 'Terpenes' },
  { kind: 'divider' },
  { kind: 'list', type: 'retailer', title: 'Retailers' },
  { kind: 'singleton', type: 'retailerPage', title: 'For Retailers Page' },
  { kind: 'divider' },
  { kind: 'list', type: 'page', title: 'Pages' },
]

export const SINGLETON_TYPES = new Set(
  STRUCTURE.flatMap((entry) => (entry.kind === 'singleton' ? [entry.type] : [])),
)

export interface SidebarPlan {
  /** Curated entries, minus any naming a type that is not registered. */
  entries: StructureEntry[]
  /** Registered document types with no curated entry, appended after a divider. */
  appended: string[]
}

/**
 * Decide what the sidebar shows, given the document types actually registered.
 *
 * Entries naming an unregistered type are dropped rather than rendered, because
 * documentTypeListItem on an unknown type produces a list that can never contain
 * anything. If the name was a typo, the real type falls through to `appended`,
 * which is the visible signal that something needs fixing.
 */
export function planSidebar(documentTypes: string[]): SidebarPlan {
  const curated = new Set(
    STRUCTURE.flatMap((entry) => (entry.kind === 'divider' ? [] : [entry.type])),
  )

  return {
    entries: STRUCTURE.filter(
      (entry) => entry.kind === 'divider' || documentTypes.includes(entry.type),
    ),
    appended: documentTypes.filter((name) => !curated.has(name)),
  }
}
