import fs from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();
const contentDir = path.join(rootDir, "content");
const glossarySourcePath = path.join(rootDir, "GLOSSARY.md");
const rulesSourceDir = path.join(rootDir, "rules");
const siteSourceDir = path.join(rootDir, "site-src");

async function main() {
  await fs.mkdir(contentDir, { recursive: true });

  const rawGlossary = await parseGlossary(glossarySourcePath);
  const surfaceIndex = buildSurfaceIndex(rawGlossary.terms);
  const glossary = annotateGlossaryEntries(rawGlossary, surfaceIndex);
  const rules = await parseRuleSections(rulesSourceDir, surfaceIndex);
  const project = buildProjectMetadata(rules, glossary);

  await Promise.all([
    writeJson(path.join(contentDir, "project.json"), project),
    writeJson(path.join(contentDir, "glossary.json"), glossary),
    writeJson(path.join(contentDir, "rules.json"), rules)
  ]);

  process.stdout.write("Generated content/*.json from Markdown sources.\n");
}

function buildProjectMetadata(rules, glossary) {
  return {
    title: "TCG Rules",
    tagline: "Markdown-authored rules rendered as structured content and an interactive site.",
    overview:
      "This repository stores a physical card game's rules as Markdown-authored content. Structured JSON and the web rulebook are generated from the same glossary and rules files.",
    recommendation:
      "Use GLOSSARY.md and rules/ as the source of truth. Treat content/ and dist/ as generated outputs.",
    counts: {
      ruleSections: rules.length,
      glossaryTerms: glossary.terms.length
    }
  };
}

function annotateGlossaryEntries(glossary, surfaceIndex) {
  return {
    categories: glossary.categories,
    terms: glossary.terms.map((entry) => {
      const summarySource = entry.summary || firstSentence(entry.fullDefinition);
      const summary = annotateMarkdownText(summarySource, surfaceIndex);
      const fullDefinition = annotateMarkdownText(entry.fullDefinition, surfaceIndex);

      return {
        ...entry,
        summary,
        shortDefinition: summary,
        fullDefinition
      };
    })
  };
}

async function parseGlossary(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  const termsBody = getMarkdownSection(raw, "Terms");
  const terms = parseGlossaryTerms(termsBody);
  if (terms.length === 0) {
    throw new Error("No glossary terms found in GLOSSARY.md");
  }
  const categories = inferGlossaryCategories(terms);

  return {
    categories,
    terms
  };
}

