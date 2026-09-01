import { defineField, defineType } from 'sanity'
import { GLOSSARY_CATEGORIES } from '../../shared/glossary-categories'
import {
  firstBlankGlossaryAliasIndex,
  glossaryFeaturedMissingFields,
  hasGlossaryBody,
  type GlossaryFeaturedRequirement,
} from '../../shared/glossary-validation'

const FEATURED_FIELD_LABELS: Record<GlossaryFeaturedRequirement, string> = {
  body: 'Full Entry',
  image: 'Editorial Image',
  'image.alt': 'Alternative Text',
  lastReviewedAt: 'Last Reviewed',
}

function imageField(image: unknown, fieldName: string): unknown {
  return typeof image === 'object' && image !== null
    ? Object.entries(image).find(([candidateFieldName]) => candidateFieldName === fieldName)?.[1]
    : undefined
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
              if (!imageField(parent, 'asset')) return true
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
      validation: (rule) =>
        rule.unique().custom((aliases) => {
          const blankAliasIndex = firstBlankGlossaryAliasIndex(aliases)
          return blankAliasIndex === undefined
            ? true
            : `Alias ${blankAliasIndex + 1} cannot be blank.`
        }),
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

      const missingFields = glossaryFeaturedMissingFields({
        hasBody: hasGlossaryBody(document.body),
        imageAsset: imageField(document.image, 'asset'),
        imageAlt: imageField(document.image, 'alt'),
        lastReviewedAt: document.lastReviewedAt,
      }).map((field) => FEATURED_FIELD_LABELS[field])

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
