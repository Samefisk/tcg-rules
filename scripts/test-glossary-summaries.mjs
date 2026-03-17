import fs from "node:fs/promises";
import path from "node:path";

const contentDir = path.join(process.cwd(), "content");
const distDir = path.join(process.cwd(), "dist");

async function main() {
  const [glossaryData, rules, anatomyHtml] = await Promise.all([
    readJson("glossary.json"),
    readJson("rules.json"),
    fs.readFile(path.join(distDir, "rules", "card-anatomy.html"), "utf8")
  ]);

  const glossary = glossaryData.terms;
  const agility = glossary.find((term) => term.id === "agility");
  const intellect = glossary.find((term) => term.id === "intellect");
  const title = glossary.find((term) => term.id === "title");
  const illustration = glossary.find((term) => term.id === "illustration");

  assert(agility?.summary, "Agility summary is missing.");
  assert(intellect?.summary, "Intellect summary is missing.");
  assert(title?.summary, "Title summary is missing.");
  assert(illustration?.summary, "Illustration summary is missing.");
  const agilitySummary = normalizeText(stripMarkup(agility.summary));
  const intellectSummary = normalizeText(stripMarkup(intellect.summary));
  const titleSummary = normalizeText(stripMarkup(title.summary));
  const illustrationSummary = normalizeText(stripMarkup(illustration.summary));
  assert(
    agilitySummary.includes("determines turn order among all ready heroes in a round") &&
      agilitySummary.includes("sets how far that hero may move during its turn"),
    "Agility summary did not use the authored canonical summary."
  );
  assert(
    intellectSummary.includes("sets how many cards that hero draws at the start of its turn"),
    "Intellect summary did not use the authored canonical summary."
  );
  assert(
    titleSummary.includes("printed name at the top of a card") &&
      titleSummary.includes("identifies that card"),
    "Title summary did not use the authored canonical summary."
  );
  assert(
    illustrationSummary.includes("printed art on a card") &&
      illustrationSummary.includes("helps you recognize that card"),
    "Illustration summary did not use the authored canonical summary."
  );

  const heroCards = rules.find((section) => section.id === "1-card-anatomy")?.subsections?.find((sub) => sub.id === "1.1");
  assert(heroCards, "Section 1.1 Hero Cards was not found.");
  const heroCardsSource = JSON.stringify(heroCards.blocks || []);
  assert(heroCardsSource.includes("[[summary:title]]"), "Section 1.1 does not contain the Title summary token.");
  assert(heroCardsSource.includes("[[summary:illustration]]"), "Section 1.1 does not contain the Illustration summary token.");
  assert(heroCardsSource.includes("[[summary:agility]]"), "Section 1.1 does not contain the Agility summary token.");
  assert(heroCardsSource.includes("[[summary:intellect]]"), "Section 1.1 does not contain the Intellect summary token.");

  const anatomyText = normalizeHtmlText(anatomyHtml);
  assert(
    anatomyText.includes("agility hero-stat : a stat on a hero") &&
      anatomyText.includes("determines turn order among all ready heroes") &&
      anatomyText.includes("sets how far that hero") &&
      anatomyText.includes("may move during its turn"),
    "Rendered anatomy page does not contain the Agility summary."
  );
  assert(
    anatomyText.includes("intellect hero-stat : a stat on a hero") &&
      anatomyText.includes("sets how many cards that hero") &&
      anatomyText.includes("draws at the start of its turn"),
    "Rendered anatomy page does not contain the Intellect summary."
  );
  assert(
    anatomyText.includes("title : the printed name at the top of a card") &&
      anatomyText.includes("identifies that card"),
    "Rendered anatomy page does not contain the Title summary."
  );
  assert(
    anatomyText.includes("illustration : the printed art on a card") &&
      anatomyText.includes("helps you recognize that card"),
    "Rendered anatomy page does not contain the Illustration summary."
  );

  process.stdout.write("Glossary summary checks passed.\n");
}

async function readJson(fileName) {
  return JSON.parse(await fs.readFile(path.join(contentDir, fileName), "utf8"));
}

function stripMarkup(text) {
  return String(text || "")
    .replace(/\[\[([a-z0-9-]+)\|([^[\]]+)\]\]/g, "$2")
    .replace(/\[\[summary:([a-z0-9-]+)\]\]/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(text) {
  return String(text || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeHtmlText(html) {
  return normalizeText(
    String(html || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&quot;/g, "\"")
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&")
  );
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
