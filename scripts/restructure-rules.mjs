import fs from "node:fs/promises";
import path from "node:path";

const contentDir = path.join(process.cwd(), "content");
const rulesPath = path.join(contentDir, "rules.json");
const glossaryPath = path.join(contentDir, "glossary.json");
const projectPath = path.join(contentDir, "project.json");

const sectionMap = new Map([
  ["0", "0"],
  ["10", "1"],
  ["20", "2"],
  ["30", "3"],
  ["40", "4"],
  ["50", "5"],
  ["60", "6"],
  ["90", "9"]
]);

async function main() {
  const [rules, glossary, project] = await Promise.all([
    readJson(rulesPath),
    readJson(glossaryPath),
    readJson(projectPath)
  ]);

  const migratedRules = rules.map((section) => migrateSection(section));
  const migratedGlossary = glossary.map((term) => ({
    ...term,
    shortDefinition: replaceReferences(normalizeDeadHero(term.shortDefinition)),
    fullDefinition: replaceReferences(normalizeDeadHero(term.fullDefinition))
  }));
  const migratedProject = {
    ...project,
    overview:
      "This repository stores a physical card game's rules as Markdown-authored content. Structured JSON and the web rulebook are generated from the same glossary and rules files.",
    recommendation:
      "Use GLOSSARY.md and rules/ as the source of truth. Treat content/ and dist/ as generated outputs."
  };

  await Promise.all([
    writeJson(rulesPath, migratedRules),
    writeJson(glossaryPath, migratedGlossary),
    writeJson(projectPath, migratedProject)
  ]);

  process.stdout.write("Renumbered rule sections and removed remaining Dead Hero prose.\n");
}

function migrateSection(section) {
  const newDisplayNumber = mapMajor(section.displayNumber);
  const newId = `${newDisplayNumber}-${section.slug}`;
  const newFileName = `${newDisplayNumber}-${section.slug}.md`;

  return {
    ...section,
    id: newId,
    fileName: newFileName,
    displayNumber: newDisplayNumber,
    intro: replaceReferences(normalizeDeadHero(section.intro || "")),
    subsections: section.subsections.map((subsection) => ({
      ...subsection,
      id: migrateSubsectionId(subsection.id),
      body: replaceReferences(normalizeDeadHero(subsection.body))
    }))
  };
}

function migrateSubsectionId(subsectionId) {
  const [major, rest] = subsectionId.split(".");
  return `${mapMajor(major)}.${rest}`;
}

function replaceReferences(text) {
  return text.replace(/§(\d+)(\.\d+)?/g, (_, major, suffix = "") => `§${mapMajor(major)}${suffix}`);
}

function normalizeDeadHero(text) {
  return text
    .replace(/\*\*Dead Hero\*\*/g, "[[dead|Dead]] [[hero|Hero]]")
    .replace(/\bDead Hero\b/g, "[[dead|Dead]] [[hero|Hero]]");
}

function mapMajor(major) {
  return sectionMap.get(String(major)) || String(major);
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

main().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
