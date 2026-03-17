import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";

const port = Number(process.env.PORT || 4173);
const projectRootDir = process.cwd();
const rootDir = path.join(process.cwd(), "dist");

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);
  if (request.method === "GET" && requestUrl.pathname === "/__comment-authoring/status") {
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ ok: true, supportsWrite: true }));
    return;
  }
  if (request.method === "POST" && requestUrl.pathname === "/__comment-authoring/write") {
    await handleCommentWriteRequest(request, response);
    return;
  }

  let filePath = path.join(rootDir, decodeURIComponent(requestUrl.pathname));

  try {
    const stats = await fs.stat(filePath).catch(() => null);
    if (stats?.isDirectory() || requestUrl.pathname.endsWith("/")) {
      filePath = path.join(filePath, "index.html");
    }

    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(rootDir))) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    const contents = await fs.readFile(resolved);
    response.writeHead(200, { "Content-Type": contentType(resolved) });
    response.end(contents);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
});

async function handleCommentWriteRequest(request, response) {
  try {
    const body = await readJsonBody(request);
    const filePath = path.resolve(projectRootDir, String(body?.filePath || ""));
    const rawSourceMarkdown = String(body?.rawSourceMarkdown || "");
    const commentText = normalizeCommentText(body?.commentText);
    const hintedStartOffset = Number.parseInt(String(body?.hintedStartOffset ?? ""), 10);
    const targetType = String(body?.targetType || "block");
    const commentIndent = Math.max(0, Number.parseInt(String(body?.commentIndent ?? "0"), 10) || 0);
    const editRange = body?.editRange && typeof body.editRange === "object"
      ? {
          startOffset: Number.parseInt(String(body.editRange.startOffset ?? ""), 10),
          endOffset: Number.parseInt(String(body.editRange.endOffset ?? ""), 10)
        }
      : null;

    if (!filePath.startsWith(path.resolve(path.join(projectRootDir, "rules")))) {
      throw httpError(400, "Source file must be inside rules/.");
    }
    if (path.extname(filePath).toLowerCase() !== ".md") {
      throw httpError(400, "Source file must be a markdown file.");
    }
    if (!rawSourceMarkdown.trim()) {
      throw httpError(400, "Missing source block markdown.");
    }
    if (!commentText) {
      throw httpError(400, "Comment text cannot be empty.");
    }
    if (commentText.includes("-->")) {
      throw httpError(400, "Comment text cannot contain -->.");
    }

    const sourceText = await fs.readFile(filePath, "utf8");
    const updatedText = editRange
      ? replaceCommentTextInSource(sourceText, commentText, editRange)
      : (() => {
          const insertionOffset = resolveCommentInsertionOffset(
            sourceText,
            rawSourceMarkdown,
            Number.isFinite(hintedStartOffset) ? hintedStartOffset : 0
          );
          const insertionText = buildCommentInsertionText(commentText, targetType, commentIndent);
          return `${sourceText.slice(0, insertionOffset)}${insertionText}${sourceText.slice(insertionOffset)}`;
        })();

    await fs.writeFile(filePath, updatedText, "utf8");
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({
      ok: true,
      fileName: path.basename(filePath),
      editRange: editRange || inferInsertedCommentRange(updatedText, commentText)
    }));
  } catch (error) {
    const statusCode = error?.statusCode || 500;
    response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : "Could not write the comment."
    }));
  }
}

function buildCommentInsertionText(commentText, targetType, commentIndent) {
  if (targetType === "list-item") {
    return `\n${" ".repeat(commentIndent)}<!-- COMMENT: ${commentText} -->`;
  }

  return `\n\n<!-- COMMENT: ${commentText} -->`;
}

function inferInsertedCommentRange(updatedText, commentText) {
  const commentMarkup = `<!-- COMMENT: ${commentText} -->`;
  const commentStart = updatedText.lastIndexOf(commentMarkup);
  if (commentStart === -1) {
    return null;
  }
  return {
    startOffset: commentStart,
    endOffset: commentStart + commentMarkup.length
  };
}

function normalizeCommentText(value) {
  return String(value || "")
    .replace(/\r?\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function replaceCommentTextInSource(fileText, commentText, editRange) {
  const startOffset = Number.parseInt(String(editRange?.startOffset ?? ""), 10);
  const endOffset = Number.parseInt(String(editRange?.endOffset ?? ""), 10);
  if (!Number.isFinite(startOffset) || !Number.isFinite(endOffset) || startOffset < 0 || endOffset < startOffset) {
    throw httpError(400, "This comment is missing edit metadata, so it cannot be updated safely.");
  }

  const existingComment = fileText.slice(startOffset, endOffset);
  if (!existingComment.startsWith("<!-- COMMENT:") || !existingComment.endsWith("-->")) {
    throw httpError(400, "Could not match the existing comment in source markdown.");
  }

  const replacement = existingComment.replace(/<!--\s*COMMENT:\s*.+?\s*-->$/, `<!-- COMMENT: ${commentText} -->`);
  return `${fileText.slice(0, startOffset)}${replacement}${fileText.slice(endOffset)}`;
}

function resolveCommentInsertionOffset(fileText, rawSourceMarkdown, hintedStartOffset) {
  const matchStart = findNearestOccurrence(fileText, rawSourceMarkdown, hintedStartOffset);
  if (matchStart === -1) {
    throw httpError(400, "Could not locate the target block in the source markdown file.");
  }

  let probeOffset = matchStart + rawSourceMarkdown.length;
  let insertOffset = probeOffset;

  while (probeOffset < fileText.length) {
    const whitespaceMatch = fileText.slice(probeOffset).match(/^\s*/);
    const whitespaceLength = whitespaceMatch ? whitespaceMatch[0].length : 0;
    const candidateStart = probeOffset + whitespaceLength;
    if (!fileText.startsWith("<!-- COMMENT:", candidateStart)) {
      break;
    }

    const commentEnd = fileText.indexOf("-->", candidateStart);
    if (commentEnd === -1) {
      throw httpError(400, "Encountered an unterminated COMMENT directive in the source file.");
    }

    insertOffset = commentEnd + 3;
    probeOffset = insertOffset;
  }

  return insertOffset;
}

function findNearestOccurrence(text, needle, hintedStartOffset) {
  if (!needle) return -1;

  let bestIndex = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  let searchIndex = text.indexOf(needle);

  while (searchIndex !== -1) {
    const distance = Math.abs(searchIndex - hintedStartOffset);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = searchIndex;
    }
    searchIndex = text.indexOf(needle, searchIndex + 1);
  }

  return bestIndex;
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

server.listen(port, () => {
  process.stdout.write(`Previewing dist/ at http://localhost:${port}\n`);
});

function contentType(filePath) {
  if (filePath.endsWith(".css")) {
    return "text/css; charset=utf-8";
  }
  if (filePath.endsWith(".js")) {
    return "application/javascript; charset=utf-8";
  }
  if (filePath.endsWith(".html")) {
    return "text/html; charset=utf-8";
  }
  return "text/plain; charset=utf-8";
}