function getMarkdownSection(raw, heading) {
  const headingPattern = new RegExp(`^## ${escapeRegex(heading)}\\s*$`, "m");
  const headingMatch = raw.match(headingPattern);
  if (!headingMatch || headingMatch.index === undefined) {
    return "";
  }

  const sectionStart = headingMatch.index + headingMatch[0].length;
  const remainder = raw.slice(sectionStart).replace(/^\s*\n/, "");
  const nextHeadingMatch = remainder.match(/^##\s+/m);
  return (nextHeadingMatch ? remainder.slice(0, nextHeadingMatch.index) : remainder).trim();
}

function parseGlossaryTerms(body) {
  return parseGlossaryEntries(body).map(({ label, content }) => {
    const lines = content.split("\n");
    let badge = null;
    let badgeColor = null;
    let categories = [];
    let summary = null;
    let definitionStartIndex = 0;

    while (definitionStartIndex < lines.length) {
      const line = lines[definitionStartIndex].trim();
      if (!line) {
        definitionStartIndex += 1;
        break;
      }

      const badgeMatch = line.match(/^Badge:\s*(.+)$/);
      if (badgeMatch) {
        badge = badgeMatch[1].trim();
        definitionStartIndex += 1;
        continue;
      }

      const badgeColorMatch = line.match(/^Badge Color:\s*(.+)$/);
      if (badgeColorMatch) {
        badgeColor = normalizeBadgeColor(badgeColorMatch[1].trim(), label);
        definitionStartIndex += 1;
        continue;
      }

      const categoriesMatch = line.match(/^Categories:\s*(.+)$/);
      if (categoriesMatch) {
        categories = categoriesMatch[1].split(",").map((value) => value.trim()).filter(Boolean);
        definitionStartIndex += 1;
        continue;
      }

      const summaryMatch = line.match(/^Summary:\s*(.+)$/);
      if (summaryMatch) {
        summary = summaryMatch[1].trim();
        definitionStartIndex += 1;
        continue;
      }

      break;
    }

    const definition = lines.slice(definitionStartIndex).join("\n").trim().replace(/\n{3,}/g, "\n\n");

    return {
      id: slugify(label),
      label,
      badge,
      badgeColor,
      categories,
      summary,
      fullDefinition: definition
    };
  });
}

function inferGlossaryCategories(terms) {
  const termIndex = new Map(terms.map((term) => [term.id, term]));
  const referencedCategoryIds = new Set();

  for (const term of terms) {
    for (const categoryId of term.categories || []) {
      if (categoryId === term.id) {
        throw new Error(`Glossary term "${term.label}" cannot designate itself as its own category`);
      }

      const categoryTerm = termIndex.get(categoryId);
      if (!categoryTerm) {
        throw new Error(`Unknown glossary category term "${categoryId}" on glossary term "${term.label}"`);
      }

      referencedCategoryIds.add(categoryId);
    }
  }

  return terms
    .filter((term) => referencedCategoryIds.has(term.id))
    .map((term) => {
      if (!term.badge) {
        throw new Error(`Missing Badge metadata on glossary category term "${term.label}"`);
      }

      return {
        id: term.id,
        label: term.label,
        badge: term.badge,
        badgeColor: term.badgeColor || null,
        termId: term.id
      };
    });
}

function normalizeBadgeColor(value, label) {
  const normalized = String(value || "").trim();
  if (!/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(normalized)) {
    throw new Error(`Invalid Badge Color "${value}" on glossary term "${label}". Use #RGB or #RRGGBB.`);
  }

  return normalized.toLowerCase();
}

function parseGlossaryEntries(body) {
  const entries = [];
  const matches = [...body.matchAll(/^### (.+)$/gm)];

  for (let index = 0; index < matches.length; index += 1) {
    const current = matches[index];
    const next = matches[index + 1];
    const label = current[1].trim();
    const start = current.index + current[0].length;
    const end = next ? next.index : body.length;
    const content = body
      .slice(start, end)
      .trim()
      .replace(/\n{3,}/g, "\n\n");

    entries.push({ label, content });
  }

  return entries;
}

async function parseRuleSections(dirPath, surfaceIndex) {
  const fileNames = (await fs.readdir(dirPath)).filter((fileName) => fileName.endsWith(".md")).sort();
  const sections = [];

  for (const fileName of fileNames) {
    const filePath = path.join(dirPath, fileName);
    const raw = await fs.readFile(filePath, "utf8");
    const { frontMatter, body, bodyStartOffset } = splitFrontMatter(raw);
    const headingMatch = body.match(/^#\s+(\d+)\.\s+(.+)$/m);
    if (!headingMatch) {
      throw new Error(`Could not parse top-level heading in ${fileName}`);
    }

    const displayNumber = headingMatch[1];
    const title = headingMatch[2].trim();
    const headingStartInBody = body.indexOf(headingMatch[0]);
    const afterHeadingUntrimmed = body.slice(headingStartInBody + headingMatch[0].length);
    const afterHeadingTrimmed = trimSegment(afterHeadingUntrimmed, bodyStartOffset + headingStartInBody + headingMatch[0].length);
    const afterHeading = afterHeadingTrimmed.text;
    const afterHeadingStartOffset = afterHeadingTrimmed.startOffset;
    const subsectionMatches = [...afterHeading.matchAll(/^##\s+(\d+\.\d+)\s+(.+)$/gm)];
    const introRegion = subsectionMatches.length
      ? trimSegment(afterHeading.slice(0, subsectionMatches[0].index), afterHeadingStartOffset)
      : trimSegment(afterHeading, afterHeadingStartOffset);

    const subsections = [];
    for (let index = 0; index < subsectionMatches.length; index += 1) {
      const match = subsectionMatches[index];
      const next = subsectionMatches[index + 1];
      const start = match.index + match[0].length;
      const end = next ? next.index : afterHeading.length;
      const bodyRegion = trimSegment(afterHeading.slice(start, end), afterHeadingStartOffset + start);

      subsections.push({
        id: match[1],
        title: match[2].trim(),
        blocks: await parseRuleMarkdownBlocks(bodyRegion.text, surfaceIndex, `${fileName} §${match[1]}`, {
          fileName,
          scope: match[1],
          scopeStartOffset: bodyRegion.startOffset
        })
      });
    }

    sections.push({
      id: fileName.replace(".md", ""),
      fileName,
      slug: fileName.replace(/^\d+-/, "").replace(".md", ""),
      title,
      displayNumber,
      references: parseReferences(frontMatter),
      introBlocks: await parseRuleMarkdownBlocks(introRegion.text, surfaceIndex, `${fileName} intro`, {
        fileName,
        scope: "intro",
        scopeStartOffset: introRegion.startOffset
      }),
      subsections
    });
  }

  return sections;
}

async function normalizeRuleMarkdown(markdown) {
  if (!markdown) {
    return "";
  }

  const lines = markdown.split("\n");
  const output = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const imageMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/);

    if (!imageMatch) {
      output.push(line);
      continue;
    }

    const alt = imageMatch[1].trim();
    const normalizedSrc = normalizeImageSource(imageMatch[2].trim());
    const imageInfo = await readImageInfo(normalizedSrc);

    let caption = "";
    if (index + 1 < lines.length) {
      const captionMatch = lines[index + 1].match(/^_(.+)_\s*$/);
      if (captionMatch) {
        caption = captionMatch[1].trim();
        index += 1;
      }
    }

    output.push(":::card-image");
    output.push(`src: ${normalizedSrc}`);
    if (alt) {
      output.push(`alt: ${alt}`);
    }
    if (caption) {
      output.push(`caption: ${caption}`);
    }
    if (imageInfo?.aspect) {
      output.push(`aspect: ${imageInfo.aspect}`);
    }
    output.push(":::");
  }

  return output.join("\n");
}

async function parseRuleMarkdownBlocks(markdown, surfaceIndex, contextLabel, sourceContext) {
  if (!markdown) {
    return [];
  }

  const lines = splitLinesWithOffsets(markdown);
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].text;
    const commentMatch = parseCommentDirective(line);

    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (commentMatch) {
      throw new Error(`COMMENT directive must follow a top-level markdown block in ${contextLabel}`);
    }

    let block = null;

    if (line.startsWith(":::card-image") || isMarkdownImageLine(line)) {
      const directiveChunks = [];
      let blockStartOffset = null;
      let blockEndOffset = null;

      while (index < lines.length && (lines[index].text.startsWith(":::card-image") || isMarkdownImageLine(lines[index].text))) {
        const chunkStart = lines[index].start;
        let chunkEnd = lines[index].end;
        let rawChunkMarkdown = "";

        if (lines[index].text.startsWith(":::card-image")) {
          const chunkLines = [lines[index].text];
          index += 1;

          while (index < lines.length && lines[index].text.trim() !== ":::") {
            chunkLines.push(lines[index].text);
            index += 1;
          }

          if (index >= lines.length) {
            throw new Error(`Unterminated card-image directive in ${contextLabel}`);
          }

          chunkLines.push(lines[index].text);
          chunkEnd = lines[index].end;
          index += 1;
          rawChunkMarkdown = chunkLines.join("\n");
        } else {
          const chunkLines = [lines[index].text];
          index += 1;
          if (index < lines.length && /^_(.+)_\s*$/.test(lines[index].text)) {
            chunkLines.push(lines[index].text);
            chunkEnd = lines[index].end;
            index += 1;
          }
          rawChunkMarkdown = chunkLines.join("\n");
        }

        directiveChunks.push(rawChunkMarkdown);
        if (blockStartOffset === null) {
          blockStartOffset = chunkStart;
        }
        blockEndOffset = chunkEnd;

        while (index < lines.length && !lines[index].text.trim()) {
          index += 1;
        }
      }

      const rawSourceMarkdown = directiveChunks.join("\n\n");
      const normalizedMarkdown = await normalizeRuleMarkdown(rawSourceMarkdown);
      block = {
        type: "card-image",
        rawSourceMarkdown,
        sourceMarkdown: annotateMarkdownText(normalizedMarkdown, surfaceIndex),
        sourceStartOffset: blockStartOffset,
        sourceEndOffset: blockEndOffset
      };
    } else if (line.startsWith("```")) {
      const codeLines = [line];
      const blockStartOffset = lines[index].start;
      index += 1;

      while (index < lines.length && !lines[index].text.startsWith("```")) {
        codeLines.push(lines[index].text);
        index += 1;
      }

      if (index >= lines.length) {
        throw new Error(`Unterminated code block in ${contextLabel}`);
      }

      codeLines.push(lines[index].text);
      const rawSourceMarkdown = codeLines.join("\n");
      const blockEndOffset = lines[index].end;
      index += 1;
      block = {
        type: "code",
        rawSourceMarkdown,
        sourceMarkdown: annotateMarkdownText(rawSourceMarkdown, surfaceIndex),
        sourceStartOffset: blockStartOffset,
        sourceEndOffset: blockEndOffset
      };
    } else if (line.startsWith("> ")) {
      const quoteLines = [];
      const blockStartOffset = lines[index].start;
      while (index < lines.length && lines[index].text.startsWith("> ")) {
        quoteLines.push(lines[index].text);
        index += 1;
      }
      const rawSourceMarkdown = quoteLines.join("\n");
      block = {
        type: "blockquote",
        rawSourceMarkdown,
        sourceMarkdown: annotateMarkdownText(rawSourceMarkdown, surfaceIndex),
        sourceStartOffset: blockStartOffset,
        sourceEndOffset: lines[index - 1].end
      };
    } else if (/^<!--\s*(DESIGN NOTE|AMBIGUOUS):/.test(line)) {
      const calloutLines = [];
      const blockStartOffset = lines[index].start;
      while (index < lines.length && /^<!--\s*(DESIGN NOTE|AMBIGUOUS):/.test(lines[index].text)) {
        calloutLines.push(lines[index].text);
        index += 1;
      }
      const rawSourceMarkdown = calloutLines.join("\n");
      block = {
        type: "callout",
        rawSourceMarkdown,
        sourceMarkdown: annotateMarkdownText(rawSourceMarkdown, surfaceIndex),
        sourceStartOffset: blockStartOffset,
        sourceEndOffset: lines[index - 1].end
      };
    } else {
      const listMarker = parseListMarker(line);
      if (listMarker && listMarker.indent === 0) {
        const { markdown: listMarkdown, nextIndex, startOffset, endOffset, items, ordered } = await parseListItems(
          lines,
          index,
          listMarker.indent,
          markdown,
          surfaceIndex,
          sourceContext
        );
        index = nextIndex;
        const normalizedMarkdown = await normalizeRuleMarkdown(listMarkdown);
        block = {
          type: "list",
          rawSourceMarkdown: listMarkdown,
          sourceMarkdown: annotateMarkdownText(normalizedMarkdown, surfaceIndex),
          sourceStartOffset: startOffset,
          sourceEndOffset: endOffset,
          ordered,
          items
        };
      } else {
        const paragraphLines = [];
        const blockStartOffset = lines[index].start;
        while (
          index < lines.length &&
          lines[index].text.trim() &&
          !lines[index].text.startsWith(":::card-image") &&
          !lines[index].text.startsWith("```") &&
          !lines[index].text.startsWith("> ") &&
          !/^<!--\s*(COMMENT|DESIGN NOTE|AMBIGUOUS):/.test(lines[index].text) &&
          !(parseListMarker(lines[index].text) && parseListMarker(lines[index].text).indent === 0)
        ) {
          paragraphLines.push(lines[index].text);
          index += 1;
        }

        const rawSourceMarkdown = paragraphLines.join("\n");
        const normalizedMarkdown = await normalizeRuleMarkdown(rawSourceMarkdown);
        block = {
          type: "paragraph",
          rawSourceMarkdown,
          sourceMarkdown: annotateMarkdownText(normalizedMarkdown, surfaceIndex),
          sourceStartOffset: blockStartOffset,
          sourceEndOffset: lines[index - 1].end
        };
      }
    }

    while (index < lines.length && !lines[index].text.trim()) {
      index += 1;
    }

    const comments = [];
    let insertOffset = block.sourceEndOffset;
    while (index < lines.length) {
      const nextLine = lines[index].text;
      if (!nextLine.trim()) {
        index += 1;
        continue;
      }

      const nextComment = parseCommentDirective(nextLine);
      if (!nextComment) {
        break;
      }

      comments.push({
        text: nextComment,
        source: {
          startOffset: sourceContext.scopeStartOffset + lines[index].start,
          endOffset: sourceContext.scopeStartOffset + lines[index].end
        }
      });
      insertOffset = lines[index].end;
      index += 1;
      while (index < lines.length && !lines[index].text.trim()) {
        index += 1;
      }
    }

    blocks.push({
      ...block,
      blockIndex: blocks.length + 1,
      comments,
      source: {
        filePath: `rules/${sourceContext.fileName}`,
        fileName: sourceContext.fileName,
        scope: sourceContext.scope,
        scopeStartOffset: sourceContext.scopeStartOffset,
        startOffset: sourceContext.scopeStartOffset + block.sourceStartOffset,
        endOffset: sourceContext.scopeStartOffset + block.sourceEndOffset,
        insertOffset: sourceContext.scopeStartOffset + insertOffset,
        targetType: "block",
        commentIndent: 0
      }
    });
  }

  return blocks;
}

function parseCommentDirective(line) {
  const match = line.match(/^\s*<!--\s*COMMENT:\s*(.+?)\s*-->$/);
  return match ? match[1].trim() : null;
}

function shouldTreatAsListItemContinuation(itemDisplayLines, currentLine) {
  const previousLine = String(itemDisplayLines[itemDisplayLines.length - 1] || "").trim();
  const trimmedCurrentLine = String(currentLine || "").trim();

  if (!previousLine || !trimmedCurrentLine) {
    return false;
  }

  return /^[^:]+:\s+/.test(previousLine);
}

function isMarkdownImageLine(line) {
  return /^!\[([^\]]*)\]\(([^)]+)\)\s*$/.test(line);
}

