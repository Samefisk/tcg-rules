# Markdown-to-Web Rules Migration Evaluation

## 1. Executive Recommendation

**Recommendation:** Depends, leaning Yes.

Moving from Markdown files to an interactive web rulebook is feasible and likely worthwhile if the main goal is to reduce duplication and create a stronger single source of truth. It is not worthwhile if the goal is only to make the rules look nicer. A web page alone does not solve duplication. The authoring model must change so structured content becomes canonical and the site becomes a generated view of that content.

For this repository, the strongest case for migration is authoring quality. The current workspace already splits meaning across [`GLOSSARY.md`](/Users/christofferandersen/Documents/2. Projects/23. App Devolopment/TCG Rules/GLOSSARY.md), the player-facing files in [`rules/`](/Users/christofferandersen/Documents/2. Projects/23. App Devolopment/TCG Rules/rules), and the mirrored pseudocode in [`logic/`](/Users/christofferandersen/Documents/2. Projects/23. App Devolopment/TCG Rules/logic). That structure is disciplined, but it still depends on humans keeping repeated descriptions aligned.

## 2. Architectural Solutions

### Recommended Option: Structured Content Repository + Static Site Generator

This is the best fit for the current repository.

- Keep the repository as the canonical source.
- Move glossary entries, rule section metadata, examples, and cross-references into structured content files.
- Keep Markdown only for long prose blocks that benefit from freeform writing.
- Generate the web experience from that structured content.

Suggested shape:

- `terms`: canonical glossary entities with stable IDs such as `hero`, `turn`, and `physical_damage`
- `sections`: rule sections with section number, title, body content, referenced term IDs, and related logic IDs
- `logic`: logic entries keyed to the same section IDs instead of loosely mirrored prose
- generated pages: overview pages, rule pages, glossary pages, backlinks, and term tooltips

This approach allows one glossary definition to feed every tooltip, glossary page, backlink, and inline reference without restating the definition in multiple places.

Suitable frameworks:

- Astro if the goal is mostly static content with a clean content pipeline
- Next.js static export if richer application behavior is expected later
- Docusaurus if the priority is docs navigation with moderate customization

Why this is the best fit here:

- It preserves Git as the editorial workflow.
- It fits the current repo structure better than introducing a CMS.
- It solves the actual problem at the content-model level, not only at the UI level.

### Option B: Headless CMS

This works if non-technical editing, approvals, or editorial workflow become priorities.

- Model content types such as `Term`, `Rule Section`, `Mechanic`, and `Example`.
- Connect those content types through references.
- Render the public rulebook from CMS data.

Benefits:

- Better editorial workflow.
- Strong validation and content relationships.
- Easier role-based editing if multiple non-technical contributors are involved.

Costs:

- More setup and operational overhead.
- More infrastructure than this repository currently appears to need.
- Harder to keep the docs workflow as simple as the current Git-based process.

### Option C: Enriched Markdown or MDX

This is the cheapest migration path.

- Keep Markdown as the primary authoring format.
- Add custom components or plugins for glossary references, backlinks, and richer navigation.
- Use MDX or a Markdown AST pipeline to replace marked terms with interactive UI components.

Benefits:

- Lowest migration cost.
- Minimal disruption to current writing habits.
- Fastest route to tooltip and cross-link behavior.

Limits:

- It improves presentation more than governance.
- Duplication risk remains if rules prose still repeats concepts instead of referencing canonical data.
- It does not fully solve the single-source problem unless structured data is introduced underneath it.

### Recommended Architecture Decision

For this repository, use a **structured content repository plus static site generator** as the first target architecture.

Implementation principle:

- glossary terms are canonical entities
- rule sections reference glossary term IDs instead of redefining terms
- logic sections reference the same section IDs
- the site is generated from shared data rather than maintained as an independent layer

## 3. Feature Implementation: Interactive Glossary

### Interaction Model

