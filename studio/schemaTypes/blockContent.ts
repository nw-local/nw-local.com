import { defineArrayMember, defineType } from 'sanity'

export const blockContentType = defineType({
  name: 'blockContent',
  title: 'Block Content',
  type: 'array',
  of: [
    defineArrayMember({
      type: 'block',
      styles: [
        { title: 'Normal', value: 'normal' },
        { title: 'H2', value: 'h2' },
        { title: 'H3', value: 'h3' },
        { title: 'H4', value: 'h4' },
        { title: 'Quote', value: 'blockquote' },
      ],
      lists: [
        { title: 'Bullet', value: 'bullet' },
        { title: 'Numbered', value: 'number' },
      ],
      marks: {
        decorators: [
          { title: 'Strong', value: 'strong' },
          { title: 'Emphasis', value: 'em' },
          { title: 'Code', value: 'code' },
        ],
        annotations: [
          {
            title: 'URL',
            name: 'link',
            type: 'object',
            fields: [
              {
                title: 'URL',
                name: 'href',
                type: 'url',
                // Cross-links between posts are stored as site-relative paths
                // ("/blog/why-cannabis-turns-purple/"), which the built-in url
                // rule rejects as "Not a valid URL" because it requires a
                // scheme. Leaving that default on makes every post carrying an
                // internal link unpublishable from the Studio. Omitting the
                // scheme option keeps the http/https default for absolute URLs.
                validation: (rule) => rule.uri({ allowRelative: true }),
              },
            ],
          },
          {
            title: 'Glossary term',
            name: 'glossaryRef',
            type: 'object',
            description:
              'Link this text to a definition. Terpenes link to their existing terpene page.',
            fields: [
              {
                title: 'Term',
                name: 'term',
                type: 'reference',
                to: [{ type: 'glossaryTerm' }, { type: 'terpene' }],
                validation: (rule) => rule.required(),
              },
            ],
          },
        ],
      },
    }),
    defineArrayMember({ type: 'tableBlock' }),
    defineArrayMember({
      type: 'image',
      options: { hotspot: true },
      fields: [
        { name: 'alt', type: 'string', title: 'Alternative Text' },
        { name: 'caption', type: 'string', title: 'Caption' },
      ],
    }),
    // A self-hosted video (an event clip, a grow walkthrough). The frontend
    // renders a native <video> from the file asset, so the file must be a
    // web-playable container: upload H.264/AAC MP4, not the .mov/.hevc a phone
    // records, which most browsers refuse to play. The poster is what shows
    // before playback and while the print stylesheet freezes the clip, so it is
    // effectively required for the block to look right on the page and on paper.
    defineArrayMember({
      type: 'object',
      name: 'videoFile',
      title: 'Video',
      fields: [
        {
          name: 'file',
          type: 'file',
          title: 'Video file (MP4)',
          options: { accept: 'video/mp4' },
          validation: (rule) => rule.required(),
        },
        {
          name: 'poster',
          type: 'image',
          title: 'Poster image',
          options: { hotspot: true },
          description: 'Still shown before the clip plays and when the page is printed.',
        },
        { name: 'alt', type: 'string', title: 'Alternative Text' },
        { name: 'caption', type: 'string', title: 'Caption' },
      ],
      preview: {
        select: { title: 'caption', subtitle: 'alt', media: 'poster' },
        prepare: ({ title, subtitle, media }) => ({
          title: title || 'Video',
          subtitle: subtitle || 'Video clip',
          media,
        }),
      },
    }),
  ],
})
