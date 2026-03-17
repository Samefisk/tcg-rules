# Frontend Architecture

This document outlines the architectural patterns and rules for the front-end layer of the interactive rulebook.

## Core Principles

1.  **Pure Vanilla JS & CSS**: The front-end is intentionally kept simple without a bundler (Webpack, Vite, etc.) to minimize overhead and build complexity. The output is directly served via statically generated HTML containing CSS and JS assets.
2.  **CDN-First Dependencies**: Any external libraries required for client-side functionality (e.g., Fuse.js for search, Floating UI for tooltips) should be injected via robust CDN links in the HTML `<head>`.
3.  **Entity-Based Search**: Search is powered by a pre-built static index (`search-index.json`). The client fetches this index on load and uses it for entity-based resolution, grouping results visually by entity type (Terms vs Sections).
4.  **No Dynamic Content Generation**: All textual content and relationship linking (e.g., glossary terms referenced) is generated server-side during the `node scripts/build-site.mjs` build step. The client-side logic is exclusively for interaction enhancements:
    *   Toggling Modals / Bottom Sheets
    *   Calculating Tooltip Positions
    *   Highlighting TOC active items via `IntersectionObserver`
5.  **CSS Custom Properties for Theming**: Strict WCAG compliance and theming (Light/Dark Mode) are driven completely by CSS variables exposed on `:root` and controlled by `@media (prefers-color-scheme: dark)`.

## Responsive Design

-   **Mobile-First Approach**: Styles should target smaller viewports first. Desktop enhancements (like the sticky sidebar TOC) are introduced via min-width media queries.
-   **Context-Aware Popovers**: On desktop, glossary references trigger non-blocking tooltips on hover. On mobile viewports, the same interaction triggers a fixed bottom-sheet modal via `click/tap` to preserve scroll position and legibility.
