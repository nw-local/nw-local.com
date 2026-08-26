import { defineArrayMember, defineField, defineType } from 'sanity'

// Both validation inputs arrive as `unknown`, so they are narrowed rather than
// asserted. An `as` cast here would compile happily against a document shape
// that no longer exists and fail silently at the moment the check matters.
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Column count declared on the parent tableBlock, or null if not readable. */
function countHeaders(parent: unknown): number | null {
  if (!isRecord(parent) || !Array.isArray(parent.headers)) return null
  return parent.headers.length > 0 ? parent.headers.length : null
}

/** Cell count for one row. An unreadable row counts as 0, which is ragged. */
function countCells(row: unknown): number {
  if (!isRecord(row) || !Array.isArray(row.cells)) return 0
  return row.cells.length
}

// A reference table inside body copy. Deliberately plain strings rather than
// nested Portable Text: cells are setpoints and short labels, and allowing rich
// text inside them would mean a second renderer and a much heavier editing
// surface for no gain on the content we actually write.
export const tableBlockType = defineType({
  name: 'tableBlock',
  title: 'Table',
  type: 'object',
  fields: [
    defineField({
      name: 'caption',
      title: 'Caption',
      type: 'string',
      description:
        'Optional. Rendered above the table as its heading, so name the reference: "Setpoints by stage", not "A table showing setpoints".',
    }),
    defineField({
      name: 'headers',
      title: 'Column headers',
      type: 'array',
      of: [{ type: 'string' }],
      description: 'One entry per column. Every row must have exactly this many cells.',
      validation: (rule) => rule.required().min(1),
    }),
    defineField({
      name: 'rows',
      title: 'Rows',
      type: 'array',
      of: [
        defineArrayMember({
          name: 'tableRow',
          title: 'Row',
          type: 'object',
          fields: [
            defineField({
              name: 'cells',
              title: 'Cells',
              type: 'array',
              // `text` rather than `string` so a cell can hold a line break.
              // Sanity renders a string field as a single-line input, which
              // cannot accept one, so a newline written through the API would
              // be uneditable here and could be dropped on the next save. The
              // column headers above stay `string` deliberately: a header short
              // enough to be a good header never needs to break.
              of: [{ type: 'text', rows: 2 }],
              description:
                'One per column. A line break inside a cell renders as a line break, which is how a temperature keeps its Celsius conversion on its own line.',
              validation: (rule) => rule.required().min(1),
            }),
            defineField({
              name: 'highlight',
              title: 'Highlight this row',
              type: 'boolean',
              description:
                'Marks the row as the one that matters most. Use it once per table at most; highlighting everything highlights nothing.',
              initialValue: false,
            }),
          ],
          preview: {
            select: { cells: 'cells', highlight: 'highlight' },
            prepare: ({ cells, highlight }) => ({
              title:
                (cells ?? [])
                  .map((cell: unknown) => String(cell ?? '').replace(/\s+/g, ' '))
                  .join('  ·  ') || '(empty row)',
              subtitle: highlight ? 'highlighted' : undefined,
            }),
          },
        }),
      ],
      // Ragged rows are the failure mode this type invites, and the renderer
      // throws on them at build time. Catching it here means an editor sees it
      // while they can still fix it, rather than as a red deploy an hour later.
      validation: (rule) =>
        rule
          .required()
          .min(1)
          .custom((rows, context) => {
            const expected = countHeaders(context.parent)
            if (expected === null || !Array.isArray(rows)) return true
            const ragged = rows
              .map((row, index) => ({ index, count: countCells(row) }))
              .filter((row) => row.count !== expected)
            if (ragged.length === 0) return true
            const detail = ragged.map((row) => `row ${row.index + 1} has ${row.count}`).join(', ')
            return `Every row needs exactly ${expected} cells to match the headers: ${detail}.`
          }),
    }),
  ],
  preview: {
    select: { caption: 'caption', headers: 'headers', rows: 'rows' },
    prepare: ({ caption, headers, rows }) => ({
      title: caption || (headers ?? []).join('  ·  ') || 'Table',
      subtitle: `${(rows ?? []).length} rows × ${(headers ?? []).length} columns`,
    }),
  },
})
