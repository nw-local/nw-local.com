import { defineField, defineType } from 'sanity'

export const strainType = defineType({
  name: 'strain',
  title: 'Strain',
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
      name: 'strainType',
      title: 'Strain Type',
      type: 'string',
      options: {
        list: [
          { title: 'Indica', value: 'indica' },
          { title: 'Sativa', value: 'sativa' },
          { title: 'Hybrid', value: 'hybrid' },
        ],
        layout: 'radio',
      },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'blockContent',
    }),
    defineField({
      name: 'effects',
      title: 'Effects',
      type: 'array',
      of: [{ type: 'string' }],
      options: { layout: 'tags' },
    }),
    defineField({
      name: 'terpenes',
      title: 'Terpenes',
      type: 'array',
      of: [{ type: 'string' }],
      options: { layout: 'tags' },
    }),
    defineField({
      name: 'thcRange',
      title: 'THC Range',
      type: 'string',
      description: 'e.g. "22-26%"',
    }),
    defineField({
      name: 'cbdRange',
      title: 'CBD Range',
      type: 'string',
      description: 'e.g. "<1%"',
    }),
    defineField({
      name: 'lineage',
      title: 'Lineage',
      type: 'string',
      description:
        'Parent cross as printed on the buyer sheet, for example "Grape Gas #10 × OGKB Blueberry Headband".',
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
    defineField({
      name: 'gallery',
      title: 'Gallery',
      type: 'array',
      of: [
        {
          type: 'image',
          options: { hotspot: true },
          fields: [{ name: 'alt', title: 'Alternative Text', type: 'string' }],
        },
      ],
    }),
    defineField({
      name: 'nextHarvestDate',
      title: 'Next Expected Harvest Date',
      type: 'date',
    }),
    defineField({
      name: 'featured',
      title: 'Featured',
      type: 'boolean',
      initialValue: false,
    }),
    defineField({
      name: 'available',
      title: 'Available',
      type: 'boolean',
      initialValue: true,
    }),
    defineField({
      name: 'sortOrder',
      title: 'Sort Order',
      type: 'number',
      initialValue: 0,
    }),
  ],
  preview: {
    select: { title: 'name', subtitle: 'strainType', media: 'heroImage' },
  },
})
