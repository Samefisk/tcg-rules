import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import {
  getBadgeIconAssetFilename,
  getBadgeIconAssetSize,
  getBadgeIconContentSize,
  getBadgeIconKind,
  normalizeBadgeIconKey
} from "../site-src/badge-icons.js";

const rootDir = process.cwd();
const contentDir = path.join(rootDir, "content");
const distDir = path.join(rootDir, "dist");
const assetsSourceDir = path.join(rootDir, "site-src");
const badgeIconsSourceDir = path.join(assetsSourceDir, "badge-icons");
const mediaSourceDir = path.join(assetsSourceDir, "media");
const BADGE_ICON_VARIANTS = Object.freeze(["inline", "heading", "tooltip"]);
const BADGE_ICON_VERTICAL_INSET_BY_VARIANT = Object.freeze({
  inline: 1,
  heading: 1,
  tooltip: 1
});

async function main() {
  const [project, glossaryData, rules] = await Promise.all([
    readJson(path.join(contentDir, "project.json")),
    readJson(path.join(contentDir, "glossary.json")),
    readJson(path.join(contentDir, "rules.json"))
  ]);
  const changelogMarkdown = await fs.readFile(path.join(rootDir, "CHANGELOG.md"), "utf8");
  const glossary = glossaryData.terms;
  const categories = glossaryData.categories;
  const glossarySurfaceIndex = buildSurfaceIndex(glossary);
  const changelogEntries = annotateChangelogEntries(
    parseChangelogEntries(changelogMarkdown),
    glossarySurfaceIndex
  );

  validateContent(glossary, categories, rules);
  const badgeIconManifest = await buildBadgeIconManifest(categories);

  await Promise.all([
    fs.mkdir(distDir, { recursive: true }),
    fs.mkdir(path.join(distDir, "assets"), { recursive: true }),
    fs.mkdir(path.join(distDir, "rules"), { recursive: true }),
    fs.mkdir(path.join(distDir, "glossary"), { recursive: true })
  ]);

  await Promise.all([
    clearDirectory(path.join(distDir, "rules")),
    clearDirectory(path.join(distDir, "glossary")),
    clearDirectory(path.join(distDir, "assets"))
  ]);

  await fs.mkdir(path.join(distDir, "assets", "badges"), { recursive: true });

  const categoryIndex = buildCategoryIndex(categories);
  const glossaryIndex = buildGlossaryIndex(glossary, categoryIndex, badgeIconManifest);
  const ruleReferenceIndex = buildRuleReferenceIndex(rules);
  const termUsage = buildTermUsage(rules, glossaryIndex);
  const searchData = buildSearchData(rules, glossary, changelogEntries);

  await Promise.all([
    copyAsset("styles.css"),
    copyAsset("app.js"),
    copyAsset("badge-icons.js"),
    generateBadgeRasterAssets(badgeIconManifest),
    copyDirectoryIfExists(mediaSourceDir, path.join(distDir, "assets", "media")),
    fs.writeFile(path.join(distDir, "assets", "search-index.json"), JSON.stringify(searchData), "utf8"),
    fs.writeFile(
      path.join(distDir, "assets", "search-index.js"),
      `window.__SEARCH_DATA__ = ${JSON.stringify(searchData)};\n`,
      "utf8"
    )
  ]);

  const overviewSection = rules.find(r => r.displayNumber === "0" || r.id === "0");

  await Promise.all([
    writeHtml(
      path.join(distDir, "index.html"),
      layout({
        title: overviewSection ? `${overviewSection.displayNumber}. ${overviewSection.title}` : project.title,
        pagePath: path.join(distDir, "index.html"),
        floatingTabBar: overviewSection ? buildRulePageTabBar(overviewSection, rules, path.join(distDir, "index.html")) : buildStaticPageTabBar({ hasTocPlaceholder: false }),
        body: overviewSection ? renderRulePage(overviewSection, rules, glossaryIndex, ruleReferenceIndex, termUsage, path.join(distDir, "index.html"), changelogEntries) : `<p>Error: Game Overview content missing.</p>`,
        tocOverlay: overviewSection ? renderRulePageTocOverlay(overviewSection, rules, path.join(distDir, "index.html"), changelogEntries) : ""
      })
    ),
    writeHtml(
      path.join(distDir, "glossary", "index.html"),
      layout({
        title: `${project.title} Glossary`,
        pagePath: path.join(distDir, "glossary", "index.html"),
        floatingTabBar: buildStaticPageTabBar({ hasTocPlaceholder: false }),
        body: renderGlossaryIndexPage(
          [...glossaryIndex.values()],
          termUsage,
          glossaryIndex,
          ruleReferenceIndex,
          path.join(distDir, "glossary", "index.html")
        ),
        tocOverlay: ""
      })
    )
  ]);

  for (const section of rules) {
    const targetPath = path.join(distDir, "rules", `${section.slug}.html`);
    await writeHtml(
      targetPath,
      layout({
        title: `${section.displayNumber}. ${section.title}`,
        pagePath: targetPath,
        floatingTabBar: buildRulePageTabBar(section, rules, targetPath),
        body: renderRulePage(section, rules, glossaryIndex, ruleReferenceIndex, termUsage, targetPath, changelogEntries),
        tocOverlay: renderRulePageTocOverlay(section, rules, targetPath, changelogEntries)
      })
    );
  }

  for (const term of glossary) {
    const enrichedTerm = glossaryIndex.get(term.id);
    const targetPath = path.join(distDir, "glossary", `${term.id}.html`);
    await writeHtml(
      targetPath,
      layout({
        title: term.label,
        pagePath: targetPath,
        floatingTabBar: buildStaticPageTabBar({ hasTocPlaceholder: false }),
        body: renderGlossaryTermPage(enrichedTerm, termUsage.get(term.id) || [], glossaryIndex, ruleReferenceIndex, targetPath),
        tocOverlay: ""
      })
    );
  }

  process.stdout.write("Built static site.\n");
}

function validateContent(glossary, categories, rules) {
  const categoryIds = new Set();
  const categoryLabels = new Set();
  for (const category of categories) {
    if (categoryIds.has(category.id)) {
      throw new Error(`Duplicate glossary category id: ${category.id}`);
    }
    if (categoryLabels.has(category.label)) {
      throw new Error(`Duplicate glossary category label: ${category.label}`);
    }
    categoryIds.add(category.id);
    categoryLabels.add(category.label);
    if (category.termId !== category.id) {
      throw new Error(`Glossary category "${category.id}" must reference its own glossary term`);
    }
  }

  const termIds = new Set();
  const termLabels = new Set();
  for (const term of glossary) {
    if (termIds.has(term.id)) {
      throw new Error(`Duplicate glossary id: ${term.id}`);
    }
    if (termLabels.has(term.label)) {
      throw new Error(`Duplicate glossary label: ${term.label}`);
    }
    termIds.add(term.id);
    termLabels.add(term.label);
    for (const categoryId of term.categories || []) {
      if (!categoryIds.has(categoryId)) {
        throw new Error(`Unknown glossary category "${categoryId}" on term ${term.id}`);
      }
      if (categoryId === term.id) {
        throw new Error(`Glossary term "${term.id}" cannot categorize itself`);
      }
    }
  }

  const ruleIds = new Set();
  for (const section of rules) {
    if (ruleIds.has(section.id)) {
      throw new Error(`Duplicate rule section id: ${section.id}`);
    }
    ruleIds.add(section.id);
  }
}

function buildCategoryIndex(categories) {
  const categoryIndex = new Map();
  for (const category of categories) {
    categoryIndex.set(category.id, category);
  }
  return categoryIndex;
}

function buildGlossaryIndex(glossary, categoryIndex, badgeIconManifest) {
  const termIndex = new Map();
  for (const term of glossary) {
    termIndex.set(term.id, {
      ...term,
      childTerms: [],
      url: `glossary/${term.id}.html`
    });
  }

  for (const term of termIndex.values()) {
    term.categoryBadges = (term.categories || [])
      .map((categoryId) => {
        const category = categoryIndex.get(categoryId);
        const categoryTerm = termIndex.get(categoryId);
        if (!category || !categoryTerm) {
          return null;
        }

        return {
          id: category.id,
          iconKind: badgeIconManifest.get(category.id)?.id || null,
          label: category.label,
          badge: category.badge,
          badgeColor: category.badgeColor || null,
          shortDefinition: categoryTerm.shortDefinition,
          categoryBadges: categoryTerm.categoryBadges || [],
          url: categoryTerm.url
        };
      })
      .filter(Boolean);
  }

  for (const term of termIndex.values()) {
    for (const categoryId of term.categories || []) {
      const categoryTerm = termIndex.get(categoryId);
      if (!categoryTerm) {
        continue;
      }
      categoryTerm.childTerms.push({
        id: term.id,
        label: term.label,
        shortDefinition: stripMarkdown(term.shortDefinition),
        fullDefinition: term.fullDefinition,
        url: term.url
      });
    }
  }

  for (const term of termIndex.values()) {
    term.childTerms.sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: "base" }));
  }

  for (const term of termIndex.values()) {
    term.categoryBadges = (term.categoryBadges || []).map((category) => ({
      ...category,
      childTerms: termIndex.get(category.id)?.childTerms || []
    }));
  }

  return termIndex;
}

async function buildBadgeIconManifest(categories) {
  const manifest = new Map();
  const categoryIds = new Set(categories.map((category) => normalizeBadgeIconKey(category.id)));

  if (!fsSync.existsSync(badgeIconsSourceDir)) {
    return manifest;
  }

  const entries = await fs.readdir(badgeIconsSourceDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== ".svg") {
      continue;
    }

    const sourcePath = path.join(badgeIconsSourceDir, entry.name);
    const normalizedId = normalizeBadgeIconKey(path.basename(entry.name, ".svg"));
    if (!normalizedId) {
      throw new Error(`Badge icon filename must resolve to a glossary category id: ${entry.name}`);
    }
    if (!categoryIds.has(normalizedId)) {
      throw new Error(`Badge icon "${entry.name}" does not match any glossary category id`);
    }
    if (manifest.has(normalizedId)) {
      throw new Error(
        `Badge icon filenames "${manifest.get(normalizedId).filename}" and "${entry.name}" both normalize to "${normalizedId}"`
      );
    }

    const svgMarkup = await fs.readFile(sourcePath, "utf8");
    manifest.set(normalizedId, {
      id: normalizedId,
      filename: entry.name,
      svgMarkup: prepareBadgeIconSvg(svgMarkup, normalizedId)
    });
  }

  return manifest;
}

