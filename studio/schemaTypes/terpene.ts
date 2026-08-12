import { defineField, defineType } from 'sanity'

export const terpeneType = defineType({
  name: 'terpene',
  title: 'Terpene',
  type: 'document',
  fields: [
    defineField({
      name: 'name',
      title: 'Name',
      type: 'string',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: { source: 'name', maxLength: 96 },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'tagline',
      title: 'Tagline',
      type: 'string',
      description: 'Short one-line summary (e.g., "Earthy, musky — promotes relaxation")',
    }),
    defineField({
      name: 'aroma',
      title: 'Aroma',
      type: 'array',
      of: [{ type: 'string' }],
      options: { layout: 'tags' },
      description: 'Aroma descriptors (e.g., "earthy", "citrus", "floral")',
    }),
    defineField({
      name: 'effects',
      title: 'Effects',
      type: 'array',
      of: [{ type: 'string' }],
      options: { layout: 'tags' },
      description: 'Commonly associated effects (e.g., "relaxation", "mood elevation")',
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'blockContent',
      description:
        'Detailed description of this terpene — what it is, where it occurs in nature, how it affects the cannabis experience',
    }),
    defineField({
      name: 'foundIn',
      title: 'Also Found In',
      type: 'array',
      of: [{ type: 'string' }],
      options: { layout: 'tags' },
      description:
        'Where else this terpene occurs in nature (e.g., "mangoes", "lavender", "black pepper")',
    }),
    defineField({
      name: 'heroImage',
      title: 'Hero Image',
      type: 'image',
      options: { hotspot: true },
      fields: [defineField({ name: 'alt', title: 'Alternative Text', type: 'string' })],
    }),
    defineField({
      name: 'sortOrder',
      title: 'Sort Order',
      type: 'number',
      initialValue: 0,
    }),
  ],
  preview: {
    select: { title: 'name', subtitle: 'tagline' },
  },
})
