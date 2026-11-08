import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

// Keep `collapsed: false`: Docusaurus renders no children for a collapsed category,
// and the Help dialog reads this sidebar from a built page (helpDocs.ts).
const sidebars: SidebarsConfig = {
  docs: [
    { type: 'category', label: 'Introduction', collapsed: false, items: ['overview', 'features', 'technical-documentation', 'faq'] },
    {
      type: 'category',
      label: 'Getting Started',
      collapsed: false,
      items: ['getting-started', 'syncing-your-work', 'settings', 'offline-and-installing'],
    },
    {
      type: 'category',
      label: 'User Guide',
      collapsed: false,
      items: [
        'designing-a-rocket',
        'motors',
        'flight-configurations',
        'views-and-analysis',
        'running-a-simulation',
        'benchtop',
        'tools',
        'files-and-exports',
        'safety',
      ],
    },
    {
      type: 'category',
      label: 'Appendix',
      collapsed: false,
      items: [
        'glossary',
        'comparison-openrocket',
        'comparison-zenrockets',
        'comparison-mmrocket-sim',
        'comparison-thrustcurve',
      ],
    },
  ],
};

export default sidebars;
