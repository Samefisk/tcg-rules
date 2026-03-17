# Conventions

These conventions apply to all rules content.

## Structure

- `rules/` contains player-facing rules text.
- `content/` is generated from `GLOSSARY.md` and `rules/`.
- `logic/` contains pseudocode used to validate rules behavior.
- `CHANGELOG.md` records every material rules change.
- `GLOSSARY.md` defines allowed rules terminology.

## Rules Maturity

- Mark a section as `defined` when its operative behavior is complete and authoritative.
- Mark a section as `partial` when it defines real behavior but intentionally leaves some related behavior for later sections.
- Mark a section as `placeholder` when it reserves structure but does not yet define operative behavior.
- Do not describe a `placeholder` section as if it were fully implemented elsewhere in the rulebook.

## Writing Rules

- Use second person in rules text.
- Write one rule per sentence.
- Keep sentences short.
- Use only glossary terms or obvious lowercase combinations of glossary terms in operative rules text.
- Use `Max Health` and `Remaining Health` in player-facing rules text and card effects. Do not use bare `Health` there.
- Write glossary terms naturally in source Markdown. Build output applies glossary formatting and linking automatically.
- Use `[[summary:term-id]]` when you need the canonical short glossary summary inside rules text.
- Add a `> **Example:**` blockquote after conditionals or calculations.

## Writing Logic

- Use plain pseudocode, not a real programming language.
- Mirror rule section numbers where practical.
- Do not introduce mechanics that do not exist in `rules/`.

## Open Issues

- Mark rationale with `<!-- DESIGN NOTE: -->`.
- Mark unresolved problems with `<!-- AMBIGUOUS: -->`.
- Do not silently resolve ambiguities.

## Author Comments

- Use `<!-- COMMENT: ... -->` immediately after the top-level markdown block you want to annotate.
- Valid targets are top-level paragraphs, lists, examples, code blocks, card-image blocks, and DESIGN NOTE or AMBIGUOUS callouts.
- Author comments are metadata for the site comments mode. They are not rules text.
- Do not place `<!-- COMMENT: ... -->` before the first block in an intro or subsection.