function prepareBadgeIconSvg(svgMarkup, iconKind) {
  const strippedMarkup = String(svgMarkup || "")
    .replace(/^\uFEFF/, "")
    .replace(/<\?xml[\s\S]*?\?>/gi, "")
    .replace(/<!doctype[\s\S]*?>/gi, "")
    .trim();

  if (!/^<svg\b/i.test(strippedMarkup)) {
    throw new Error(`Badge icon "${iconKind}" must contain a root <svg> element`);
  }

  const colorNormalizedMarkup = coerceBadgeSvgColors(strippedMarkup);
  const hasExplicitColor = /(\bfill\s*=|\bstroke\s*=|\bstyle\s*=)/i.test(colorNormalizedMarkup);

  return colorNormalizedMarkup.replace(/<svg\b([^>]*)>/i, (match, rawAttributes) => {
    const attributes = String(rawAttributes || "");
    const classAttributeMatch = attributes.match(/\bclass=(['"])(.*?)\1/i);
    const withClass = classAttributeMatch
      ? attributes.replace(/\bclass=(['"])(.*?)\1/i, (_, quote, className) => `class=${quote}${className} badge-raster-svg${quote}`)
      : `${attributes} class="badge-raster-svg"`;
    const withAspect = /\bpreserveAspectRatio=/.test(withClass)
      ? withClass
      : `${withClass} preserveAspectRatio="xMidYMid meet"`;
    const withDefaultFill = hasExplicitColor || /\bfill=/.test(withAspect)
      ? withAspect
      : `${withAspect} fill="currentColor"`;

    return `<svg${withDefaultFill}>`;
  });
}

function coerceBadgeSvgColors(svgMarkup) {
  const replacer = (match, prefix, value, suffix) => {
    const normalizedValue = String(value || "").trim().toLowerCase();
    if (
      normalizedValue === "none" ||
      normalizedValue === "currentcolor" ||
      normalizedValue.startsWith("url(")
    ) {
      return match;
    }

    return `${prefix}currentColor${suffix}`;
  };

  return String(svgMarkup)
    .replace(/(\bfill\s*=\s*["'])([^"']+)(["'])/gi, replacer)
    .replace(/(\bstroke\s*=\s*["'])([^"']+)(["'])/gi, replacer)
    .replace(/(\bstyle\s*=\s*["'][^"']*\bfill\s*:\s*)([^;"']+)([;"'])/gi, replacer)
    .replace(/(\bstyle\s*=\s*["'][^"']*\bstroke\s*:\s*)([^;"']+)([;"'])/gi, replacer);
}

function buildRuleReferenceIndex(rules) {
  const byDisplayNumber = new Map();
  const bySubsectionId = new Map();
  const byTitlePath = new Map();

  for (const section of rules) {
    const sectionKey = normalizeRuleReference(section.title);
    if (byTitlePath.has(sectionKey)) {
      throw new Error(`Duplicate rule section title reference: ${section.title}`);
    }

    const sectionTarget = { section, subsection: null };
    byDisplayNumber.set(section.displayNumber, sectionTarget);
    byTitlePath.set(sectionKey, sectionTarget);

    for (const subsection of section.subsections) {
      if (bySubsectionId.has(subsection.id)) {
        throw new Error(`Duplicate rule subsection reference: ${subsection.id}`);
      }

      const subsectionKey = normalizeRuleReference(`${section.title} > ${subsection.title}`);
      if (byTitlePath.has(subsectionKey)) {
        throw new Error(`Duplicate rule subsection title reference: ${section.title} > ${subsection.title}`);
      }

      const subsectionTarget = { section, subsection };
      bySubsectionId.set(subsection.id, subsectionTarget);
      byTitlePath.set(subsectionKey, subsectionTarget);
    }
  }

  return { byDisplayNumber, bySubsectionId, byTitlePath };
}

function buildTermUsage(rules, glossaryIndex) {
  const usage = new Map([...glossaryIndex.keys()].map((id) => [id, []]));
  for (const section of rules) {
    const sectionHtmlLabel = `${section.displayNumber}. ${section.title}`;
    const seenInSection = new Set();
    const markdownBlocks = getRuleSectionMarkdownBlocks(section);
    for (const blockMarkdown of markdownBlocks) {
      for (const termId of extractGlossaryTokenIds(blockMarkdown)) {
        if (seenInSection.has(termId) || !glossaryIndex.has(termId)) {
          continue;
        }
        usage.get(termId).push({
          id: section.id,
          slug: section.slug,
          label: sectionHtmlLabel
        });
        seenInSection.add(termId);
      }
    }
  }
  return usage;
}

function buildSearchData(rules, glossary, changelogEntries) {
  return {
    defaultIndex: buildDefaultSearchIndex(rules, glossary),
    changelogIndex: buildChangelogSearchIndex(changelogEntries)
  };
}

function buildDefaultSearchIndex(rules, glossary) {
  const index = [];
  for (const term of glossary) {
    index.push({
      type: "term",
      id: term.id,
      title: term.label,
      content: stripMarkdown(term.shortDefinition),
      url: `glossary/${term.id}.html`
    });
  }
  for (const section of rules) {
    if (section.id === "9-changelog") {
      continue;
    }
    index.push({
      type: "section",
      id: section.id,
      title: `${section.displayNumber}. ${section.title}`,
      content: stripMarkdown(joinRuleBlocksMarkdown(section.introBlocks || [])),
      url: `rules/${section.slug}.html`
    });
    for (const subsection of section.subsections) {
      index.push({
        type: "subsection",
        id: subsection.id,
        sectionId: section.id,
        title: `${subsection.id} ${subsection.title}`,
        content: stripMarkdown(joinRuleBlocksMarkdown(subsection.blocks || [])),
        url: `rules/${section.slug}.html#section-${subsection.id.replace(/\./g, "-")}`
      });
    }
  }
  return index;
}

function getRuleSectionMarkdownBlocks(section) {
  return [
    ...(section.introBlocks || []).map((block) => block.sourceMarkdown),
    ...section.subsections.flatMap((subsection) => (subsection.blocks || []).map((block) => block.sourceMarkdown))
  ];
}

function joinRuleBlocksMarkdown(blocks) {
  return (blocks || [])
    .map((block) => block.sourceMarkdown || "")
    .filter(Boolean)
    .join("\n\n");
}

function buildChangelogSearchIndex(changelogEntries) {
  return changelogEntries.flatMap((entry) =>
    entry.categories.map((category, categoryIndex) => ({
      type: "changelog",
      id: `${entry.anchor}-${categoryIndex}`,
      title: `${entry.date} - ${category.title}`,
      content: stripMarkdown(category.items.join(" ")),
      url: `rules/changelog.html#section-${entry.anchor}`
    }))
  );
}

function renderHomePage(project, rules, glossary, termUsage) {
  const articleContent = rules
    .map((section) => {
      const subsections = section.subsections.map(sub => `
           <div class="index-subsection">
              <span class="index-subsection-id">${escapeHtml(sub.id)}</span>
              <span class="index-subsection-title">${escapeHtml(sub.title)}</span>
           </div>
       `).join("");

      return `
         <section class="index-section" id="section-${section.id}" data-scrollspy-section data-scrollspy-label="${escapeAttribute(`${section.displayNumber}. ${section.title}`)}">
            <h3><a href="rules/${section.slug}.html">${escapeHtml(section.displayNumber)}. ${escapeHtml(section.title)}</a></h3>
            <div class="index-subsection-list">
               ${subsections}
            </div>
         </section>
       `;
    })
    .join("");

  const sidebarLinks = rules.map(section => `
      <li><a href="#section-${section.id}" data-toc-id="section-${section.id}">${escapeHtml(section.displayNumber)}. ${escapeHtml(section.title)}</a></li>
  `).join("");

  return `
    <div class="content-layout content-layout--with-sidebar rule-page-layout">
      <article class="panel article-panel">
        <section class="hero hero-compact" style="margin-bottom: 3rem;">
          <p class="eyebrow">Structured Rulebook</p>
          <h1>TCG Rules</h1>
          <p class="lede">This repository stores a physical card game's rules as structured content.<br/>Markdown exports and the web rulebook are generated from the same canonical glossary and rules data.</p>
        </section>
        
        <h2>Rule Sections</h2>
        <div style="margin-top: 1.5rem;">
          ${articleContent}
        </div>
      </article>

      <aside class="panel sidebar-panel">
        <div class="toc-container">
          <h2>In this Rulebook</h2>
          <ul class="toc-list">
             ${sidebarLinks}
          </ul>
        </div>
      </aside>
    </div>
  `;
}

function renderGlossaryIndexPage(glossary, termUsage, glossaryIndex, ruleReferenceIndex, pagePath) {
  const items = glossary
    .map((term) => {
      const backlinks = termUsage.get(term.id) || [];
      return `
        <article class="list-item">
          <div>
            <h2><a href="${term.id}.html">${escapeHtml(term.label)}</a>${renderCategoryBadgeStack(term.categoryBadges || [], { variant: "inline", pagePath })}</h2>
            <div class="rich-text">
              ${renderRichText(term.shortDefinition, glossaryIndex, ruleReferenceIndex, pagePath)}
            </div>
          </div>
          <span class="pill">${backlinks.length} ${backlinks.length === 1 ? "reference" : "references"}</span>
        </article>
      `;
    })
    .join("");

  return `
    <section class="hero hero-compact">
      <p class="eyebrow">Glossary</p>
      <h1>Canonical Terms</h1>
      <p class="lede">Definitions are authored once and reused across the site, exported Markdown, and rule references.</p>
    </section>
    <section class="panel list-panel">${items}</section>
  `;
}

function buildRulePageTocHtml(section, rules, pagePath) {
  return rules.map((rule) => {
    const targetUrl = rule.slug === "00-overview" ? path.join(distDir, "index.html") : path.join(distDir, "rules", `${rule.slug}.html`);
    return `
      <li class="toc-section-item">
        <details ${rule.id === section.id ? "open" : ""}>
          <summary>
            <a href="${relativeHref(pagePath, targetUrl)}" data-toc-link="true">${escapeHtml(rule.displayNumber)}. ${escapeHtml(rule.title)}</a>
          </summary>
          <ul class="toc-sublist">
            ${rule.subsections.map((sub) => `
              <li><a href="${relativeHref(pagePath, targetUrl)}#section-${escapeHtml(sub.id.replace(/\./g, "-"))}" data-toc-link="true" ${rule.id === section.id ? `data-toc-id="section-${escapeHtml(sub.id.replace(/\./g, "-"))}"` : ""}>${escapeHtml(sub.id)} ${escapeHtml(sub.title)}</a></li>
            `).join("")}
          </ul>
        </details>
      </li>
    `;
  }).join("");
}

function buildChangelogTocHtml(section, rules, pagePath, changelogEntries) {
  return rules.map((rule) => {
    const targetUrl = rule.slug === "00-overview" ? path.join(distDir, "index.html") : path.join(distDir, "rules", `${rule.slug}.html`);
    const subsectionItems = rule.id === section.id
      ? changelogEntries.map((entry) => `
          <li><a href="${relativeHref(pagePath, targetUrl)}#section-${escapeHtml(entry.anchor)}" data-toc-link="true" data-toc-id="section-${escapeHtml(entry.anchor)}">${escapeHtml(entry.date)}</a></li>
        `).join("")
      : rule.subsections.map((sub) => `
          <li><a href="${relativeHref(pagePath, targetUrl)}#section-${escapeHtml(sub.id.replace(/\./g, "-"))}" data-toc-link="true">${escapeHtml(sub.id)} ${escapeHtml(sub.title)}</a></li>
        `).join("");

    return `
      <li class="toc-section-item">
        <details ${rule.id === section.id ? "open" : ""}>
          <summary>
            <a href="${relativeHref(pagePath, targetUrl)}" data-toc-link="true">${escapeHtml(rule.displayNumber)}. ${escapeHtml(rule.title)}</a>
          </summary>
          <ul class="toc-sublist">
            ${subsectionItems}
          </ul>
        </details>
      </li>
    `;
  }).join("");
}

function renderTocContainer({ title, listHtml, listClasses = "toc-list" }) {
  return `
    <div class="toc-container">
      <h2>${escapeHtml(title)}</h2>
      <ul class="${escapeAttribute(listClasses)}">
        ${listHtml}
      </ul>
    </div>
  `;
}

function renderTocOverlay({ title, listHtml, listClasses = "toc-list" }) {
  return `
    <div class="toc-overlay-backdrop" id="toc-overlay" data-toc-overlay hidden>
      <div
        class="toc-sheet"
        id="toc-panel"
        data-toc-panel
        role="dialog"
        aria-modal="true"
        aria-labelledby="toc-overlay-title"
        tabindex="-1"
      >
        <div class="toc-sheet-header">
          <div class="toc-sheet-handle" aria-hidden="true"></div>
          <h2 id="toc-overlay-title">${escapeHtml(title)}</h2>
        </div>
        <div class="toc-sheet-content">
          <div class="toc-container toc-container-mobile">
            <ul class="${escapeAttribute(listClasses)}">
              ${listHtml}
            </ul>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderRulePageTocOverlay(section, rules, pagePath, changelogEntries = []) {
  if (!section) {
    return "";
  }

  const listHtml = section.id === "9-changelog"
    ? buildChangelogTocHtml(section, rules, pagePath, changelogEntries)
    : buildRulePageTocHtml(section, rules, pagePath);

  if (!listHtml) {
    return "";
  }

  return renderTocOverlay({
    title: "Table of contents",
    listHtml,
    listClasses: "toc-list global-toc-list"
  });
}

function renderRulePage(section, rules, glossaryIndex, ruleReferenceIndex, termUsage, pagePath, changelogEntries = []) {
  if (section.id === "9-changelog") {
    return renderChangelogPage(section, rules, glossaryIndex, ruleReferenceIndex, pagePath, changelogEntries);
  }

  const cardSizingMetrics = getPageCardSizingMetrics(section);
  const cardSizingVars = getPageCardSizingVars(cardSizingMetrics);
  const articleClassName = ["panel", "article-panel"];
  if (section.id === "1-card-anatomy") {
    articleClassName.push("rule-page--card-anatomy");
  }
  const subsectionHtml = section.subsections
    .map((subsection) => `
        <section class="rule-subsection" id="section-${escapeHtml(subsection.id.replace(/\./g, "-"))}" data-scrollspy-section data-scrollspy-label="${escapeAttribute(`${subsection.id} ${subsection.title}`)}">
          <div class="scrollspy-sentinel" aria-hidden="true" data-scrollspy-sentinel data-scrollspy-for="section-${escapeHtml(subsection.id.replace(/\./g, "-"))}"></div>
          <header class="section-header" data-mirrored-heading data-mirrored-heading-for="section-${escapeHtml(subsection.id.replace(/\./g, "-"))}">
            <h2 data-mirrored-heading-text>${escapeHtml(subsection.id)} ${escapeHtml(subsection.title)}</h2>
          </header>
          <div class="rich-text">
            ${renderRuleBlocks(subsection.blocks || [], `subsection-${subsection.id.replace(/\./g, "-")}`, glossaryIndex, ruleReferenceIndex, pagePath, cardSizingMetrics)}
          </div>
        </section>
      `)
    .join("");

  const linkedTerms = [...termUsage.entries()]
    .filter(([, backlinks]) => backlinks.some((backlink) => backlink.id === section.id))
    .map(([termId]) => glossaryIndex.get(termId))
    .sort((left, right) => left.label.localeCompare(right.label))
    .map(
      (term) => `<a href="${relativeHref(pagePath, path.join(distDir, "glossary", `${term.id}.html`))}" class="pill-outline">${escapeHtml(term.label)}</a>`
    )
    .join("");

  const globalTocHtml = buildRulePageTocHtml(section, rules, pagePath);

  return `
    <div class="content-layout content-layout--with-sidebar" style="margin-top: 2rem;">
      <article class="${escapeAttribute(articleClassName.join(" "))}"${cardSizingVars ? ` style="${cardSizingVars}"` : ""}>
        
        <section class="hero hero-compact" id="rule-section-${escapeHtml(section.id)}" data-scrollspy-section data-scrollspy-label="${escapeAttribute(`${section.displayNumber}. ${section.title}`)}">
          <div class="scrollspy-sentinel" aria-hidden="true" data-scrollspy-sentinel data-scrollspy-for="rule-section-${escapeHtml(section.id)}"></div>
          <div class="rule-section-heading rule-section-heading--banner-only" data-mirrored-heading data-mirrored-heading-for="rule-section-${escapeHtml(section.id)}">
            <p class="eyebrow" data-mirrored-heading-chrome>Rule Section ${escapeHtml(section.displayNumber)}</p>
            <h1 data-mirrored-heading-text>${escapeHtml(section.title)}</h1>
          </div>
          ${section.introBlocks?.length ? `<div class="lede rich-text">${renderRuleBlocks(section.introBlocks, `section-${section.id}-intro`, glossaryIndex, ruleReferenceIndex, pagePath, cardSizingMetrics)}</div>` : ""}
          
          ${linkedTerms ? `
          <details class="referenced-terms-accordion">
            <summary>Referenced Terms</summary>
            <div class="referenced-terms-list">
              ${linkedTerms}
            </div>
          </details>
          ` : ""}
        </section>
        ${subsectionHtml}
      </article>
      <aside class="panel sidebar-panel">
        ${renderTocContainer({
          title: "Rulebook Contents",
          listHtml: globalTocHtml,
          listClasses: "toc-list global-toc-list"
        })}
      </aside>
    </div>
  `;
}

function renderChangelogPage(section, rules, glossaryIndex, ruleReferenceIndex, pagePath, changelogEntries) {
  const changelogSections = changelogEntries
    .map((entry) => {
      const categoriesHtml = entry.categories
        .map((category) => `
          <div class="changelog-category">
            <h3>${escapeHtml(category.title)}</h3>
            <div class="rich-text">
              <ul>${category.items.map((item) => `<li>${renderInline(item, glossaryIndex, ruleReferenceIndex, pagePath)}</li>`).join("")}</ul>
            </div>
          </div>
        `)
        .join("");

      return `
        <section class="rule-subsection" id="section-${escapeHtml(entry.anchor)}" data-scrollspy-section data-scrollspy-label="${escapeAttribute(entry.date)}">
          <div class="scrollspy-sentinel" aria-hidden="true" data-scrollspy-sentinel data-scrollspy-for="section-${escapeHtml(entry.anchor)}"></div>
          <header class="section-header" data-mirrored-heading data-mirrored-heading-for="section-${escapeHtml(entry.anchor)}">
            <h2 data-mirrored-heading-text>${escapeHtml(entry.date)}</h2>
          </header>
          ${categoriesHtml}
        </section>
      `;
    })
    .join("");

  const globalTocHtml = buildChangelogTocHtml(section, rules, pagePath, changelogEntries);

  return `
    <div class="content-layout content-layout--with-sidebar" style="margin-top: 2rem;">
      <article class="panel article-panel">
        <section class="hero hero-compact" id="rule-section-${escapeHtml(section.id)}" data-scrollspy-section data-scrollspy-label="${escapeAttribute(`${section.displayNumber}. ${section.title}`)}">
          <div class="scrollspy-sentinel" aria-hidden="true" data-scrollspy-sentinel data-scrollspy-for="rule-section-${escapeHtml(section.id)}"></div>
          <div class="rule-section-heading rule-section-heading--banner-only" data-mirrored-heading data-mirrored-heading-for="rule-section-${escapeHtml(section.id)}">
            <p class="eyebrow" data-mirrored-heading-chrome>Rule Section ${escapeHtml(section.displayNumber)}</p>
            <h1 data-mirrored-heading-text>${escapeHtml(section.title)}</h1>
          </div>
          <div class="lede rich-text">
            <p>Track material rules changes here. Use <code>C &lt;search term&gt;</code> in search to search changelog entries only.</p>
          </div>
        </section>
        ${changelogSections}
      </article>
      <aside class="panel sidebar-panel">
        ${renderTocContainer({
          title: "Rulebook Contents",
          listHtml: globalTocHtml,
          listClasses: "toc-list global-toc-list"
        })}
      </aside>
    </div>
  `;
}

function renderGlossaryTermPage(term, backlinks, glossaryIndex, ruleReferenceIndex, pagePath) {
  const sortedChildTerms = [...(term.childTerms || [])].sort((left, right) =>
    left.label.localeCompare(right.label, undefined, { sensitivity: "base" })
  );
  const backlinkItems = backlinks
    .map(
      (backlink) => `
        <li>
          <a href="${relativeHref(pagePath, backlink.slug === "00-overview" ? path.join(distDir, "index.html") : path.join(distDir, "rules", `${backlink.slug}.html`))}">${escapeHtml(backlink.label)}</a>
        </li>
      `
    )
    .join("");
  const childItems = sortedChildTerms
    .map((child) => `
      <article class="list-item">
        <div>
          <h2><a href="${relativeHref(pagePath, path.join(distDir, child.url))}">${escapeHtml(child.label)}</a></h2>
          <div class="rich-text">
            ${renderRichText(child.fullDefinition || child.shortDefinition || "", glossaryIndex, ruleReferenceIndex, pagePath)}
          </div>
        </div>
      </article>
    `)
    .join("");
  const childrenSection = childItems
    ? `
        <section class="glossary-children-section" data-scrollspy-section data-scrollspy-label="Terms In This Category">
          <h2>Terms In This Category</h2>
          <section class="panel list-panel">${childItems}</section>
        </section>
      `
    : "";

  return `
    <div class="content-layout content-layout--with-sidebar" style="margin-top: 2rem;">
      <article class="panel article-panel">
        <section class="hero hero-compact">
          <p class="eyebrow">Glossary Term</p>
          <h1 class="glossary-term-heading">${escapeHtml(term.label)}${renderCategoryBadgeStack(term.categoryBadges || [], { variant: "heading", pagePath })}</h1>
          <p class="lede">${escapeHtml(stripMarkdown(term.shortDefinition))}</p>
        </section>
        <section class="glossary-definition-section" data-scrollspy-section data-scrollspy-label="Definition">
          <h2>Definition</h2>
          <div class="rich-text">
            ${renderRichText(term.fullDefinition, glossaryIndex, ruleReferenceIndex, pagePath)}
          </div>
        </section>
        ${childrenSection}
      </article>
      <aside class="panel sidebar-panel">
        <h2>Appears In</h2>
        <ul class="link-list">${backlinkItems || "<li>No rule references yet.</li>"}</ul>
      </aside>
    </div>
  `;
}

function buildRulePageTabBar(section, rules, pagePath) {
  const currentIndex = rules.findIndex((rule) => rule.id === section.id);
  const prevRule = currentIndex > 0 ? rules[currentIndex - 1] : null;
  const nextRule = currentIndex < rules.length - 1 ? rules[currentIndex + 1] : null;

  return {
    previous: buildTabBarLink(
      prevRule ? relativeHref(pagePath, prevRule.slug === "00-overview" ? path.join(distDir, "index.html") : path.join(distDir, "rules", `${prevRule.slug}.html`)) : null,
      prevRule ? `Previous: ${prevRule.title}` : "Previous section unavailable",
      prevRule ? `Previous section: ${prevRule.title}` : "Previous section unavailable"
    ),
    next: buildTabBarLink(
      nextRule ? relativeHref(pagePath, nextRule.slug === "00-overview" ? path.join(distDir, "index.html") : path.join(distDir, "rules", `${nextRule.slug}.html`)) : null,
      nextRule ? `Next: ${nextRule.title}` : "Next section unavailable",
      nextRule ? `Next section: ${nextRule.title}` : "Next section unavailable"
    ),
    toc: {
      enabled: true,
      title: "Table of contents",
      ariaLabel: "Open table of contents",
      controlsId: "toc-overlay"
    }
  };
}

function buildStaticPageTabBar({ hasTocPlaceholder }) {
  return {
    previous: buildTabBarLink(null, "Previous section unavailable", "Previous section unavailable"),
    next: buildTabBarLink(null, "Next section unavailable", "Next section unavailable"),
    toc: {
      enabled: Boolean(hasTocPlaceholder),
      title: hasTocPlaceholder ? "Table of contents" : "Table of contents unavailable",
      ariaLabel: hasTocPlaceholder ? "Open table of contents" : "Table of contents unavailable",
      controlsId: hasTocPlaceholder ? "toc-overlay" : null
    }
  };
}

function buildTabBarLink(href, title, ariaLabel) {
  return {
    href,
    enabled: Boolean(href),
    title,
    ariaLabel
  };
}

function renderRichText(markdown, glossaryIndex, ruleReferenceIndex, pagePath, cardSizingMetrics = null) {
  if (!markdown) {
    return "";
  }

  const lines = markdown.split("\n");
  const chunks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (line.startsWith(":::card-image")) {
      const cardConfigs = [];

      while (index < lines.length && lines[index].startsWith(":::card-image")) {
        const directiveLines = [];
        index += 1;
        while (index < lines.length && lines[index].trim() !== ":::") {
          directiveLines.push(lines[index]);
          index += 1;
        }
        index += 1;
        const config = parseDirectiveConfig(directiveLines);
        if (config.src) {
          cardConfigs.push(config);
        }
        while (index < lines.length && !lines[index].trim()) {
          index += 1;
        }
      }

      const cardRows = chunkCardConfigs(cardConfigs);
      if (cardRows.length > 0) {
        chunks.push(cardRows.map((row) => renderCardRow(row, pagePath, cardSizingMetrics)).join("\n"));
      }
      continue;
    }

    if (line.startsWith("```")) {
      const codeLines = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith("```")) {
        codeLines.push(lines[index]);
        index += 1;
      }
      index += 1;
      chunks.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
      continue;
    }

    if (line.startsWith("> ")) {
      const quoteLines = [];
      while (index < lines.length && lines[index].startsWith("> ")) {
        quoteLines.push(lines[index].replace(/^> /, ""));
        index += 1;
      }
      chunks.push(`<blockquote>${quoteLines.map((quoteLine) => `<p>${renderInline(quoteLine, glossaryIndex, ruleReferenceIndex, pagePath)}</p>`).join("")}</blockquote>`);
      continue;
    }

    const listMarker = parseListMarker(line);
    if (listMarker && listMarker.indent === 0) {
      const { html, nextIndex } = renderList(lines, index, glossaryIndex, ruleReferenceIndex, pagePath, 0);
      index = nextIndex;
      chunks.push(html);
      continue;
    }

    if (/^<!--\s*(DESIGN NOTE|AMBIGUOUS):/.test(line)) {
      const match = line.match(/^<!--\s*(DESIGN NOTE|AMBIGUOUS):\s*(.+)\s*-->$/);
      if (match) {
        const variant = match[1] === "AMBIGUOUS" ? "callout warning" : "callout";
        chunks.push(`<aside class="${variant}"><strong>${escapeHtml(match[1])}:</strong> ${escapeHtml(match[2])}</aside>`);
      }
      index += 1;
      continue;
    }

    const paragraphLines = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !lines[index].startsWith(":::card-image") &&
      !lines[index].startsWith("```") &&
      !lines[index].startsWith("> ") &&
      !(parseListMarker(lines[index]) && parseListMarker(lines[index]).indent === 0) &&
      !/^<!--\s*(DESIGN NOTE|AMBIGUOUS):/.test(lines[index])
    ) {
      paragraphLines.push(lines[index]);
      index += 1;
    }

    chunks.push(`<p>${renderInline(paragraphLines.join(" "), glossaryIndex, ruleReferenceIndex, pagePath)}</p>`);
  }

  return chunks.join("\n");
}

function renderRuleBlocks(blocks, blockScopeId, glossaryIndex, ruleReferenceIndex, pagePath, cardSizingMetrics = null) {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return "";
  }

  return blocks
    .map((block) => renderRuleBlock(block, blockScopeId, glossaryIndex, ruleReferenceIndex, pagePath, cardSizingMetrics))
    .join("\n");
}

function renderRuleBlock(block, blockScopeId, glossaryIndex, ruleReferenceIndex, pagePath, cardSizingMetrics = null) {
  const renderedBlock = block?.type === "list" && Array.isArray(block?.items)
    ? renderStructuredList(block.items, block.ordered, `${blockScopeId || "block"}-${String(block.blockIndex || 0)}`, glossaryIndex, ruleReferenceIndex, pagePath)
    : renderRichText(block?.sourceMarkdown || "", glossaryIndex, ruleReferenceIndex, pagePath, cardSizingMetrics);

  return renderCommentableNode({
    contentHtml: renderedBlock,
    comments: block?.comments || [],
    nodeId: `${blockScopeId || "block"}-${String(block.blockIndex || 0)}`,
    source: block?.source || {},
    rawSourceMarkdown: block?.rawSourceMarkdown || "",
    blockType: block?.type || "block",
    srLabel: `block ${escapeHtml(String(block.blockIndex || ""))}`,
    showAddControl: block?.type !== "list"
  });
}

function renderStructuredList(items, ordered, listScopeId, glossaryIndex, ruleReferenceIndex, pagePath) {
  const tag = ordered ? "ol" : "ul";
  const listItemsHtml = (items || [])
    .map((item, index) => {
      const nestedHtml = (item.nestedLists || [])
        .map((nestedList, nestedIndex) => renderStructuredList(
          nestedList.items || [],
          nestedList.ordered,
          `${listScopeId}-${index + 1}-${nestedIndex + 1}`,
          glossaryIndex,
          ruleReferenceIndex,
          pagePath
        ))
        .join("");

      const contentHtml = renderInline(
        String(item.contentMarkdown || "").split("\n").map((line) => line.trim()).filter(Boolean).join(" "),
        glossaryIndex,
        ruleReferenceIndex,
        pagePath
      );

      return `
        <li class="rule-list-item">
          ${renderCommentableNode({
            contentHtml,
            comments: item.comments || [],
            nodeId: `${listScopeId}-item-${index + 1}`,
            source: item.source || {},
            rawSourceMarkdown: item.rawSourceMarkdown || "",
            blockType: "list-item",
            srLabel: `list item ${index + 1}`,
            extraClassName: "rule-commented-block--list-item"
          })}
          ${nestedHtml}
        </li>
      `;
    })
    .join("");

  return `<${tag}>${listItemsHtml}</${tag}>`;
}

function renderCommentableNode({ contentHtml, comments = [], nodeId, source, rawSourceMarkdown, blockType, srLabel, extraClassName = "", showAddControl = true }) {
  const safeComments = Array.isArray(comments) ? comments.filter((comment) => comment && typeof comment === "object" && comment.text) : [];
  const blockId = escapeAttribute(nodeId);
  const composerId = `${blockId}-composer`;
  const commentsHtml = safeComments.map((comment, index) => `
    <div
      class="rule-comment-entry"
      data-rule-comment-entry
      data-comment-index="${escapeAttribute(String(index))}"
      data-comment-start-offset="${escapeAttribute(String(comment.source?.startOffset ?? ""))}"
      data-comment-end-offset="${escapeAttribute(String(comment.source?.endOffset ?? ""))}"
    >
      <div class="rule-comment__meta">
        <p class="rule-comment__label">Comment</p>
        <button type="button" class="rule-comment-edit" data-rule-comment-edit>Edit</button>
      </div>
      <p data-rule-comment-text>${escapeHtml(comment.text)}</p>
    </div>
  `).join("");
  const sourceMetadataAttributes = renderSourceMetadataAttributes(source || {}, rawSourceMarkdown);
  const hasComments = safeComments.length > 0;
  const className = [
    "rule-commented-block",
    (showAddControl || hasComments) ? "rule-commented-block--with-sidebar" : "",
    showAddControl ? "rule-commented-block--commentable" : "",
    extraClassName
  ].filter(Boolean).join(" ");

  return `
    <div class="${escapeAttribute(className)}" data-rule-commented-block data-block-type="${escapeAttribute(blockType || "block")}"${hasComments ? ' data-has-comments="true"' : ""}${showAddControl ? ' data-can-add-comment="true"' : ""}${sourceMetadataAttributes}>
      <div class="rule-commented-block__content">
        ${contentHtml}
      </div>
      ${showAddControl ? `
      <button
        type="button"
        class="rule-comment-add-hitarea"
        data-rule-comment-add
        aria-expanded="false"
        aria-controls="${composerId}"
        title="Add author comment"
      >
        <span class="sr-only">Add author comment for ${srLabel}</span>
      </button>
      ` : ""}
      <aside class="rule-comment" data-rule-comment hidden>
        ${commentsHtml}
      </aside>
      <form class="rule-comment-composer" id="${composerId}" data-rule-comment-composer hidden>
        <textarea id="${composerId}-input" class="rule-comment-composer__input" data-rule-comment-input rows="1" maxlength="500" placeholder="Add an author comment"></textarea>
        <p class="rule-comment-composer__note" data-rule-comment-note hidden></p>
        <div class="rule-comment-composer__actions">
          <button type="submit" class="rule-comment-composer__button rule-comment-composer__button--primary" data-rule-comment-save>Save</button>
        </div>
      </form>
    </div>
  `;
}

function renderSourceMetadataAttributes(source, rawSourceMarkdown) {
  if (!source || typeof source !== "object") {
    return "";
  }

  const attributes = {
    "data-source-file": source.filePath || "",
    "data-source-file-name": source.fileName || "",
    "data-source-scope": source.scope || "",
    "data-source-start-offset": source.startOffset ?? "",
    "data-source-end-offset": source.endOffset ?? "",
    "data-source-insert-offset": source.insertOffset ?? "",
    "data-source-target-type": source.targetType || "block",
    "data-source-comment-indent": source.commentIndent ?? 0,
    "data-source-raw-markdown": rawSourceMarkdown || ""
  };

  return Object.entries(attributes)
    .map(([name, value]) => ` ${name}="${escapeAttribute(String(value))}"`)
    .join("");
}

function renderList(lines, startIndex, glossaryIndex, ruleReferenceIndex, pagePath, indent) {
  const firstMarker = parseListMarker(lines[startIndex]);
  const tag = firstMarker?.ordered ? "ol" : "ul";
  const items = [];
  let index = startIndex;

  while (index < lines.length) {
    const marker = parseListMarker(lines[index]);
    if (!marker || marker.indent !== indent || marker.ordered !== firstMarker?.ordered) {
      break;
    }

    const itemLines = [marker.content];
    const nestedParts = [];
    index += 1;

    while (index < lines.length) {
      const currentLine = lines[index];
      const currentMarker = parseListMarker(currentLine);

      if (!currentLine.trim()) {
        break;
      }

      if (currentMarker) {
        if (currentMarker.indent === indent && currentMarker.ordered === marker.ordered) {
          break;
        }

        if (currentMarker.indent > indent) {
          const nestedList = renderList(
            lines,
            index,
            glossaryIndex,
            ruleReferenceIndex,
            pagePath,
            currentMarker.indent
          );
          nestedParts.push(nestedList.html);
          index = nestedList.nextIndex;
          continue;
        }

        break;
      }

      if (
        currentLine.startsWith(":::card-image") ||
        currentLine.startsWith("```") ||
        currentLine.startsWith("> ") ||
        /^<!--\s*(DESIGN NOTE|AMBIGUOUS):/.test(currentLine)
      ) {
        break;
      }

      if (!shouldTreatAsListItemContinuation(itemLines, currentLine)) {
        break;
      }

      itemLines.push(currentLine.trim());
      index += 1;
    }

    const content = renderInline(itemLines.join(" "), glossaryIndex, ruleReferenceIndex, pagePath);
    items.push(`<li>${content}${nestedParts.length ? nestedParts.join("") : ""}</li>`);

    while (index < lines.length && !lines[index].trim()) {
      index += 1;
    }
  }

  return {
    html: `<${tag}>${items.join("")}</${tag}>`,
    nextIndex: index
  };
}

function parseListMarker(line) {
  const match = line.match(/^(\s*)(\d+\.|-)\s+(.+)$/);
  if (!match) {
    return null;
  }

  return {
    indent: match[1].length,
    ordered: match[2] !== "-",
    content: match[3].trim()
  };
}

function shouldTreatAsListItemContinuation(itemLines, currentLine) {
  const previousLine = String(itemLines[itemLines.length - 1] || "").trim();
  const trimmedCurrentLine = String(currentLine || "").trim();

  if (!previousLine || !trimmedCurrentLine) {
    return false;
  }

  return /^[^:]+:\s+/.test(previousLine);
}

function renderInline(text, glossaryIndex, ruleReferenceIndex, pagePath) {
  const placeholders = [];
  let working = text;

  working = working.replace(/\[\[([a-z0-9-]+)\|([^[\]]+)\]\]/g, (_, termId, label) => {
    const term = glossaryIndex.get(termId);
    if (!term) {
      return label;
    }
    const href = relativeHref(pagePath, path.join(distDir, "glossary", `${term.id}.html`));
    return createPlaceholder(
      placeholders,
      `<a class="glossary-ref" href="${href}" data-term="${escapeAttribute(term.label)}" data-definition="${escapeAttribute(stripMarkdown(term.shortDefinition))}" data-category-badges="${escapeAttribute(JSON.stringify(term.categoryBadges || []))}" data-child-terms="${escapeAttribute(JSON.stringify(term.childTerms || []))}">${escapeHtml(label)}</a>${renderCategoryBadgeStack(term.categoryBadges || [], { variant: "inline", pagePath })}`
    );
  });

  working = working.replace(/\[\[summary:([a-z0-9-]+)\]\]/g, (_, termId) => {
    const term = glossaryIndex.get(termId);
    if (!term) {
      return termId;
    }
    const summary = term.summary || term.shortDefinition || "";
    return createPlaceholder(
      placeholders,
      renderInline(summary, glossaryIndex, ruleReferenceIndex, pagePath)
    );
  });

  working = working.replace(/\[\[section:([^[\]|]+)(?:\|([^[\]]+))?\]\]/g, (_, reference, label) => {
    const target = resolveRuleReferenceByTitle(reference, ruleReferenceIndex);
    const resolvedLabel = label || getRuleReferenceLabel(target) || reference;
    if (!target) {
      return resolvedLabel;
    }
    return createPlaceholder(
      placeholders,
      renderRuleReferenceLink(target, resolvedLabel, pagePath)
    );
  });

  working = working.replace(/`([^`]+)`/g, (_, code) => {
    const token = createPlaceholder(placeholders, `<code>${escapeHtml(code)}</code>`);
    return token;
  });

  working = working.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
    const token = createPlaceholder(placeholders, `<a href="${escapeAttribute(url)}">${escapeHtml(label)}</a>`);
    return token;
  });

  working = working.replace(/\*\*([^*]+)\*\*/g, (_, inner) => {
    const token = createPlaceholder(placeholders, `<strong>${renderInline(inner, glossaryIndex, ruleReferenceIndex, pagePath)}</strong>`);
    return token;
  });

  let escaped = escapeHtml(working);
  escaped = escaped.replace(/§(\d+(?:\.\d+)?)/g, (_, sectionId) => {
    const target = resolveRuleReferenceByNumber(sectionId, ruleReferenceIndex);
    if (!target) {
      return `§${sectionId}`;
    }
    return renderRuleReferenceLink(target, `§${sectionId}`, pagePath);
  });

  for (const placeholder of placeholders) {
    escaped = escaped.replace(placeholder.token, placeholder.html);
  }

  return escaped;
}

function stripMarkdown(text) {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/:::card-image[\s\S]*?:::/g, " ")
    .replace(/<!--\s*COMMENT:\s*.+?\s*-->/g, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\[\[section:([^[\]|]+)(?:\|([^[\]]+))?\]\]/g, (_, reference, label) => label || reference)
    .replace(/\[\[([a-z0-9-]+)\|([^[\]]+)\]\]/g, "$2")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`>#-]/g, " ")
    .replace(/\s+([.,!?;:])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function parseChangelogEntries(markdown) {
  const lines = markdown.split("\n");
  const entries = [];
  let currentEntry = null;
  let currentCategory = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const dateMatch = line.match(/^##\s+(.+)\s*$/);
    const categoryMatch = line.match(/^###\s+(.+)\s*$/);
    const itemMatch = line.match(/^-\s+(.+)\s*$/);

    if (dateMatch) {
      currentEntry = {
        date: dateMatch[1].trim(),
        anchor: slugifyFragment(`changelog-${dateMatch[1].trim()}`),
        categories: []
      };
      entries.push(currentEntry);
      currentCategory = null;
      continue;
    }

    if (!currentEntry) {
      continue;
    }

    if (categoryMatch) {
      currentCategory = {
        title: normalizeChangelogCategory(categoryMatch[1]),
        items: []
      };
      currentEntry.categories.push(currentCategory);
      continue;
    }

    if (itemMatch) {
      if (!currentCategory) {
        currentCategory = {
          title: "Changed",
          items: []
        };
        currentEntry.categories.push(currentCategory);
      }

      const itemLines = [itemMatch[1].trim()];
      while (index + 1 < lines.length && /^\s{2,}\S/.test(lines[index + 1])) {
        index += 1;
        itemLines.push(lines[index].trim());
      }
      currentCategory.items.push(itemLines.join(" "));
    }
  }

  return entries;
}

function annotateChangelogEntries(entries, surfaceIndex) {
  return entries.map((entry) => ({
    ...entry,
    categories: entry.categories.map((category) => ({
      ...category,
      items: category.items.map((item) => annotateMarkdownText(item, surfaceIndex))
    }))
  }));
}

function normalizeChangelogCategory(value) {
  const normalized = value.trim().toLowerCase();
  switch (normalized) {
    case "added":
      return "Added";
    case "changed":
      return "Changed";
    case "removed":
      return "Removed";
    case "fixed":
      return "Fixed";
    default:
      return value.trim();
  }
}

function slugifyFragment(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function annotateMarkdownText(text, surfaceIndex) {
  if (!text) {
    return "";
  }

  let working = annotateBoldGlossaryTerms(text, surfaceIndex);
  const placeholders = [];

  working = protectAnnotationPattern(working, /```[\s\S]*?```/g, placeholders);
  working = protectAnnotationPattern(working, /<!--[\s\S]*?-->/g, placeholders);
  working = protectAnnotationPattern(working, /\[\[(?:section:[^[\]]+|[a-z0-9-]+\|[^[\]]+)\]\]/g, placeholders);

  let annotatedLine = working;
  annotatedLine = protectAnnotationPattern(annotatedLine, /`[^`]+`/g, placeholders);
  annotatedLine = protectAnnotationPattern(annotatedLine, /\[[^\]]+\]\([^)]+\)/g, placeholders);

  return restoreAnnotationPlaceholders(annotatePlainText(annotatedLine, surfaceIndex), placeholders);
}

function annotateBoldGlossaryTerms(text, surfaceIndex) {
  return text.replace(/\*\*([^*\n]+)\*\*/g, (match, label) => {
    const termId = surfaceIndex.surfaceToId.get(normalizeSurface(label));
    if (!termId) {
      return match;
    }
    return `[[${termId}|${formatGlossaryDisplayLabel(surfaceIndex.idToLabel.get(termId), label)}]]`;
  });
}

function annotatePlainText(text, surfaceIndex) {
  if (!surfaceIndex.surfaceRegex) {
    return text;
  }

  const lineRegex = new RegExp(surfaceIndex.surfaceRegex.source, surfaceIndex.surfaceRegex.flags);
  const matches = [...text.matchAll(lineRegex)];
  if (matches.length === 0) {
    return text;
  }

  let annotated = "";
  let cursor = 0;

  for (const match of matches) {
    const [surface] = match;
    const start = match.index ?? 0;
    const end = start + surface.length;
    const termId = surfaceIndex.surfaceToId.get(normalizeSurface(surface));
    annotated += text.slice(cursor, start);

    if (!termId) {
      annotated += surface;
    } else {
      annotated += `[[${termId}|${formatGlossaryDisplayLabel(surfaceIndex.idToLabel.get(termId), surface)}]]`;
    }
    cursor = end;
  }

  annotated += text.slice(cursor);
  return annotated;
}

function protectAnnotationPattern(text, pattern, placeholders) {
  return text.replace(pattern, (match) => createAnnotationPlaceholder(placeholders, match));
}

function restoreAnnotationPlaceholders(text, placeholders) {
  let restored = text;
  for (const placeholder of placeholders) {
    restored = restored.replaceAll(placeholder.token, placeholder.value);
  }
  return restored;
}

function createAnnotationPlaceholder(placeholders, value) {
  const token = `@@ANNOTATION_PLACEHOLDER_${placeholders.length}@@`;
  placeholders.push({ token, value });
  return token;
}

function buildSurfaceIndex(glossary) {
  const surfaceToId = new Map();
  const idToLabel = new Map(glossary.map((term) => [term.id, term.label]));
  const surfaces = [];

  for (const term of glossary) {
    for (const surface of buildSurfaces(term.label)) {
      const normalizedSurface = normalizeSurface(surface);
      if (!surfaceToId.has(normalizedSurface)) {
        surfaceToId.set(normalizedSurface, term.id);
      }
      surfaces.push(surface);
    }
  }

  const uniqueAlternatives = [...new Set(surfaces.map((surface) => escapeRegex(surface)))]
    .sort((left, right) => right.length - left.length);

  const surfaceRegex = uniqueAlternatives.length
    ? new RegExp(`(?<![A-Za-z0-9])(${uniqueAlternatives.join("|")})(?![A-Za-z0-9])`, "gi")
    : null;

  return {
    idToLabel,
    surfaceToId,
    surfaceRegex
  };
}

function formatGlossaryDisplayLabel(termLabel, matchedText) {
  const normalizedMatch = normalizeSurface(matchedText);
  const normalizedSingular = normalizeSurface(termLabel);
  const pluralLabel = pluralizeLabel(termLabel);
  const normalizedPlural = normalizeSurface(pluralLabel);

  if (normalizedMatch === `${normalizedSingular}'s`) {
    return `${termLabel}'s`;
  }
  if (normalizedMatch === normalizedPlural) {
    return pluralLabel;
  }
  if (normalizedMatch === `${normalizedPlural}'s`) {
    return `${pluralLabel}'s`;
  }
  return termLabel;
}

function buildSurfaces(label) {
  const canonical = label.trim();
  const lower = canonical.toLowerCase();
  const plural = pluralizeLabel(canonical);
  const pluralLower = plural.toLowerCase();

  return new Set([
    canonical,
    lower,
    `${canonical}'s`,
    `${lower}'s`,
    plural,
    pluralLower,
    `${plural}'s`,
    `${pluralLower}'s`
  ]);
}

function pluralizeLabel(label) {
  const words = label.split(" ");
  const lastWord = words[words.length - 1];
  const pluralLastWord = pluralizeWord(lastWord);
  return [...words.slice(0, -1), pluralLastWord].join(" ");
}

function pluralizeWord(word) {
  if (/[^aeiou]y$/i.test(word)) {
    return `${word.slice(0, -1)}ies`;
  }
  if (/(s|x|z|ch|sh)$/i.test(word)) {
    return `${word}es`;
  }
  if (/o$/i.test(word)) {
    return `${word}es`;
  }
  return `${word}s`;
}

function normalizeSurface(value) {
  return value.trim().toLowerCase();
}

function parseDirectiveConfig(lines) {
  const config = {};
  for (const line of lines) {
    const match = line.match(/^\s*([a-z-]+)\s*:\s*(.+)\s*$/i);
    if (!match) {
      continue;
    }
    config[match[1].toLowerCase()] = match[2].trim();
  }
  return config;
}

function renderCardRow(cardConfigs, pagePath, cardSizingMetrics) {
  const widthFactors = cardConfigs.map((config) => getCardWidthFactor(config.aspect || "3 / 4.2"));
  const rowFactor = widthFactors.reduce((sum, factor) => sum + factor, 0);
  const pageMaxRowFactor = cardSizingMetrics?.widestRowFactor ?? rowFactor;
  const rowGapCount = Math.max(cardConfigs.length - 1, 0);
  const rowMaxWidthPx = widthFactors.reduce((sum, factor) => sum + (factor * 210), 0) + (rowGapCount * 16);
  const gridTemplateColumns = widthFactors.map((factor) => `minmax(0, ${formatNumber(factor)}fr)`).join(" ");
  const responsiveRowWidth = `calc((((100% - (var(--card-row-gap) * var(--card-max-row-gap-count))) / var(--card-max-row-factor)) * ${formatNumber(rowFactor)}) + (var(--card-row-gap) * ${rowGapCount}))`;
  const rowStyle = [
    `width:min(${formatNumber(rowMaxWidthPx)}px, ${responsiveRowWidth})`,
    `grid-template-columns:${gridTemplateColumns}`
  ].join(";");

  return `<div class="card-showcase-row" style="${rowStyle}">${cardConfigs.map((config) => renderCardImageBlock(config, pagePath)).join("")}</div>`;
}

function renderCardImageBlock(config, pagePath) {
  const src = config.src || "";
  const alt = config.alt || config.title || "Card image";
  const title = config.title || "";
  const caption = config.caption || "";
  const tone = config.tone ? ` data-card-tone="${escapeAttribute(config.tone)}"` : "";
  const orientation = ` data-card-orientation="${escapeAttribute(getAspectOrientation(config.aspect || "3 / 4.2"))}"`;
  const aspect = normalizeAspect(config.aspect || "3 / 4.2");
  const cardStyle = ` style="--card-aspect:${escapeAttribute(aspect)}"`;
  const href = resolveCardImageSrc(src, pagePath);

  return `
    <figure class="card-showcase">
      <div class="holo-card"${tone}${orientation}${cardStyle} tabindex="0">
        <div class="holo-card-frame">
          <img src="${href}" alt="${escapeAttribute(alt)}" loading="lazy">
          <div class="holo-layer holo-rainbow" aria-hidden="true"></div>
          <div class="holo-layer holo-gloss" aria-hidden="true"></div>
          <div class="holo-layer holo-sparkle" aria-hidden="true"></div>
        </div>
      </div>
      ${title || caption ? `<figcaption class="card-showcase-caption">${title ? `<strong>${escapeHtml(title)}</strong>` : ""}${caption ? `${title ? " " : ""}${escapeHtml(caption)}` : ""}</figcaption>` : ""}
    </figure>
  `;
}

function extractGlossaryTokenIds(text) {
  return [...text.matchAll(/\[\[([a-z0-9-]+)\|([^[\]]+)\]\]/g)].map((match) => match[1]);
}

function layout({ title, body, pagePath, floatingTabBar, tocOverlay = "" }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="${relativeHref(pagePath, path.join(distDir, "assets", "styles.css"))}">
    <script src="https://cdn.jsdelivr.net/npm/fuse.js@7.0.0"></script>
    <script src="https://cdn.jsdelivr.net/npm/@floating-ui/core@1.6.0"></script>
    <script src="https://cdn.jsdelivr.net/npm/@floating-ui/dom@1.6.3"></script>
    <script defer src="${relativeHref(pagePath, path.join(distDir, "assets", "search-index.js"))}"></script>
    <script type="module" src="${relativeHref(pagePath, path.join(distDir, "assets", "app.js"))}"></script>
  </head>
  <body>
    <div class="page-shell">
      <div class="sticky-section-banner" data-sticky-section-banner hidden aria-live="polite" aria-atomic="true">
        <div class="sticky-section-banner__inner">
          <span class="sticky-section-banner__eyebrow">Current section</span>
          <span class="sticky-section-banner__label" data-sticky-section-label></span>
        </div>
      </div>
      <main class="page-content">
        ${body}
      </main>
    </div>
    ${renderFloatingTabBar(floatingTabBar)}
    
    <!-- Search Modal -->
    <div class="search-modal-backdrop" id="search-modal" hidden>
      <div class="search-modal" role="dialog" aria-modal="true" aria-label="Search">
        <div class="search-header">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="search-icon-input"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          <input type="text" id="search-input" placeholder="Search rules, terms, keywords... or C term" autocomplete="off">
          <button id="search-close" class="icon-button" aria-label="Close search" title="Close (Esc)">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        <div class="search-results-container">
          <div id="search-results" class="search-results"></div>
          <div id="search-empty" class="search-empty-state" hidden>No results found for "<span id="search-query-display"></span>"</div>
        </div>
      </div>
    </div>
    
    <div class="tooltip" id="glossary-tooltip" role="tooltip" hidden></div>
    ${tocOverlay}
    
    <!-- Bottom Sheet -->
    <div class="bottom-sheet-backdrop" id="bottom-sheet-backdrop" hidden>
      <div class="bottom-sheet" id="bottom-sheet" role="dialog" aria-modal="true">
        <div class="bottom-sheet-header">
          <div class="bottom-sheet-handle"></div>
          <h2 id="bottom-sheet-title">Term</h2>
          <button id="bottom-sheet-close" class="icon-button" aria-label="Close">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        <div class="bottom-sheet-content" id="bottom-sheet-content"></div>
        <div class="bottom-sheet-footer">
          <a id="bottom-sheet-link" href="#" class="primary-button">View Full Details</a>
        </div>
      </div>
    </div>
  </body>
</html>
`;
}

function renderFloatingTabBar(config) {
  const previousControl = renderTabBarNavControl({
    ...config.previous,
    direction: "previous",
    icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"></path></svg>`,
    label: "Previous section"
  });
  const nextControl = renderTabBarNavControl({
    ...config.next,
    direction: "next",
    icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"></path></svg>`,
    label: "Next section"
  });
  const searchControl = renderTabBarButton({
    classes: "floating-tab-button floating-tab-button-search",
    title: "Search",
    ariaLabel: "Open search",
    disabled: false,
    dataAttributes: 'data-search-trigger="true"',
    icon: `<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><line x1="20" y1="20" x2="16.65" y2="16.65"></line></svg>`,
    label: "Search"
  });
  const commentsControl = renderTabBarButton({
    classes: "floating-tab-button floating-tab-button-comments",
    title: "Toggle comments",
    ariaLabel: "Toggle author comments",
    disabled: false,
    dataAttributes: 'data-comments-mode-trigger="true" aria-pressed="false"',
    icon: `<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`,
    label: "Comments"
  });

  return `
    <nav class="floating-tab-bar-shell" aria-label="Page actions">
      <div class="floating-tab-bar" data-floating-tab-bar="true">
        ${previousControl}
        ${nextControl}
        <span class="floating-tab-divider" aria-hidden="true"></span>
        ${searchControl}
        ${commentsControl}
      </div>
    </nav>
  `;
}

function renderTabBarNavControl({ href, enabled, title, ariaLabel, direction, icon, label }) {
  if (enabled) {
    return `
      <a
        href="${href}"
        class="floating-tab-button floating-tab-button-nav floating-tab-button-${direction}"
        title="${escapeAttribute(title)}"
        aria-label="${escapeAttribute(ariaLabel)}"
      >
        ${icon}
        <span class="sr-only">${escapeHtml(label)}</span>
        <span class="floating-tab-hover-label" aria-hidden="true">${escapeHtml(title)}</span>
      </a>
    `;
  }

  return renderTabBarButton({
    classes: `floating-tab-button floating-tab-button-nav floating-tab-button-${direction}`,
    title,
    ariaLabel,
    disabled: true,
    dataAttributes: "",
    icon,
    label
  });
}

function renderTabBarButton({ classes, title, ariaLabel, disabled, dataAttributes, icon, label }) {
  return `
    <button
      type="button"
      class="${classes}"
      title="${escapeAttribute(title)}"
      aria-label="${escapeAttribute(ariaLabel)}"
      ${disabled ? 'disabled aria-disabled="true"' : ""}
      ${dataAttributes}
    >
      ${icon}
      <span class="sr-only">${escapeHtml(label)}</span>
    </button>
  `;
}

function renderCategoryBadgeStack(categoryBadges, { variant = "inline", pagePath } = {}) {
  if (!Array.isArray(categoryBadges) || categoryBadges.length === 0) {
    return "";
  }

  const className = `category-badge-stack category-badge-stack--${variant}`;
  const badges = categoryBadges
    .map((category) => {
      const iconKind = getBadgeIconKind(category);
      const badgeClassName = iconKind
        ? "category-badge category-badge--icon category-badge-link glossary-ref"
        : "category-badge category-badge-link glossary-ref";
      const styleDeclarations = [];
      if (iconKind) {
        styleDeclarations.push(`--category-badge-icon-url: url('${escapeAttribute(relativeHref(pagePath, path.join(distDir, "assets", "badges", getBadgeIconAssetFilename(iconKind, variant))))}')`);
      }
      if (category.badgeColor) {
        styleDeclarations.push(`--category-badge-bg: ${escapeAttribute(category.badgeColor)}`);
      }
      const badgeStyle = styleDeclarations.length > 0
        ? ` style="${styleDeclarations.join("; ")}"`
        : "";
      const badgeDataIcon = iconKind ? ` data-badge-icon="${escapeAttribute(iconKind)}"` : "";
      return `
      <a
        class="${badgeClassName}"
        href="${escapeAttribute(relativeHref(pagePath, path.join(distDir, category.url)))}"
        aria-label="${escapeAttribute(category.label)}"
        title="${escapeAttribute(category.label)}"
        data-term="${escapeAttribute(category.label)}"
        data-definition="${escapeAttribute(stripMarkdown(category.shortDefinition || ""))}"
        data-category-badges="${escapeAttribute(JSON.stringify(category.categoryBadges || []))}"
        data-child-terms="${escapeAttribute(JSON.stringify(category.childTerms || []))}"
        ${badgeDataIcon}
        ${badgeStyle}
      >
        ${renderCategoryBadgeGlyph(category, { pagePath, variant })}
      </a>
    `;
    })
    .join("");

  return `<span class="${className}">${badges}</span>`;
}

function renderCategoryBadgeGlyph(category, { pagePath, variant = "inline" } = {}) {
  const iconKind = getBadgeIconKind(category);
  if (iconKind) {
    return `<span class="category-badge__content category-badge__content--icon" aria-hidden="true"><span class="category-badge__glyph category-badge__glyph--meta" aria-hidden="true">${escapeHtml(iconKind)}</span></span>`;
  }

  return `<span class="category-badge__content" aria-hidden="true"><span class="category-badge__glyph category-badge__glyph--text" aria-hidden="true">${escapeHtml(category.badge || "")}</span></span>`;
}

async function generateBadgeRasterAssets(badgeIconManifest) {
  const rasterScale = 4;
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 128, height: 128 },
    deviceScaleFactor: 1
  });

  try {
    for (const iconKind of badgeIconManifest.keys()) {
      for (const variant of BADGE_ICON_VARIANTS) {
        const assetSize = getBadgeIconAssetSize(variant);
        const contentSize = getBadgeIconContentSize(variant);
        const verticalInset = BADGE_ICON_VERTICAL_INSET_BY_VARIANT[variant] ?? BADGE_ICON_VERTICAL_INSET_BY_VARIANT.inline;
        const rasterAssetSize = assetSize * rasterScale;
        const rasterContentSize = contentSize * rasterScale;
        const markup = badgeIconManifest.get(iconKind)?.svgMarkup;
        if (!markup) {
          throw new Error(`Missing badge icon markup for ${iconKind}`);
        }
        const baseMarkup = renderBadgeRasterDocument({
          frameSize: rasterAssetSize,
          contentSize: rasterContentSize,
          svgMarkup: markup
        });
        await page.setContent(baseMarkup);

        const paintedBounds = await page.evaluate(() => {
          const svg = document.querySelector(".badge-raster-svg");
          if (!(svg instanceof SVGElement)) return null;
          const svgRect = svg.getBoundingClientRect();
          const drawableNodes = [
            ...svg.querySelectorAll("path, rect, circle, ellipse, line, polyline, polygon, text, use, image")
          ];

          let left = Number.POSITIVE_INFINITY;
          let top = Number.POSITIVE_INFINITY;
          let right = Number.NEGATIVE_INFINITY;
          let bottom = Number.NEGATIVE_INFINITY;

          drawableNodes.forEach((node) => {
            if (!(node instanceof SVGGraphicsElement)) return;
            const rect = node.getBoundingClientRect();
            if (!rect.width && !rect.height) return;
            left = Math.min(left, rect.left - svgRect.left);
            top = Math.min(top, rect.top - svgRect.top);
            right = Math.max(right, rect.right - svgRect.left);
            bottom = Math.max(bottom, rect.bottom - svgRect.top);
          });

          if (!Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(right) || !Number.isFinite(bottom)) {
            return null;
          }

          return {
            left,
            top,
            width: right - left,
            height: bottom - top
          };
        });

        if (!paintedBounds || paintedBounds.height <= 0 || paintedBounds.width <= 0) {
          throw new Error(`Unable to measure painted bounds for badge icon ${iconKind}/${variant}`);
        }

        const targetInset = verticalInset * rasterScale;
        const targetHeight = rasterContentSize - (targetInset * 2);
        const scale = targetHeight / paintedBounds.height;
        const translateX = (rasterContentSize / 2) - ((paintedBounds.left + (paintedBounds.width / 2)) * scale);
        const translateY = targetInset - (paintedBounds.top * scale);

        await page.setContent(renderBadgeRasterDocument({
          frameSize: rasterAssetSize,
          contentSize: rasterContentSize,
          svgMarkup: markup,
          transform: {
            scale,
            translateX,
            translateY
          }
        }));

        const bbox = await page.locator(".badge-raster-frame").boundingBox();
        if (!bbox) {
          throw new Error(`Unable to measure badge raster frame for ${iconKind}/${variant}`);
        }
        const pngBytes = await page.screenshot({
          omitBackground: true,
          clip: {
            x: Math.floor(bbox.x),
            y: Math.floor(bbox.y),
            width: Math.ceil(bbox.width),
            height: Math.ceil(bbox.height)
          }
        });
        await fs.writeFile(
          path.join(distDir, "assets", "badges", getBadgeIconAssetFilename(iconKind, variant)),
          pngBytes
        );
      }
    }
  } finally {
    await page.close();
    await browser.close();
  }
}

function renderBadgeRasterDocument({
  frameSize,
  contentSize,
  svgMarkup,
  transform = null
}) {
  const transformStyle = transform
    ? `transform: translate(${transform.translateX}px, ${transform.translateY}px) scale(${transform.scale});`
    : "";

  return `
          <!doctype html>
          <html>
            <head>
              <style>
                html, body {
                  margin: 0;
                  padding: 0;
                  background: transparent;
                }
                .badge-raster-frame {
                  inline-size: ${frameSize}px;
                  block-size: ${frameSize}px;
                  display: grid;
                  place-items: center;
                }
                .badge-raster-content {
                  inline-size: ${contentSize}px;
                  block-size: ${contentSize}px;
                  display: grid;
                  place-items: center;
                  overflow: visible;
                }
                .badge-raster-svg {
                  inline-size: ${contentSize}px;
                  block-size: ${contentSize}px;
                  display: block;
                  color: white;
                  transform-origin: 0 0;
                  ${transformStyle}
                }
                .badge-raster-svg,
                .badge-raster-svg * {
                  color: white;
                }
              </style>
            </head>
            <body>
              <div class="badge-raster-frame"><div class="badge-raster-content">${svgMarkup}</div></div>
            </body>
          </html>
        `;
}

function countLinkedTerms(termUsage) {
  let count = 0;
  for (const backlinks of termUsage.values()) {
    if (backlinks.length > 0) {
      count += 1;
    }
  }
  return count;
}

function createPlaceholder(placeholders, html) {
  const token = `__PLACEHOLDER_${placeholders.length}__`;
  placeholders.push({ token, html });
  return token;
}

function normalizeRuleReference(value) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function resolveRuleReferenceByTitle(reference, ruleReferenceIndex) {
  if (!ruleReferenceIndex) return null;
  return ruleReferenceIndex.byTitlePath.get(normalizeRuleReference(reference)) || null;
}

function resolveRuleReferenceByNumber(reference, ruleReferenceIndex) {
  if (!ruleReferenceIndex) return null;
  if (reference.includes(".")) {
    return ruleReferenceIndex.bySubsectionId.get(reference) || null;
  }
  return ruleReferenceIndex.byDisplayNumber.get(reference) || null;
}

function getRuleReferenceLabel(target) {
  if (!target) return "";
  return target.subsection ? `§${target.subsection.id}` : `§${target.section.displayNumber}`;
}

function getRuleReferenceTitle(target) {
  if (!target) return "";
  return target.subsection
    ? `Section §${target.subsection.id}`
    : `Section §${target.section.displayNumber}`;
}

function getRuleReferenceDescription(target) {
  if (!target) return "";
  return target.subsection
    ? `${target.section.title} - ${target.subsection.title}`
    : target.section.title;
}

function getRuleReferenceHref(target, pagePath) {
  const targetPath = target.section.slug === "00-overview"
    ? path.join(distDir, "index.html")
    : path.join(distDir, "rules", `${target.section.slug}.html`);
  const href = relativeHref(pagePath, targetPath);
  if (!target.subsection) {
    return href;
  }
  return `${href}#section-${target.subsection.id.replace(/\./g, "-")}`;
}

function renderRuleReferenceLink(target, label, pagePath) {
  return `<a class="section-ref" href="${getRuleReferenceHref(target, pagePath)}" data-term="${escapeAttribute(getRuleReferenceTitle(target))}" data-definition="${escapeAttribute(getRuleReferenceDescription(target))}">${escapeHtml(label)}</a>`;
}

function relativeHref(fromPath, toPath) {
  return path.relative(path.dirname(fromPath), toPath).split(path.sep).join("/");
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function copyAsset(fileName) {
  const sourcePath = path.join(assetsSourceDir, fileName);
  const targetPath = path.join(distDir, "assets", fileName);
  const contents = await fs.readFile(sourcePath, "utf8");
  await fs.writeFile(targetPath, contents, "utf8");
}

async function copyDirectoryIfExists(sourceDir, targetDir) {
  try {
    await fs.access(sourceDir);
  } catch {
    return;
  }

  await fs.mkdir(targetDir, { recursive: true });
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  await Promise.all(entries.map(async (entry) => {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      await copyDirectoryIfExists(sourcePath, targetPath);
      return;
    }
    await fs.copyFile(sourcePath, targetPath);
  }));
}

function getMimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  switch (extension) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".avif":
      return "image/avif";
    case ".svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}

function resolveCardImageSrc(src, pagePath) {
  if (!src) {
    return "";
  }

  const filePath = path.join(assetsSourceDir, src);
  if (fsSync.existsSync(filePath)) {
    const buffer = fsSync.readFileSync(filePath);
    return `data:${getMimeType(filePath)};base64,${buffer.toString("base64")}`;
  }

  return relativeHref(pagePath, path.join(distDir, "assets", src));
}

function normalizeRotation(value) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "left" || normalized === "-90" || normalized === "-90deg") {
    return "-90deg";
  }
  if (normalized === "right" || normalized === "90" || normalized === "90deg") {
    return "90deg";
  }
  if (normalized === "180" || normalized === "180deg" || normalized === "flip") {
    return "180deg";
  }
  return "0deg";
}

function normalizeAspect(value) {
  const normalized = value.trim().replace(/\s+/g, "");
  if (/^\d+(\.\d+)?\/\d+(\.\d+)?$/.test(normalized)) {
    return normalized.replace("/", " / ");
  }
  if (/^\d+(\.\d+)?:\d+(\.\d+)?$/.test(normalized)) {
    return normalized.replace(":", " / ");
  }
  return "3 / 4.2";
}

function parseAspectRatio(value) {
  const normalized = normalizeAspect(value);
  const parts = normalized.split("/").map((part) => Number(part.trim()));
  if (parts.length !== 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1]) || parts[0] <= 0 || parts[1] <= 0) {
    return null;
  }
  return {
    width: parts[0],
    height: parts[1],
    ratio: parts[0] / parts[1]
  };
}