The glossary should be built from canonical term IDs, not string matching alone.

Desktop behavior:

- hover shows a small tooltip or popover
- keyboard focus shows the same content
- click navigates to a full glossary detail view or opens a persistent side panel

Mobile behavior:

- do not depend on hover
- tap opens a popover, drawer, or dedicated term page
- tap again or dismiss closes the transient UI

Accessibility requirements:

- glossary references must be real links or buttons with clear semantics
- keyboard users must be able to reach every glossary reference
- the short tooltip cannot be the only place where the definition exists
- each term must also have a full, stable page or panel destination

### Technical Approach

Inline rule text should render glossary references through a dedicated component, for example:

```tsx
<GlossaryTerm termId="hero" />
```

Suggested implementation details:

- build a compile-time term index from the canonical glossary dataset
- store each term with `id`, `label`, `shortDefinition`, `fullDefinition`, and related section IDs
- render inline references from term IDs rather than embedding repeated definitions
- generate backlinks automatically, such as "Appears in sections 30.1 and 50.6"
- expose both tooltip content and a deep-link target for each term

This solves two problems at once:

- readers get fast contextual help without leaving the page
- authors maintain one definition per concept instead of repeating explanatory prose

### Practical Rendering Strategies

Three reasonable implementation patterns:

1. Tokenized rich text
   Store rule bodies as structured rich text or MDX with explicit term nodes. This is the most reliable option.
2. Markdown with annotation syntax
   Use a lightweight authoring pattern such as `[[Hero]]` or `[[hero|Hero]]`, then transform it into a glossary component at build time.
3. Post-processing string matcher
   Detect terms after Markdown render. This is the weakest option because collisions, plural forms, and false matches become harder to control.

Recommended default:

- use an explicit annotation or MDX component model
- do not rely on naive string scanning for canonical references

## 4. Comparison Table

| Metric | Markdown Only | Interactive Web Page Backed by Structured Content |
| --- | --- | --- |
| Maintenance overhead | Low at first, but rises as rule interactions and duplicated explanations grow | Higher initial setup, then lower ongoing consistency cost once data relationships are in place |
| Single source of truth | Weak unless maintained through strict discipline and manual review | Strong if glossary terms, section metadata, and references are entity-based |
| Scalability | Fine for small or mostly static rulebooks | Better for larger rule systems, deeper cross-links, and future expansion |
| Reader UX | Good for linear reading, weak for discovery and inline help | Strong navigation, hover help, backlinks, and contextual exploration |
| Cross-referencing | Manual links and repeated phrasing | Auto-generated references, backlinks, and term-driven navigation |
| Change safety and consistency | Easy to drift when concepts are described in multiple files | Safer if term definitions and references resolve from shared IDs |
| Initial setup cost | Very low | Moderate to high, depending on framework and schema choices |

## 5. Validation Points

Any migration should prove that the new model reduces duplication in practice.

Recommended checks:

1. Change one glossary definition and confirm every tooltip, glossary page, and inline reference reflects the update without manual edits.
2. Rename one canonical term label while keeping the same term ID and confirm inline references remain valid.
3. Add one new rule section and confirm backlinks and glossary references are generated automatically.
4. Verify hover, click, keyboard focus, and mobile tap all expose the glossary definition appropriately.
5. Confirm authors can still write natural longform rules prose without forcing every paragraph into rigid structured fields.

## 6. Final Assessment

The migration is justified if the repository is expected to keep growing and if terminology consistency is now the main maintenance burden. In that case, the right move is not "replace Markdown with a website." The right move is "replace duplicated prose structures with canonical content entities, then generate the website from them."

If the rules remain relatively stable, mostly linear, and edited by a small technical team, staying in Markdown can still be reasonable. In that case, the best incremental step is to keep Markdown, add explicit glossary-reference syntax, and generate hover/click interactions from the glossary rather than performing a full content-model migration immediately.
