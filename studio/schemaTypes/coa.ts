import { defineField, defineType } from 'sanity'

const MACHINE_OWNED_DESCRIPTION = 'Set by Northwest Local OPS. Do not edit in Studio.'
const STATUS_OPTIONS = [
  { title: 'Pass', value: 'pass' },
  { title: 'Fail', value: 'fail' },
]

export function certificateAssetValidation<
  Rule extends { required: () => Rule; assetRequired: () => Rule },
>(rule: Rule): Rule {
  return rule.required().assetRequired()
}

const statusField = (name: string, title: string, required: boolean) =>
  defineField({
    name,
    title,
    type: 'string',
    description: MACHINE_OWNED_DESCRIPTION,
    options: { list: STATUS_OPTIONS, layout: 'radio' },
    readOnly: true,
    validation: (rule) => (required ? rule.required() : rule),
  })

const readingFields = [
  defineField({
    name: 'label',
    title: 'Label',
    type: 'string',
    description: MACHINE_OWNED_DESCRIPTION,
    readOnly: true,
    validation: (rule) => rule.required(),
  }),
  defineField({
    name: 'value',
    title: 'Value',
    type: 'string',
    description: MACHINE_OWNED_DESCRIPTION,
    readOnly: true,
    validation: (rule) => rule.required(),
  }),
  defineField({
    name: 'unit',
    title: 'Unit',
    type: 'string',
    description: MACHINE_OWNED_DESCRIPTION,
    readOnly: true,
    validation: (rule) => rule.required(),
  }),
]

const metricFields = [
  defineField({
    name: 'name',
    title: 'Name',
    type: 'string',
    description: MACHINE_OWNED_DESCRIPTION,
    readOnly: true,
    validation: (rule) => rule.required(),
  }),
  defineField({
    name: 'value',
    title: 'Value',
    type: 'string',
    description: MACHINE_OWNED_DESCRIPTION,
    readOnly: true,
    validation: (rule) => rule.required(),
  }),
  defineField({
    name: 'unit',
    title: 'Unit',
    type: 'string',
    description: MACHINE_OWNED_DESCRIPTION,
    readOnly: true,
    validation: (rule) => rule.required(),
  }),
  statusField('status', 'Status', false),
]

export const coaType = defineType({
  name: 'coa',
  title: 'Certificate of Analysis',
  type: 'document',
  fields: [
    defineField({
      name: 'sourceId',
      title: 'OPS Laboratory Result UUID',
      type: 'string',
      description: MACHINE_OWNED_DESCRIPTION,
      readOnly: true,
      validation: (rule) =>
        rule
          .required()
          .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i),
    }),
    defineField({
      name: 'labResultId',
      title: 'Laboratory Result ID',
      type: 'string',
      description: MACHINE_OWNED_DESCRIPTION,
      readOnly: true,
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'sampleId',
      title: 'Sample ID',
      type: 'string',
      description: MACHINE_OWNED_DESCRIPTION,
      readOnly: true,
      validation: (rule) => rule.required(),
    }),
    statusField('status', 'Result Status', true),
    defineField({
      name: 'publishedAt',
      title: 'Published At',
      type: 'datetime',
      description: MACHINE_OWNED_DESCRIPTION,
      readOnly: true,
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'totalThc',
      title: 'Total THC',
      type: 'object',
      description: MACHINE_OWNED_DESCRIPTION,
      readOnly: true,
      fields: readingFields,
    }),
    defineField({
      name: 'waterActivity',
      title: 'Water Activity',
      type: 'object',
      description: MACHINE_OWNED_DESCRIPTION,
      readOnly: true,
      fields: readingFields,
    }),
    defineField({
      name: 'panels',
      title: 'Test Panels',
      type: 'array',
      description: MACHINE_OWNED_DESCRIPTION,
      readOnly: true,
      of: [
        {
          type: 'object',
          fields: [
            defineField({
              name: 'name',
              title: 'Name',
              type: 'string',
              description: MACHINE_OWNED_DESCRIPTION,
              readOnly: true,
              validation: (rule) => rule.required(),
            }),
            statusField('status', 'Status', true),
            defineField({
              name: 'metrics',
              title: 'Metrics',
              type: 'array',
              description: MACHINE_OWNED_DESCRIPTION,
              readOnly: true,
              of: [
                {
                  type: 'object',
                  fields: metricFields,
                },
              ],
              validation: (rule) => rule.required(),
            }),
          ],
        },
      ],
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'strain',
      title: 'Release Strain',
      type: 'object',
      description: MACHINE_OWNED_DESCRIPTION,
      readOnly: true,
      fields: [
        defineField({
          name: 'name',
          title: 'Name',
          type: 'string',
          description: MACHINE_OWNED_DESCRIPTION,
          readOnly: true,
          validation: (rule) => rule.required(),
        }),
        defineField({
          name: 'url',
          title: 'Public URL',
          type: 'url',
          description: MACHINE_OWNED_DESCRIPTION,
          readOnly: true,
          validation: (rule) => rule.required().uri({ scheme: ['https'] }),
        }),
      ],
    }),
    defineField({
      name: 'certificate',
      title: 'Certificate PDF',
      type: 'object',
      description: MACHINE_OWNED_DESCRIPTION,
      readOnly: true,
      fields: [
        defineField({
          name: 'filename',
          title: 'Original Filename',
          type: 'string',
          description: MACHINE_OWNED_DESCRIPTION,
          readOnly: true,
          validation: (rule) => rule.required(),
        }),
        defineField({
          name: 'sha256',
          title: 'SHA-256',
          type: 'string',
          description: MACHINE_OWNED_DESCRIPTION,
          readOnly: true,
          validation: (rule) => rule.required().regex(/^[a-f0-9]{64}$/),
        }),
        defineField({
          name: 'asset',
          title: 'PDF Asset',
          type: 'file',
          description: MACHINE_OWNED_DESCRIPTION,
          readOnly: true,
          options: { accept: 'application/pdf' },
          validation: certificateAssetValidation,
        }),
      ],
      validation: (rule) => rule.required(),
    }),
  ],
  preview: {
    select: { title: 'labResultId', subtitle: 'sampleId' },
  },
})