function getCardWidthFactor(value) {
  const parsed = parseAspectRatio(value);
  if (!parsed) {
    return 1;
  }
  const portraitBaseline = 756 / 1051;
  return Math.sqrt(parsed.ratio / portraitBaseline);
}

function formatNumber(value) {
  return Number(value).toFixed(4).replace(/\.?0+$/, "");
}

function getAspectOrientation(value) {
  const parsed = parseAspectRatio(value);
  if (parsed) {
    return parsed.width >= parsed.height ? "landscape" : "portrait";
  }
  return "portrait";
}

function getPageCardSizingMetrics(section) {
  const rowGroups = extractCardRowGroups(section);
  const widestRow = rowGroups.reduce((best, row) => {
    const rowFactor = row.reduce((sum, aspect) => sum + getCardWidthFactor(aspect), 0);
    if (!best || rowFactor > best.factor) {
      return { factor: rowFactor, count: row.length };
    }
    return best;
  }, null);
  return {
    widestRowFactor: widestRow?.factor ?? 1,
    widestRowGapCount: Math.max((widestRow?.count ?? 1) - 1, 0)
  };
}

function getPageCardSizingVars(cardSizingMetrics) {
  const widestRowFactor = cardSizingMetrics?.widestRowFactor ?? 1;
  const widestRowGapCount = cardSizingMetrics?.widestRowGapCount ?? 0;
  return [
    "--card-row-gap:1rem",
    `--card-max-row-factor:${formatNumber(widestRowFactor)}`,
    `--card-max-row-gap-count:${widestRowGapCount}`,
    "--card-base-width:min(210px, calc((100% - (var(--card-row-gap) * var(--card-max-row-gap-count))) / var(--card-max-row-factor)))"
  ].join(";");
}

