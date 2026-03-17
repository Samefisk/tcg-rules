import { chromium } from "playwright";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

const port = 4175;
const baseUrl = `http://127.0.0.1:${port}`;
const pageUrl = `${baseUrl}/rules/card-anatomy.html`;
const viewportConfigs = [
  { name: "Mobile", width: 390, height: 844 },
  { name: "Tablet", width: 834, height: 1194 },
  { name: "Desktop", width: 1440, height: 1600 }
];
const measurementTolerance = 0.25;

const server = await startPreviewServer();

try {
  const browser = await chromium.launch();
  const failures = [];

  for (const viewport of viewportConfigs) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    await page.goto(pageUrl, { waitUntil: "networkidle" });

    const cards = await page.locator('.rule-subsection[id^="section-1-"] .card-showcase').evaluateAll((nodes) =>
      nodes.map((node, index) => {
        const card = node.querySelector(".holo-card");
        const caption = node.querySelector(".card-showcase-caption");
        const subsection = node.closest('.rule-subsection[id^="section-1-"]');
        const rect = card.getBoundingClientRect();
        const width = Number(rect.width.toFixed(2));
        const height = Number(rect.height.toFixed(2));
        return {
          index,
          subsectionId: subsection?.id || "unknown",
          label: caption?.textContent?.replace(/\s+/g, " ").trim() || `Card ${index + 1}`,
          width,
          height,
          orientation: width > height ? "Landscape" : "Portrait"
        };
      })
    );
    const rows = await page.locator('.rule-subsection[id^="section-1-"] .card-showcase-row').evaluateAll((nodes) =>
      nodes.map((node, index) => ({
        index,
        orientations: [...node.querySelectorAll(".holo-card")].map((card) => {
          const rect = card.getBoundingClientRect();
          return rect.width > rect.height ? "Landscape" : "Portrait";
        })
      }))
    );

    if (cards.length === 0) {
      failures.push({
        viewport: viewport.name,
        message: "No cards were found within Section 1.",
        mismatches: []
      });
      await context.close();
      continue;
    }

    const normalizedCards = cards.map((card) => ({
      ...card,
      normalizedWidth: card.orientation === "Landscape" ? card.height : card.width,
      normalizedHeight: card.orientation === "Landscape" ? card.width : card.height
    }));
    const baseline = {
      width: normalizedCards[0].normalizedWidth,
      height: normalizedCards[0].normalizedHeight
    };

    const mismatches = [];

    for (const card of normalizedCards) {
      if (
        Math.abs(card.normalizedWidth - baseline.width) > measurementTolerance ||
        Math.abs(card.normalizedHeight - baseline.height) > measurementTolerance
      ) {
        mismatches.push({
          kind: "normalized-dimensions",
          subsectionId: card.subsectionId,
          label: card.label,
          orientation: card.orientation,
          width: card.width,
          height: card.height,
          normalizedWidth: card.normalizedWidth,
          normalizedHeight: card.normalizedHeight,
          expectedWidth: baseline.width,
          expectedHeight: baseline.height
        });
      }
    }

    for (const row of rows) {
      const uniqueOrientations = [...new Set(row.orientations)];
      if (uniqueOrientations.length > 1) {
        mismatches.push({
          kind: "mixed-row",
          rowIndex: row.index,
          orientations: row.orientations
        });
      }
      const orientation = row.orientations[0];
      if (orientation === "Landscape" && row.orientations.length > 2) {
        mismatches.push({
          kind: "row-limit",
          rowIndex: row.index,
          orientation,
          count: row.orientations.length,
          limit: 2
        });
      }
      if (orientation === "Portrait" && row.orientations.length > 3) {
        mismatches.push({
          kind: "row-limit",
          rowIndex: row.index,
          orientation,
          count: row.orientations.length,
          limit: 3
        });
      }
    }

    if (mismatches.length > 0) {
      failures.push({
        viewport: viewport.name,
        message: `Orientation-aware card consistency failed. Expected normalized size ${baseline.width}x${baseline.height}.`,
        mismatches
      });
    } else {
      process.stdout.write(
        `${viewport.name}: all ${cards.length} Section 1 cards matched normalized size ${baseline.width}x${baseline.height}.\n`
      );
      process.stdout.write(
        `${viewport.name}: orientations => ${cards.map((card) => `${card.subsectionId}:${card.orientation}:${card.width}x${card.height}`).join(", ")}\n`
      );
      process.stdout.write(
        `${viewport.name}: row counts => ${rows.map((row) => `${row.orientations[0] || "Empty"}:${row.orientations.length}`).join(", ")}\n`
      );
    }

    await context.close();
  }

  await browser.close();

  if (failures.length > 0) {
    const lines = [];
    for (const failure of failures) {
      lines.push(`${failure.viewport}: ${failure.message}`);
      for (const mismatch of failure.mismatches) {
        if (mismatch.kind === "normalized-dimensions") {
          lines.push(
            `  - ${mismatch.subsectionId} | ${mismatch.label} | ${mismatch.orientation} | actual ${mismatch.width}x${mismatch.height} | normalized ${mismatch.normalizedWidth}x${mismatch.normalizedHeight} | expected normalized ${mismatch.expectedWidth}x${mismatch.expectedHeight}`
          );
        } else if (mismatch.kind === "mixed-row") {
          lines.push(
            `  - row ${mismatch.rowIndex + 1} mixes orientations: ${mismatch.orientations.join(", ")}`
          );
        } else if (mismatch.kind === "row-limit") {
          lines.push(
            `  - row ${mismatch.rowIndex + 1} has ${mismatch.count} ${mismatch.orientation} cards | limit ${mismatch.limit}`
          );
        }
      }
    }
    throw new Error(lines.join("\n"));
  }
} finally {
  server.kill("SIGTERM");
}

function startPreviewServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(process.cwd(), "scripts", "preview-site.mjs")], {
      cwd: process.cwd(),
      env: { ...process.env, PORT: String(port) },
      stdio: ["ignore", "pipe", "pipe"]
    });

    let settled = false;

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      if (!settled && text.includes(`http://localhost:${port}`)) {
        settled = true;
        resolve(child);
      }
      process.stdout.write(text);
    });

    child.stderr.on("data", (chunk) => {
      process.stderr.write(chunk.toString());
    });

    child.on("exit", (code) => {
      if (!settled) {
        settled = true;
        reject(new Error(`Preview server exited before startup with code ${code ?? "unknown"}.`));
      }
    });
  });
}
