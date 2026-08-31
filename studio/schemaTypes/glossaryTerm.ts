import { defineField, defineType } from 'sanity'
import { GLOSSARY_CATEGORIES } from '../../shared/glossary-categories'

function hasImageField(image: unknown, fieldName: string): boolean {
  return typeof image === 'object' && image !== null
    ? Object.entries(image).some(
        ([candidateFieldName, fieldValue]) =>
          candidateFieldName === fieldName && Boolean(fieldValue),
      )
    : false
}

export const glossaryTermType = defineType({
  name: 'glossaryTerm',
  title: 'Glossary Term',
  type: 'document',
  fields: [
    defineField({
      name: 'term',
      title: 'Term',
      type: 'string',
      description: 'The canonical name, e.g. "Anthocyanin"',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: { source: 'term', maxLength: 96 },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'shortDefinition',
      title: 'Short Definition',
      type: 'text',
      rows: 3,
      description:
        'One or two sentences. Shown in the hover card and on the glossary index, so keep it self-contained.',
      validation: (rule) => rule.required().max(200),
    }),
    defineField({
      name: 'body',
      title: 'Full Entry',
      type: 'blockContent',
      description: 'Optional longer explanation shown on the term page.',
    }),
    defineField({
      name: 'image',
      title: 'Editorial Image',
      type: 'image',
      options: { hotspot: true },
      fields: [
        defineField({
          name: 'alt',
          title: 'Alternative Text',
          type: 'string',
          validation: (rule) =>
            rule.custom((alt, context) => {
              const parent = context.parent
              if (typeof parent !== 'object' || parent === null || !('asset' in parent)) return true
              return typeof alt === 'string' && alt.trim().length > 0
                ? true
                : 'Alternative text is required when an image is attached.'
            }),
        }),
      ],
    }),
    defineField({
      name: 'aliases',
      title: 'Aliases',
      type: 'array',
      of: [{ type: 'string' }],
      validation: (rule) => rule.unique(),
    }),
    defineField({
      name: 'category',
      title: 'Primary Category',
      type: 'string',
      options: { list: [...GLOSSARY_CATEGORIES] },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'relatedTerms',
      title: 'Related Terms',
      type: 'array',
      of: [{ type: 'reference', to: [{ type: 'glossaryTerm' }] }],
      validation: (rule) =>
        rule.unique().custom((relatedTerms, context) => {
          if (!Array.isArray(relatedTerms)) return true

          const documentId = context.document?._id
          const publishedDocumentId = documentId?.replace(/^drafts\./, '')
          const includesSelfReference = relatedTerms.some(
            (relatedTerm) =>
              typeof relatedTerm === 'object' &&
              relatedTerm !== null &&
              '_ref' in relatedTerm &&
              (relatedTerm._ref === documentId || relatedTerm._ref === publishedDocumentId),
          )

          return includesSelfReference ? 'A glossary term cannot reference itself.' : true
        }),
    }),
    defineField({
      name: 'featured',
      title: 'Feature as an In-Depth Guide',
      type: 'boolean',
      initialValue: false,
    }),
    defineField({
      name: 'lastReviewedAt',
      title: 'Last Reviewed',
      type: 'date',
    }),
  ],
  validation: (rule) =>
    rule.custom((document) => {
      if (!document?.featured) return true

      const missingFields = [
        !document.body ? 'Full Entry' : undefined,
        !hasImageField(document.image, 'asset') ? 'Editorial Image' : undefined,
        !hasImageField(document.image, 'alt') ? 'Alternative Text' : undefined,
        !document.lastReviewedAt ? 'Last Reviewed' : undefined,
      ].filter((field) => field !== undefined)

      return missingFields.length > 0
        ? `Featured in-depth guides require: ${missingFields.join(', ')}.`
        : true
    }),
  orderings: [
    {
      title: 'Term A-Z',
      name: 'termAsc',
      by: [{ field: 'term', direction: 'asc' }],
    },
  ],
  preview: {
    select: { title: 'term', subtitle: 'shortDefinition' },
  },
})
