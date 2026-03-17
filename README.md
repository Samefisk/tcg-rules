# TCG Rules Workspace

This repository stores a physical card game's rules as Markdown-authored content with generated structured data and site output.

## Source of Truth

- `GLOSSARY.md` defines canonical rules terms.
- `rules/` defines canonical player-facing rules.
- `CONVENTIONS.md` defines writing and formatting rules.
- `content/` contains generated structured data used by validation and the site builder.
- `dist/` is the generated interactive rulebook site.
- `CHANGELOG.md` records material changes.

## Workflow

1. Define or update terms in `GLOSSARY.md`.
2. Edit canonical rules in `rules/`.
3. Record material changes in `CHANGELOG.md`.
4. Write glossary terms naturally in prose. The generator detects and links them automatically.
5. Run `npm run build` to regenerate `content/`, validate it, and build the site.

## Commands

- `npm run generate` rebuilds `content/` from `GLOSSARY.md` and `rules/`.
- `npm run migrate` is a legacy alias for `npm run generate`.
- `npm run restructure` renumbers canonical sections to the current single-digit scheme and updates `§` references.
- `npm run normalize` is a legacy alias for `npm run generate`.
- `npm run validate` checks glossary token integrity and section structure.
- `npm run build` regenerates `content/`, validates it, then builds `dist/`.
- `npm run preview` serves `dist/` locally on `http://localhost:4173`.
