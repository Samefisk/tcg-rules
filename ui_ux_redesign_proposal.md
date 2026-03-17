# UI/UX Redesign Proposal: TCG Interactive Rulebook

## 1. System Architecture Proposal

To uphold the "Single Source of Truth" mandate, the web application must operate as a pure view layer that derives its structure and content entirely from the underlying JSON/Markdown data.

*   **Content Parsing & Indexing Pipeline:** During the static site generation build step (e.g., via Astro, Next.js, or VitePress), [content/glossary.json](file:///Users/christofferandersen/Documents/2.%20Projects/23.%20App%20Devolopment/TCG%20Rules/content/glossary.json) and [content/rules.json](file:///Users/christofferandersen/Documents/2.%20Projects/23.%20App%20Devolopment/TCG%20Rules/content/rules.json) are parsed into an internal relational graph.
*   **Component Hydration via IDs:** UI components (like rule sections or tooltips) do not hardcode copy. They are instantiated with unique IDs (`sectionId`, `termId`) and fetch their rendering data from the generated graph at build time. 
*   **Automated Bidirectional Linking:** The build pipeline automatically scans canonical rule prose for glossary tokens (`[[term-id]]`). It populates a "referenced by" array for each term. When a term is rendered, the UI dynamically displays all rules that reference it.
*   **Dev-Friendly Workflow:** A change to a rule or definition in the JSON data triggers a rebuild. The pipeline re-evaluates indices and links, ensuring the entire UI remains perfectly synchronized without manual intervention.

## 2. UI Component Specifications

### Global Search Interface
*   **Trigger:** A prominent, keyboard-accessible floating action button (FAB) on mobile, or a persistent search bar in the desktop header, with a global shortcut (`Cmd/Ctrl + K`).
*   **Entity-Based Resolution:** The search engine (e.g., Fuse.js) is configured to index structured entities (`Terms`, `Rule Sections`, `Keywords`), not raw strings. Search results are grouped visually by entity type.
*   **Interaction:** Clicking a `Term` result bypasses a generic search page and immediately opens the term's canonical detail view or bottom-sheet. Clicking a `Section` instantly scrolls the user to that anchor in the rulebook.

### Navigation and Table of Contents (TOC)
*   **Desktop (Sticky Sidebar):** A persistent left-hand sidebar displaying a hierarchical, collapsible TOC derived directly from the section IDs in [content/rules.json](file:///Users/christofferandersen/Documents/2.%20Projects/23.%20App%20Devolopment/TCG%20Rules/content/rules.json). An `IntersectionObserver` highlights the currently active section as the user scrolls.
*   **Mobile (Bottom-Sheet or Expanding Header):** Given screen constraints, the TOC is hidden behind a sticky bottom navigation element or a floating "Index" button. Tapping it reveals a full-screen, easily tappable modal containing the hierarchy.

### Inline Definitions and Tooltips
*   **Implementation:** Rule text containing `[[term-id]]` is transformed into an interactive `<GlossaryReference termId="..." />` component.
*   **Desktop Behavior (Hover/Focus):** Hovering triggers a fast, non-blocking tooltip (powered by Floating UI) displaying the term's `shortDefinition`. Clicking navigates to the term's full page or opens a persistent side-drawer showing `fullDefinition` and bidrectional links.
*   **Mobile-First Behavior (Tap):** Mobile users tap the term to trigger a **Bottom-Sheet Flyout**. This avoids awkward tooltip placement on small screens and ensures the user does not lose their scroll context. The bottom-sheet contains the definition and a distinct "View Rules Involving This Term" link for deep-dives.

## 3. Data Schema Recommendation

To support this dynamic UI, the data must separate structure from content.

### Glossary Schema ([content/glossary.json](file:///Users/christofferandersen/Documents/2.%20Projects/23.%20App%20Devolopment/TCG%20Rules/content/glossary.json))
```json
{
  "$schema": "./schemas/glossary.schema.json",
  "terms": {
    "physical_damage": {
      "id": "physical_damage",
      "label": "Physical Damage",
      "shortDefinition": "Damage dealt by physical attacks, mitigated by Armor.",
      "fullDefinition": "Physical Damage is one of the primary damage types. It is inflicted by weapons...",
      "relatedTerms": ["armor", "damage_type"]
    }
  }
}
```

### Rules Schema ([content/rules.json](file:///Users/christofferandersen/Documents/2.%20Projects/23.%20App%20Devolopment/TCG%20Rules/content/rules.json))
```json
{
  "$schema": "./schemas/rules.schema.json",
  "sections": [
    {
      "id": "50.1",
      "title": "Applying Physical Damage",
      "content": "When a [[hero]] takes [[physical_damage]], first subtract their [[armor]] value.",
      "referencedTerms": ["hero", "physical_damage", "armor"] 
    }
  ]
}
```
> [!NOTE]
> The `referencedTerms` property on a section (and equivalent "referencedBy" property on a term) should ideally be calculated dynamically at build time by parsing the `content` string, eliminating the need for developers to maintain relationships manually.

## 4. Visual Direction

*   **Tone:** Authoritative, Clear, Unobstructive. The UI should feel like a premium reference manual, not a flashy promotional site.
*   **Typography:**
    *   **Headings/UI Elements:** A modern, highly legible sans-serif (e.g., *Inter* or *Roboto*) structurally separating rules.
    *   **Rules Prose:** A carefully chosen, highly readable font optimized for long-form reading on screens, paired with a generous line-height (e.g., `1.6`) and constrained line lengths (max 75 characters) to reduce eye fatigue.
*   **Contrast & Color:**
    *   **Strict WCAG AA/AAA Compliance:** High contrast is non-negotiable for low-light environments (game stores).
    *   **First-Class Dark Mode:** Essential for player comfort during long tournaments. Use soft, deep grays instead of pure black.
    *   **Intentional Accent Color:** Use a single, distinct brand color *only* for interactive semantic elements (glossary terms, active TOC links, primary buttons). This signals interactivity clearly without distracting the reader from the core rules logic.
*   **Whitespace:** Utilize generous structural margins between rule sections to allow players to visually parse discrete logic blocks at a glance.
