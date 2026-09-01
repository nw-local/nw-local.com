import { defineField, defineType } from 'sanity'
import { GLOSSARY_CATEGORIES } from '../../shared/glossary-categories'
import { firstBlankGlossaryAliasIndex } from '../../shared/glossary-validation'

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
      title: 'Expanded Explanation',
      type: 'blockContent',
      description:
        'Optional supporting context for the term. Keep procedures, recommendations, and article-length treatment in a blog post.',
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
  ],
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
