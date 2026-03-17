# Agent Instructions

You are a game design and rules tooling assistant for this repository.
Treat the repo like a codebase with canonical authoring sources and
generated outputs.

## Read First

Before responding or editing, read:

- `GLOSSARY.md`
- `rules/`
- `CONVENTIONS.md`
- `CHANGELOG.md`

If the task touches the site or generator, also read the relevant files
in `scripts/` and `site-src/`.

## Source Of Truth

1. `GLOSSARY.md` defines canonical rules terminology.
2. `rules/` defines canonical player-facing rules text.
3. `CONVENTIONS.md` defines writing and formatting constraints.
4. `content/` and `dist/` are generated outputs.
5. `CHANGELOG.md` is the canonical maintenance log shown on the website.

Do not hand-edit generated files unless the task is explicitly about the
generator itself.

## Workflow

When changing rules:

1. Update `GLOSSARY.md` first if terminology changes.
2. Update canonical rules in `rules/`.
3. Update build logic only if the generator or site behavior must change.
4. Add a `CHANGELOG.md` entry if the rules meaning changed.
5. Run `npm run build` so `content/` and `dist/` stay in sync.

When changing only the website or presentation layer:

- Do not add a changelog entry unless the change affects rules meaning.

## Changelog Rules

Use newest date first.

Use only these category headings when a date section has matching items:

- `### Added`
- `### Changed`
- `### Removed`
- `### Fixed`

Rules for entries:

- Include only categories that have items.
- Write one concise bullet per material change.
- When a bullet describes a rename, replacement, or wording change with a
  clear before/after state, format it as `previous state → new state`.
- After the `previous state → new state` segment, add one short sentence
  only if extra context is needed.
- Record rules changes, glossary semantics changes, and canonical rules
  content changes.
- Do not log routine rebuilds or presentation-only site changes unless
  they alter how the rules are understood.

## Writing Rules

- Use second person in rules text.
- Write one rule per sentence.
- Keep sentences short.
- Use only glossary terms or obvious lowercase combinations of glossary
  terms in operative rules text.
- Use `Summary:` in `GLOSSARY.md` when a term needs a canonical short
  reusable description.
- Treat `Summary:` as the source of truth for concise glossary text.
- Use `[[summary:term-id]]` in `rules/` when you need to insert that
  canonical short description into rules text.
- Do not hand-copy or rephrase a glossary summary in `rules/` when the
  same text should stay reusable.
- Add a `> **Example:**` blockquote after conditionals or calculations.
- Do not silently resolve ambiguity.
- Mark rationale with `<!-- DESIGN NOTE: -->`.
- Mark unresolved issues with `<!-- AMBIGUOUS: -->`.

## Never

- Invent new rules terms without updating `GLOSSARY.md`.
- Hand-edit `content/` or `dist/` as the primary change path.
- Skip `CHANGELOG.md` when a rules change is material.
- Add changelog entries for website-only changes that do not affect the
  rules.
