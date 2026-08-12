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
      name: 'marketplaces',
      title: 'Marketplaces',
      description:
        'Cultivera Market storefronts. Rendered as call-to-action cards in the order listed.',
      type: 'array',
      validation: (rule) => rule.required().min(1),
      of: [
        {
          type: 'object',
          fields: [
            defineField({
              name: 'label',
              title: 'Label',
              type: 'string',
              description: 'The buyer type this storefront serves, e.g. "Retailers".',
              validation: (rule) => rule.required(),
            }),
            defineField({
              name: 'audience',
              title: 'Audience Line',
              type: 'string',
              description: 'One supporting line describing what this storefront carries.',
            }),
            defineField({
              name: 'url',
              title: 'Storefront URL',
              type: 'url',
              validation: (rule) => rule.required().uri({ scheme: ['https'] }),
            }),
          ],
          preview: { select: { title: 'label', subtitle: 'audience' } },
        },
      ],
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
