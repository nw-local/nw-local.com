import { defineConfig } from 'sanity'
import { structureTool } from 'sanity/structure'
import { visionTool } from '@sanity/vision'
import { schemaTypes } from './schemaTypes'
import { planSidebar, SINGLETON_TYPES } from './structure'

const SINGLETON_ACTIONS = new Set(['publish', 'discardChanges', 'restore'])

// blockContent is an object type shared by document bodies, not a document, so it
// has no sidebar entry and must not be given one.
const documentTypes: string[] = schemaTypes
  .filter((schemaType) => schemaType.type === 'document')
  .map((schemaType) => schemaType.name)

const sidebar = planSidebar(documentTypes)

export default defineConfig({
  name: 'nw-local',
  title: 'Northwest Local Cannabis',
  projectId: 'nyd3p2n0',
  dataset: 'production',
  plugins: [
    structureTool({
      structure: (S) => {
        const items = sidebar.entries.map((entry) => {
          if (entry.kind === 'divider') return S.divider()
          if (entry.kind === 'singleton') {
            return S.listItem()
              .title(entry.title)
              .id(entry.type)
              .child(S.document().schemaType(entry.type).documentId(entry.type))
          }
          return S.documentTypeListItem(entry.type).title(entry.title)
        })

        if (sidebar.appended.length > 0) {
          items.push(S.divider())
          for (const name of sidebar.appended) {
            items.push(S.documentTypeListItem(name).title(name))
          }
        }

        return S.list().title('Content').items(items)
      },
    }),
    visionTool(),
  ],
  schema: {
    types: schemaTypes,
    templates: (templates) =>
      templates.filter(({ schemaType }) => !SINGLETON_TYPES.has(schemaType)),
  },
  document: {
    actions: (input, context) =>
      SINGLETON_TYPES.has(context.schemaType)
        ? input.filter(({ action }) => action && SINGLETON_ACTIONS.has(action))
        : input,
  },
})
