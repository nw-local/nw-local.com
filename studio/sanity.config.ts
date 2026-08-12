import { defineConfig } from 'sanity'
import { structureTool } from 'sanity/structure'
import { visionTool } from '@sanity/vision'
import { schemaTypes } from './schemaTypes'

const SINGLETON_TYPES = new Set(['siteSettings', 'retailerPage'])
const SINGLETON_ACTIONS = new Set(['publish', 'discardChanges', 'restore'])

export default defineConfig({
  name: 'nw-local',
  title: 'Northwest Local Cannabis',
  projectId: 'nyd3p2n0',
  dataset: 'production',
  plugins: [
    structureTool({
      structure: (S) =>
        S.list()
          .title('Content')
          .items([
            S.listItem()
              .title('Site Settings')
              .id('siteSettings')
              .child(S.document().schemaType('siteSettings').documentId('siteSettings')),
            S.divider(),
            S.documentTypeListItem('strain').title('Strains'),
            S.documentTypeListItem('product').title('Products'),
            S.divider(),
            S.documentTypeListItem('blogPost').title('Blog Posts'),
            S.documentTypeListItem('author').title('Authors'),
            S.divider(),
            S.documentTypeListItem('retailer').title('Retailers'),
            S.listItem()
              .title('For Retailers Page')
              .id('retailerPage')
              .child(S.document().schemaType('retailerPage').documentId('retailerPage')),
            S.divider(),
            S.documentTypeListItem('page').title('Pages'),
          ]),
    }),
    visionTool(),
  ],
  schema: {
    types: schemaTypes,
    templates: (templates) => templates.filter(({ schemaType }) => !SINGLETON_TYPES.has(schemaType)),
  },
  document: {
    actions: (input, context) =>
      SINGLETON_TYPES.has(context.schemaType)
        ? input.filter(({ action }) => action && SINGLETON_ACTIONS.has(action))
        : input,
  },
})
