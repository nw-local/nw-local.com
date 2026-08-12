import { defineField, defineType } from 'sanity'

export const retailerPageType = defineType({
  name: 'retailerPage',
  title: 'Retailer Page',
  type: 'document',
  fields: [
    defineField({
      name: 'headline',
      title: 'Headline',
      type: 'string',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'intro',
      title: 'Intro',
      type: 'blockContent',
    }),
    defineField({
      name: 'contactEmail',
      title: 'Wholesale Contact Email',
      type: 'string',
      validation: (rule) => rule.email(),
    }),
    defineField({
      name: 'contactPhone',
      title: 'Wholesale Contact Phone',
      type: 'string',
    }),
    defineField({
      name: 'downloadables',
      title: 'Downloadable Files',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            defineField({
              name: 'label',
              title: 'Label',
              type: 'string',
              validation: (rule) => rule.required(),
            }),
            defineField({
              name: 'file',
              title: 'File',
              type: 'file',
              validation: (rule) => rule.required().assetRequired(),
            }),
          ],
          preview: { select: { title: 'label' } },
        },
      ],
    }),
  ],
  preview: {
    select: { title: 'headline' },
  },
})
