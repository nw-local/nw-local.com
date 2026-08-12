import { defineField, defineType } from 'sanity'

export const siteSettingsType = defineType({
  name: 'siteSettings',
  title: 'Site Settings',
  type: 'document',
  fields: [
    defineField({
      name: 'siteTitle',
      title: 'Site Title',
      type: 'string',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'siteDescription',
      title: 'Site Description',
      type: 'text',
      rows: 3,
    }),
    defineField({
      name: 'logo',
      title: 'Logo',
      type: 'image',
      options: { hotspot: true },
      fields: [
        defineField({ name: 'alt', title: 'Alternative Text', type: 'string' }),
      ],
    }),
    defineField({
      name: 'heroLockup',
      title: 'Hero Lockup',
      type: 'image',
      description:
        'Emblem + wordmark shown as the homepage headline. White artwork on a '
        + 'transparent background. Pair only with dark, low-key hero photography: '
        + 'a bright photo will wash out the wordmark.',
      fields: [
        defineField({ name: 'alt', title: 'Alternative Text', type: 'string' }),
      ],
    }),
    defineField({
      name: 'socialLinks',
      title: 'Social Links',
      type: 'object',
      fields: [
        defineField({ name: 'instagram', title: 'Instagram URL', type: 'url', validation: (rule) => rule.uri({ scheme: ['http', 'https'] }) }),
        defineField({ name: 'facebook', title: 'Facebook URL', type: 'url', validation: (rule) => rule.uri({ scheme: ['http', 'https'] }) }),
        defineField({ name: 'twitter', title: 'Twitter URL', type: 'url', validation: (rule) => rule.uri({ scheme: ['http', 'https'] }) }),
      ],
    }),
    defineField({
      name: 'contactEmail',
      title: 'Contact Email',
      type: 'string',
      validation: (rule) => rule.email(),
    }),
    defineField({
      name: 'contactPhone',
      title: 'Contact Phone',
      type: 'string',
    }),
    defineField({
      name: 'address',
      title: 'Address',
      type: 'text',
      rows: 3,
    }),
    defineField({
      name: 'ageGateMessage',
      title: 'Age Gate Message',
      type: 'text',
      rows: 2,
      description: 'Message shown on the 21+ age verification gate.',
    }),
  ],
  preview: {
    select: { title: 'siteTitle' },
  },
})
