import { defineField, defineType } from 'sanity'

export const authorType = defineType({
  name: 'author',
  title: 'Author',
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
      name: 'role',
      title: 'Role',
      type: 'string',
      description: 'Job title shown under the byline (e.g., "Co-Founder")',
    }),
    defineField({
      name: 'email',
      title: 'Direct Email',
      type: 'string',
      description: 'Optional direct contact address shown only on this author’s profile.',
      validation: (rule) => rule.email(),
    }),
    defineField({
      name: 'photo',
      title: 'Photo',
      type: 'image',
      options: { hotspot: true },
      fields: [
        defineField({
          name: 'alt',
          title: 'Alternative Text',
          type: 'string',
          validation: (rule) => rule.required(),
        }),
      ],
    }),
    defineField({
      name: 'bio',
      title: 'Bio',
      type: 'blockContent',
      description: 'Short biography shown on the author page.',
    }),
    defineField({
      name: 'sameAs',
      title: 'Profile Links',
      type: 'array',
      of: [{ type: 'url' }],
      description:
        'External profiles that corroborate this author’s identity. Emitted as schema.org sameAs.',
    }),
  ],
  preview: {
    select: { title: 'name', subtitle: 'role', media: 'photo' },
  },
})