async function parseListItems(lines, startIndex, indent, scopeMarkdown, surfaceIndex, sourceContext) {
  const chunks = [];
  let index = startIndex;
  const startOffset = lines[startIndex].start;
  let endOffset = lines[startIndex].end;
  const items = [];
  const firstMarker = parseListMarker(lines[startIndex].text);

  while (index < lines.length) {
    const marker = parseListMarker(lines[index].text);
    if (!marker || marker.indent !== indent || marker.ordered !== firstMarker?.ordered) {
      break;
    }

    const itemStartOffset = lines[index].start;
    const itemDisplayLines = [marker.content];
    let itemContentEndOffset = lines[index].end;
    let itemInsertOffset = lines[index].end;
    const itemComments = [];
    const nestedLists = [];
    chunks.push(lines[index].text);
    endOffset = lines[index].end;
    index += 1;

    while (index < lines.length) {
      const currentLine = lines[index].text;
      const currentMarker = parseListMarker(currentLine);
      const currentComment = parseCommentDirective(currentLine);

      if (!currentLine.trim()) {
        chunks.push(currentLine);
        endOffset = lines[index].end;
        index += 1;
        continue;
      }

      if (currentMarker) {
        if (currentMarker.indent === indent && currentMarker.ordered === marker.ordered) {
          break;
        }

        if (currentMarker.indent > indent) {
          const nestedList = await parseListItems(lines, index, currentMarker.indent, scopeMarkdown, surfaceIndex, sourceContext);
          chunks.push(nestedList.markdown);
          index = nestedList.nextIndex;
          endOffset = nestedList.endOffset;
          nestedLists.push({
            ordered: nestedList.ordered,
            items: nestedList.items
          });
          continue;
        }

        break;
      }

      if (currentComment) {
        chunks.push(currentLine);
        endOffset = lines[index].end;
        itemComments.push({
          text: currentComment,
          source: {
            startOffset: sourceContext.scopeStartOffset + lines[index].start,
            endOffset: sourceContext.scopeStartOffset + lines[index].end
          }
        });
        itemInsertOffset = lines[index].end;
        index += 1;
        continue;
      }

      if (
        currentLine.startsWith(":::card-image") ||
        currentLine.startsWith("```") ||
        currentLine.startsWith("> ") ||
        /^<!--\s*(COMMENT|DESIGN NOTE|AMBIGUOUS):/.test(currentLine)
      ) {
        break;
      }

      if (!shouldTreatAsListItemContinuation(itemDisplayLines, currentLine)) {
        break;
      }

      chunks.push(currentLine);
      endOffset = lines[index].end;
      itemContentEndOffset = lines[index].end;
      index += 1;
      itemDisplayLines.push(currentLine.trim());
    }

    while (index < lines.length && !lines[index].text.trim()) {
      if (parseListMarker(lines[index + 1]?.text || "")?.indent === indent) {
        chunks.push(lines[index].text);
        endOffset = lines[index].end;
        index += 1;
        continue;
      }
      break;
    }

    const rawSourceMarkdown = scopeMarkdown.slice(itemStartOffset, itemContentEndOffset);
    const normalizedItemMarkdown = await normalizeRuleMarkdown(rawSourceMarkdown);
    items.push({
      contentMarkdown: annotateMarkdownText(normalizedItemMarkdown.replace(/^(\s*)(\d+\.|-)\s+/, ""), surfaceIndex),
      rawSourceMarkdown,
      comments: itemComments,
      nestedLists,
      source: {
        filePath: `rules/${sourceContext.fileName}`,
        fileName: sourceContext.fileName,
        scope: sourceContext.scope,
        startOffset: sourceContext.scopeStartOffset + itemStartOffset,
        endOffset: sourceContext.scopeStartOffset + itemContentEndOffset,
        insertOffset: sourceContext.scopeStartOffset + itemInsertOffset,
        targetType: "list-item",
        commentIndent: marker.indent
      }
    });
  }

  return {
    markdown: chunks.join("\n").trimEnd(),
    nextIndex: index,
    startOffset,
    endOffset,
    items,
    ordered: firstMarker?.ordered ?? false
  };
}