function extractCardRowGroups(section) {
  const blocks = [];
  blocks.push(...(section.introBlocks || []).map((block) => block.sourceMarkdown));
  for (const subsection of section.subsections) {
    blocks.push(...(subsection.blocks || []).map((block) => block.sourceMarkdown));
  }

  return blocks.flatMap(extractCardRowsFromMarkdown);
}

function extractCardRowsFromMarkdown(markdown) {
  const lines = markdown.split("\n");
  const rows = [];
  let index = 0;

  while (index < lines.length) {
    if (!lines[index].startsWith(":::card-image")) {
      index += 1;
      continue;
    }

    const cardConfigs = [];
    while (index < lines.length && lines[index].startsWith(":::card-image")) {
      const directiveLines = [];
      index += 1;
      while (index < lines.length && lines[index].trim() !== ":::") {
        directiveLines.push(lines[index]);
        index += 1;
      }
      index += 1;
      const config = parseDirectiveConfig(directiveLines);
      if (config.src) {
        cardConfigs.push(config);
      }
      while (index < lines.length && !lines[index].trim()) {
        index += 1;
      }
    }

    if (cardConfigs.length > 0) {
      rows.push(...chunkCardConfigs(cardConfigs).map((row) => row.map((config) => normalizeAspect(config.aspect || "3 / 4.2"))));
    }
  }

  return rows;
}

function chunkCardConfigs(cardConfigs) {
  const rows = [];
  let currentRow = [];
  let currentOrientation = null;

  for (const config of cardConfigs) {
    const aspect = config.aspect || "3 / 4.2";
    const orientation = getAspectOrientation(aspect);
    const rowLimit = getCardRowLimit(orientation);

    if (
      currentRow.length > 0 &&
      (orientation !== currentOrientation || currentRow.length >= rowLimit)
    ) {
      rows.push(currentRow);
      currentRow = [];
      currentOrientation = null;
    }

    if (currentRow.length === 0) {
      currentOrientation = orientation;
    }

    currentRow.push(config);
  }

  if (currentRow.length > 0) {
    rows.push(currentRow);
  }

  return rows;
}

function getCardRowLimit(orientation) {
  return orientation === "landscape" ? 2 : 3;
}

async function clearDirectory(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  await Promise.all(
    entries.map((entry) =>
      fs.rm(path.join(dirPath, entry.name), {
        recursive: true,
        force: true
      })
    )
  );
}

async function writeHtml(filePath, html) {
  await fs.writeFile(filePath, html, "utf8");
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

main().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
