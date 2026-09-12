# Carestead visual system

Use coordinated, visibly colored pastels with dark readable text. Avoid white surfaces, monochromatic page treatments, arbitrary rainbow ordering, and color as the only indicator.

## Hierarchy

- Keep the page and sidebar in related warm foundation colors.
- Use a consistent blue/lavender utility treatment for filters, with their heading inside the panel.
- Separate results with a heading, count and spacing. Responsibilities have individual card boundaries.
- Size summary panels to their content rather than stretching them to match neighboring lists.
- Organizer tools share panel geometry, headings and controls. Supporting panels use the base surface with a purpose-colored top border; prominent content can use a full category fill.
- Keep primary actions indigo. Selected navigation uses one consistent style; expandable groups have an icon and chevron.

## Content roles

| Role | Existing tone |
| --- | --- |
| Schedules, mobility, time and tasks | sky |
| Care facts, medication templates and verification | plum |
| People, home support and coverage | peach |
| Attention and transition planning | amber |
| Open risks and urgent review | rose |

Use the CSS tokens and data-care-tone attributes. Reuse colors when meaning repeats. Distinguish adjacent components with headings, icons, borders, spacing and explicit status labels. Never assign colors by list index.

## Verification

Check contrast after token changes, responsive and intermediate widths, enlarged text, keyboard focus, filtering and pagination. Inspect screenshots as well as automated results. Use an isolated CARESTEAD_TEST_PORT when other browser tests are running.
