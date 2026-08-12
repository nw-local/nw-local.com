import { defineField, defineType } from 'sanity'

export const pageType = defineType({
  name: 'page',
  title: 'Page',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'pageId',
      title: 'Page ID',
      type: 'string',
      description: 'Identifies which page this content belongs to.',
      options: {
        list: [
          { title: 'Home', value: 'home' },
          { title: 'About', value: 'about' },
          { title: 'Contact', value: 'contact' },
        ],
        layout: 'radio',
      },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'seoDescription',
      title: 'SEO Description',
      type: 'string',
      description: 'Meta description. Max 160 characters.',
      validation: (rule) => rule.max(160),
    }),
    defineField({
      name: 'heroImage',
      title: 'Hero Image',
      type: 'image',
      options: { hotspot: true },
      fields: [defineField({ name: 'alt', title: 'Alternative Text', type: 'string' })],
    }),
    defineField({
      name: 'body',
      title: 'Body',
      type: 'blockContent',
    }),
  ],
  preview: {
    select: { title: 'title', subtitle: 'pageId', media: 'heroImage' },
  },
})