function splitLinesWithOffsets(text) {
  const lines = [];
  let offset = 0;
  const rawLines = text.split("\n");

  rawLines.forEach((line, index) => {
    const lineBreakLength = index < rawLines.length - 1 ? 1 : 0;
    const start = offset;
    const end = offset + line.length;
    lines.push({ text: line, start, end });
    offset = end + lineBreakLength;
  });

  return lines;
}

function trimSegment(text, absoluteStartOffset) {
  const leadingMatch = text.match(/^\s*/);
  const trailingMatch = text.match(/\s*$/);
  const leadingLength = leadingMatch ? leadingMatch[0].length : 0;
  const trailingLength = trailingMatch ? trailingMatch[0].length : 0;
  const trimmedText = text.slice(leadingLength, text.length - trailingLength);

  return {
    text: trimmedText,
    startOffset: absoluteStartOffset + leadingLength,
    endOffset: absoluteStartOffset + text.length - trailingLength
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

function normalizeImageSource(value) {
  return value
    .replace(/^\.\.\/site-src\//, "")
    .replace(/^site-src\//, "")
    .replace(/^\/+/, "");
}

async function readImageInfo(relativeSourcePath) {
  const filePath = path.join(siteSourceDir, relativeSourcePath);
  const extension = path.extname(filePath).toLowerCase();

  if (extension === ".svg") {
    const raw = await fs.readFile(filePath, "utf8");
    const viewBoxMatch = raw.match(/viewBox="[^"]*?(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)"(?=[^>]*>)/i);
    if (viewBoxMatch) {
      return { aspect: formatAspect(Number(viewBoxMatch[1]), Number(viewBoxMatch[2])) };
    }
    const widthMatch = raw.match(/\bwidth="(\d+(?:\.\d+)?)"/i);
    const heightMatch = raw.match(/\bheight="(\d+(?:\.\d+)?)"/i);
    if (widthMatch && heightMatch) {
      return { aspect: formatAspect(Number(widthMatch[1]), Number(heightMatch[1])) };
    }
    return null;
  }

  const file = await fs.readFile(filePath);

  if (extension === ".png") {
    return { aspect: formatAspect(file.readUInt32BE(16), file.readUInt32BE(20)) };
  }

  if (extension === ".jpg" || extension === ".jpeg") {
    let offset = 2;
    while (offset < file.length) {
      while (offset < file.length && file[offset] !== 0xff) {
        offset += 1;
      }
      while (offset < file.length && file[offset] === 0xff) {
        offset += 1;
      }
      if (offset >= file.length) {
        break;
      }

      const marker = file[offset];
      offset += 1;

      if (marker === 0xd8 || marker === 0xd9) {
        continue;
      }

      if (offset + 1 >= file.length) {
        break;
      }

      const length = file.readUInt16BE(offset);
      if (length < 2 || offset + length > file.length) {
        break;
      }

      if (
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf)
      ) {
        const height = file.readUInt16BE(offset + 3);
        const width = file.readUInt16BE(offset + 5);
        return { aspect: formatAspect(width, height) };
      }

      offset += length;
    }
  }

  return null;
}

function formatAspect(width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }

  if (!Number.isInteger(width) || !Number.isInteger(height)) {
    return `${trimNumber(width)}/${trimNumber(height)}`;
  }

  const divisor = greatestCommonDivisor(width, height);
  return `${width / divisor}/${height / divisor}`;
}

function greatestCommonDivisor(a, b) {
  let left = Math.abs(a);
  let right = Math.abs(b);

  while (right !== 0) {
    const remainder = left % right;
    left = right;
    right = remainder;
  }

  return left || 1;
}

function trimNumber(value) {
  return Number(value.toFixed(4)).toString();
}

function splitFrontMatter(raw) {
  if (!raw.startsWith("---")) {
    return { frontMatter: "", body: raw, bodyStartOffset: 0 };
  }

  const endIndex = raw.indexOf("\n---", 3);
  if (endIndex === -1) {
    return { frontMatter: "", body: raw, bodyStartOffset: 0 };
  }

  const rawBody = raw.slice(endIndex + 4);
  const trimmedBody = rawBody.trimStart();
  const bodyOffsetAdjustment = rawBody.length - trimmedBody.length;

  return {
    frontMatter: raw.slice(3, endIndex).trim(),
    body: trimmedBody,
    bodyStartOffset: endIndex + 4 + bodyOffsetAdjustment
  };
}

function parseReferences(frontMatter) {
  const references = [];
  const referencesBlock = frontMatter.match(/references:\n([\s\S]+)/m);
  if (!referencesBlock) {
    return references;
  }

  for (const line of referencesBlock[1].split("\n")) {
    const match = line.match(/^\s*-\s+(.+)$/);
    if (match) {
      references.push(match[1].trim());
    }
  }

  return references;
}

function firstSentence(text) {
  const normalized = text.replace(/\s+/g, " ").trim();
  const match = normalized.match(/^.+?[.!?](?=\s|$)/);
  return match ? match[0] : normalized;
}

function annotateMarkdownText(text, surfaceIndex) {
  if (!text) {
    return "";
  }

  let working = annotateBoldGlossaryTerms(text, surfaceIndex);
  const placeholders = [];

  working = protectPattern(working, /:::card-image[\s\S]*?:::/g, placeholders);
  working = protectPattern(working, /```[\s\S]*?```/g, placeholders);
  working = protectPattern(working, /<!--[\s\S]*?-->/g, placeholders);
  working = protectPattern(working, /\[\[(?:section:[^[\]]+|summary:[a-z0-9-]+|[a-z0-9-]+\|[^[\]]+)\]\]/g, placeholders);

  const lines = working.split("\n").map((line) => {
    if (!line || /^#{1,6}\s/.test(line) || /^!\[/.test(line)) {
      return line;
    }

    let annotatedLine = line;
    annotatedLine = protectPattern(annotatedLine, /`[^`]+`/g, placeholders);
    annotatedLine = protectPattern(annotatedLine, /\[[^\]]+\]\([^)]+\)/g, placeholders);

    return annotatePlainText(annotatedLine, surfaceIndex);
  });

  return restorePlaceholders(lines.join("\n"), placeholders);
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

function protectPattern(text, pattern, placeholders) {
  return text.replace(pattern, (match) => createPlaceholder(placeholders, match));
}

function restorePlaceholders(text, placeholders) {
  let restored = text;
  for (const placeholder of placeholders) {
    restored = restored.replaceAll(placeholder.token, placeholder.value);
  }
  return restored;
}

function createPlaceholder(placeholders, value) {
  const token = `@@PLACEHOLDER_${placeholders.length}@@`;
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

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

main().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
