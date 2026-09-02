import { defineField, defineType } from 'sanity'

export const dropType = defineType({
  name: 'drop',
  title: 'Drop',
  type: 'document',
  fields: [
    defineField({
      name: 'name',
      title: 'Name',
      type: 'string',
      description: 'The release name, for example "Fall Harvest 2026".',
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
      name: 'description',
      title: 'Description',
      type: 'string',
      description: 'SEO excerpt. Max 160 characters.',
      validation: (rule) => rule.required().max(160),
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      description:
        'Set this by hand. Sold Out is the one fact no automatic check can observe, so the site is only as current as this field.',
      options: {
        list: [
          { title: 'Upcoming', value: 'upcoming' },
          { title: 'Available', value: 'available' },
          { title: 'Sold Out', value: 'soldOut' },
        ],
        layout: 'radio',
      },
      initialValue: 'upcoming',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'dropDate',
      title: 'Drop Date',
      type: 'date',
      description: 'Release date. Newest drops sort to the top of the index.',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'heroImage',
      title: 'Hero Image',
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
    // A lot carries a Bamboo id and a Cultivera id, so an identifier with no
    // portal cannot be rendered unambiguously on the drop page. The two fields
    // are co-required: both set or both empty, never just one.
    defineField({
      name: 'lotIdentifier',
      title: 'Lot Identifier',
      type: 'string',
      description: 'The identifier printed on the label, for example "24-0812".',
      validation: (rule) =>
        rule.custom((value, context) => {
          const portal = context.document?.lotPortal
          if (Boolean(value) === Boolean(portal)) return true
          return 'Set the lot identifier and the portal together, or leave both empty.'
        }),
    }),
    defineField({
      name: 'lotPortal',
      title: 'Lot Portal',
      type: 'string',
      description:
        'Which portal the lot identifier came from. A lot can carry a Bamboo id and a Cultivera id, so an unqualified number is ambiguous.',
      options: {
        list: [
          { title: 'Bamboo', value: 'bamboo' },
          { title: 'Cultivera', value: 'cultivera' },
        ],
        layout: 'radio',
      },
      validation: (rule) =>
        rule.custom((value, context) => {
          const identifier = context.document?.lotIdentifier
          if (Boolean(value) === Boolean(identifier)) return true
          return 'Set the lot identifier and the portal together, or leave both empty.'
        }),
    }),
    defineField({
      name: 'harvestedAt',
      title: 'Harvested At',
      type: 'date',
    }),
    defineField({
      name: 'products',
      title: 'Products',
      type: 'array',
      of: [{ type: 'reference', to: [{ type: 'product' }] }],
      description:
        'The SKUs in this batch. Strains are derived from these, so there is no separate strain list to keep in sync.',
      validation: (rule) => rule.required().min(1).unique(),
    }),
    defineField({
      name: 'retailers',
      title: 'Retailers',
      type: 'array',
      of: [{ type: 'reference', to: [{ type: 'retailer' }] }],
      description: 'Shops stocking this drop.',
      validation: (rule) => rule.unique(),
    }),
    defineField({
      name: 'coas',
      title: 'Certificates of Analysis',
      type: 'array',
      of: [{ type: 'reference', to: [{ type: 'coa' }] }],
      description:
        'Release certificates for the lots in this drop, one per strain. Set by Northwest Local OPS from the launch snapshot.',
      validation: (rule) => rule.unique(),
    }),
    defineField({
      name: 'gallery',
      title: 'Gallery',
      type: 'array',
      description: 'Release photography shown below the introduction.',
      of: [
        {
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
        },
      ],
    }),
    defineField({
      name: 'body',
      title: 'Body',
      type: 'blockContent',
    }),
  ],
  preview: {
    select: { title: 'name', subtitle: 'status', media: 'heroImage' },
  },
})
