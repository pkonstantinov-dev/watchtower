export const FEATURES = [
  {
    id: 'focus',
    name: 'Focus mode',
    description: 'Star items with ☆ and use the Focus button to show only them.',
    default: true,
  },
  {
    id: 'mentions',
    name: 'Unanswered mentions',
    description: 'Red dot on issues where someone @mentioned you and you have not replied yet. Adds one Jira search per refresh.',
    default: true,
  },
]

export const withDefaults = stored => ({
  ...Object.fromEntries(FEATURES.map(f => [f.id, f.default])),
  ...stored,
})
