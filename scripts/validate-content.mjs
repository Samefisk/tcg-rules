import fs from "node:fs/promises";
import path from "node:path";

const contentDir = path.join(process.cwd(), "content");

async function main() {
  const [glossaryData, rules] = await Promise.all([
    readJson("glossary.json"),
    readJson("rules.json")
  ]);
  const glossary = glossaryData.terms;
  const categories = glossaryData.categories;

  const sectionReferenceIds = buildSectionReferenceIds(rules);

  const categoryIds = new Set();
  const categoryLabels = new Set();
  for (const category of categories) {
    assert(!categoryIds.has(category.id), `Duplicate glossary category id: ${category.id}`);
    assert(!categoryLabels.has(category.label), `Duplicate glossary category label: ${category.label}`);
    categoryIds.add(category.id);
    categoryLabels.add(category.label);
    assert(category.termId === category.id, `Glossary category "${category.id}" must reference its own glossary term`);
  }

  const termIds = new Set();
  const termLabels = new Set();
  for (const term of glossary) {
    assert(!termIds.has(term.id), `Duplicate glossary id: ${term.id}`);
    assert(!termLabels.has(term.label), `Duplicate glossary label: ${term.label}`);
    termIds.add(term.id);
    termLabels.add(term.label);
    for (const categoryId of term.categories || []) {
      assert(categoryIds.has(categoryId), `Unknown glossary category "${categoryId}" on term ${term.id}`);
      assert(categoryId !== term.id, `Glossary term "${term.id}" cannot categorize itself`);
    }
  }

  const ruleIds = new Set();
  const ruleSubsectionIds = new Set();
  for (const section of rules) {
    assert(!ruleIds.has(section.id), `Duplicate rule section id: ${section.id}`);
    ruleIds.add(section.id);
    validateRuleBlocks(section.id, "intro", section.introBlocks || [], termIds, sectionReferenceIds);
    for (const subsection of section.subsections) {
      assert(!ruleSubsectionIds.has(subsection.id), `Duplicate rule subsection id: ${subsection.id}`);
      ruleSubsectionIds.add(subsection.id);
      validateRuleBlocks(section.id, subsection.id, subsection.blocks || [], termIds, sectionReferenceIds);
    }
  }

  for (const term of glossary) {
    validateTokenIds("glossary", term.id, term.summary || "", termIds, sectionReferenceIds);
    validateTokenIds("glossary", term.id, term.shortDefinition, termIds, sectionReferenceIds);
    validateTokenIds("glossary", term.id, term.fullDefinition, termIds, sectionReferenceIds);
  }

  process.stdout.write("Canonical content validation passed.\n");
}

function buildSectionReferenceIds(rules) {
  const ids = new Set();
  for (const section of rules) {
    ids.add(normalizeSectionReference(section.title));
    for (const subsection of section.subsections) {
      ids.add(normalizeSectionReference(`${section.title} > ${subsection.title}`));
    }
  }
  return ids;
}

function extractGlossaryTokenIds(text) {
  return [...text.matchAll(/\[\[([a-z0-9-]+)\|([^[\]]+)\]\]/g)].map((match) => match[1]);
}

function extractSummaryTokenIds(text) {
  return [...text.matchAll(/\[\[summary:([a-z0-9-]+)\]\]/g)].map((match) => match[1]);
}

function extractSectionReferenceIds(text) {
  return [...text.matchAll(/\[\[section:([^[\]|]+)(?:\|([^[\]]+))?\]\]/g)].map((match) => normalizeSectionReference(match[1]));
}

function validateTokenIds(scope, id, text, termIds, sectionReferenceIds) {
  for (const tokenId of extractGlossaryTokenIds(text)) {
    assert(termIds.has(tokenId), `Unknown glossary token "${tokenId}" in ${scope}:${id}`);
  }
  for (const tokenId of extractSummaryTokenIds(text)) {
    assert(termIds.has(tokenId), `Unknown summary token "${tokenId}" in ${scope}:${id}`);
  }
  for (const sectionReferenceId of extractSectionReferenceIds(text)) {
    assert(sectionReferenceIds.has(sectionReferenceId), `Unknown section reference "${sectionReferenceId}" in ${scope}:${id}`);
  }
}

