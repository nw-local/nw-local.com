import { defineField, defineType } from 'sanity'

const MACHINE_OWNED_DESCRIPTION = 'Set by Northwest Local OPS. Do not edit in Studio.'

const applicationFields = [
  defineField({
    name: 'productName',
    title: 'Product Name',
    type: 'string',
    description: MACHINE_OWNED_DESCRIPTION,
    readOnly: true,
    validation: (rule) => rule.required(),
  }),
  defineField({
    name: 'activeIngredient',
    title: 'Active Ingredient',
    type: 'string',
    description: MACHINE_OWNED_DESCRIPTION,
    readOnly: true,
    validation: (rule) => rule.required(),
  }),
  defineField({
    name: 'epaRegistrationNumber',
    title: 'EPA Registration Number',
    type: 'string',
    description: MACHINE_OWNED_DESCRIPTION,
    readOnly: true,
    validation: (rule) => rule.required(),
  }),
  defineField({
    name: 'appliedOn',
    title: 'Date Applied',
    type: 'date',
    description: MACHINE_OWNED_DESCRIPTION,
    readOnly: true,
    validation: (rule) => rule.required(),
  }),
  defineField({
    name: 'targetPest',
    title: 'Target Pest',
    type: 'string',
    description: MACHINE_OWNED_DESCRIPTION,
    readOnly: true,
    validation: (rule) => rule.required(),
  }),
]

export const pesticideDisclosureType = defineType({
  name: 'pesticideDisclosure',
  title: 'Pesticide Disclosure',
  type: 'document',
  fields: [
    defineField({
      name: 'publicCode',
      title: 'Public Code',
      type: 'string',
      description: `${MACHINE_OWNED_DESCRIPTION} The lot code printed on the jar; the public lookup key.`,
      readOnly: true,
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'strain',
      title: 'Strain',
      type: 'string',
      description: MACHINE_OWNED_DESCRIPTION,
      readOnly: true,
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'grade',
      title: 'Grade',
      type: 'string',
      description: `${MACHINE_OWNED_DESCRIPTION} Omitted when blank.`,
      readOnly: true,
    }),
    defineField({
      name: 'noneApplied',
      title: 'No Pesticides Applied',
      type: 'boolean',
      description: MACHINE_OWNED_DESCRIPTION,
      readOnly: true,
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'applications',
      title: 'Applications',
      type: 'array',
      description: MACHINE_OWNED_DESCRIPTION,
      readOnly: true,
      of: [{ type: 'object', name: 'pesticideApplication', fields: applicationFields }],
    }),
  ],
  validation: (rule) =>
    rule.custom((document) => {
      const applications = (document?.applications as unknown[] | undefined) ?? []
      const noneApplied = document?.noneApplied === true
      if (noneApplied === (applications.length === 0)) return true
      return 'noneApplied must be true if and only if there are zero applications.'
    }),
  preview: {
    select: { title: 'publicCode', strain: 'strain', grade: 'grade' },
    prepare: ({ title, strain, grade }) => ({
      title: title as string,
      subtitle: [strain, grade].filter(Boolean).join(' · '),
    }),
  },
})
