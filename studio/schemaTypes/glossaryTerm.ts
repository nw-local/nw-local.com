import { defineField, defineType } from 'sanity'

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