function validateRuleBlocks(scope, id, blocks, termIds, sectionReferenceIds) {
  let expectedBlockIndex = 1;

  for (const block of blocks) {
    assert(block && typeof block === "object", `Invalid rule block in ${scope}:${id}`);
    assert(typeof block.type === "string" && block.type.length > 0, `Missing block type in ${scope}:${id}`);
    assert(typeof block.sourceMarkdown === "string", `Missing sourceMarkdown in ${scope}:${id}`);
    assert(typeof block.rawSourceMarkdown === "string", `Missing rawSourceMarkdown in ${scope}:${id}`);
    assert(block.blockIndex === expectedBlockIndex, `Unexpected blockIndex in ${scope}:${id}`);
    assert(Array.isArray(block.comments), `Comments must be an array in ${scope}:${id}`);
    validateComments(scope, `${id}#${block.blockIndex}`, block.comments);
    assert(block.source && typeof block.source === "object", `Missing source metadata in ${scope}:${id}`);
    assert(typeof block.source.filePath === "string" && block.source.filePath.length > 0, `Missing source file path in ${scope}:${id}`);
    assert(typeof block.source.scope === "string" && block.source.scope.length > 0, `Missing source scope in ${scope}:${id}`);
    assert(Number.isInteger(block.source.startOffset), `Missing source startOffset in ${scope}:${id}`);
    assert(Number.isInteger(block.source.endOffset), `Missing source endOffset in ${scope}:${id}`);
    assert(Number.isInteger(block.source.insertOffset), `Missing source insertOffset in ${scope}:${id}`);
    assert(block.source.startOffset <= block.source.endOffset, `Invalid source range in ${scope}:${id}`);
    assert(block.source.endOffset <= block.source.insertOffset, `Invalid source insert offset in ${scope}:${id}`);
    validateTokenIds(scope, `${id}#${block.blockIndex}`, block.sourceMarkdown, termIds, sectionReferenceIds);
    if (block.type === "list" && Array.isArray(block.items)) {
      validateListItems(scope, `${id}#${block.blockIndex}`, block.items, termIds, sectionReferenceIds);
    }
    expectedBlockIndex += 1;
  }
}

function validateListItems(scope, id, items, termIds, sectionReferenceIds) {
  for (const [index, item] of items.entries()) {
    assert(typeof item.contentMarkdown === "string", `Missing list item contentMarkdown in ${scope}:${id}.${index + 1}`);
    assert(typeof item.rawSourceMarkdown === "string", `Missing list item rawSourceMarkdown in ${scope}:${id}.${index + 1}`);
    assert(Array.isArray(item.comments), `Comments must be an array in ${scope}:${id}.${index + 1}`);
    validateComments(scope, `${id}.${index + 1}`, item.comments);
    assert(item.source && typeof item.source === "object", `Missing list item source metadata in ${scope}:${id}.${index + 1}`);
    assert(typeof item.source.filePath === "string" && item.source.filePath.length > 0, `Missing list item file path in ${scope}:${id}.${index + 1}`);
    assert(Number.isInteger(item.source.startOffset), `Missing list item startOffset in ${scope}:${id}.${index + 1}`);
    assert(Number.isInteger(item.source.endOffset), `Missing list item endOffset in ${scope}:${id}.${index + 1}`);
    assert(Number.isInteger(item.source.insertOffset), `Missing list item insertOffset in ${scope}:${id}.${index + 1}`);
    assert(item.source.targetType === "list-item", `Invalid list item target type in ${scope}:${id}.${index + 1}`);
    validateTokenIds(scope, `${id}.${index + 1}`, item.contentMarkdown, termIds, sectionReferenceIds);
    for (const nestedList of item.nestedLists || []) {
      validateListItems(scope, `${id}.${index + 1}`, nestedList.items || [], termIds, sectionReferenceIds);
    }
  }
}

function validateComments(scope, id, comments) {
  for (const [index, comment] of comments.entries()) {
    assert(comment && typeof comment === "object", `Invalid comment in ${scope}:${id}.${index + 1}`);
    assert(typeof comment.text === "string" && comment.text.length > 0, `Missing comment text in ${scope}:${id}.${index + 1}`);
    assert(comment.source && typeof comment.source === "object", `Missing comment source in ${scope}:${id}.${index + 1}`);
    assert(Number.isInteger(comment.source.startOffset), `Missing comment startOffset in ${scope}:${id}.${index + 1}`);
    assert(Number.isInteger(comment.source.endOffset), `Missing comment endOffset in ${scope}:${id}.${index + 1}`);
    assert(comment.source.startOffset <= comment.source.endOffset, `Invalid comment source range in ${scope}:${id}.${index + 1}`);
  }
}

function normalizeSectionReference(value) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function readJson(fileName) {
  return JSON.parse(await fs.readFile(path.join(contentDir, fileName), "utf8"));
}

main().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
