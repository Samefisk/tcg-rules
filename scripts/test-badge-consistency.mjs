import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const port = 4176;
const baseUrl = `http://127.0.0.1:${port}`;
const pageUrl = `${baseUrl}/rules/hero-turn-procedure.html`;
const sectionSelector = "main";
const viewport = { width: 1440, height: 1600 };
const sizeTolerance = 0.25;
const familyConsistencyTolerancePx = 0.25;
const centeringTolerancePx = 0.5;
const foregroundDistanceThreshold = 28;
const foregroundBrightnessThreshold = 36;
const foregroundChannelFloor = 170;
const badgeBackgroundDistanceThreshold = 18;
const debugOutputDir = path.join(process.cwd(), ".tmp", "badge-test-debug");

const server = await startPreviewServer();

try {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(pageUrl, { waitUntil: "networkidle" });

  const report = await page.evaluate((activeSectionSelector) => {
    function toRect(rect) {
      return {
        x: Number(rect.x.toFixed(3)),
        y: Number(rect.y.toFixed(3)),
        width: Number(rect.width.toFixed(3)),
        height: Number(rect.height.toFixed(3))
      };
    }

    function variantName(stack) {
      if (!stack) return "unknown";
      if (stack.classList.contains("category-badge-stack--inline")) return "inline";
      if (stack.classList.contains("category-badge-stack--heading")) return "heading";
      if (stack.classList.contains("category-badge-stack--tooltip")) return "tooltip";
      return "unknown";
    }

    const section = document.querySelector(activeSectionSelector);
    if (!(section instanceof HTMLElement)) {
      return {
        sectionMissing: true,
        sectionLabel: activeSectionSelector,
        badges: [],
        selectedSamples: []
      };
    }

    function glyphDescriptor(glyph) {
      if (!glyph) return { kind: "unknown", key: "unknown" };
      if (glyph instanceof SVGElement) {
        return {
          kind: "svg",
          key: glyph.getAttribute("data-badge-icon") || "svg"
        };
      }

      return {
        kind: "text",
        key: glyph.textContent?.trim() || "text"
      };
    }

    const badges = [...section.querySelectorAll(".category-badge")].map((badge) => {
      const stack = badge.closest(".category-badge-stack");
      const content = badge.querySelector(".category-badge__content");
      const glyph = badge.querySelector(".category-badge__glyph");
      const descriptor = glyphDescriptor(glyph);
      return {
        category: badge.getAttribute("data-term") || "",
        variant: variantName(stack),
        badgeRect: toRect(badge.getBoundingClientRect()),
        contentRect: content ? toRect(content.getBoundingClientRect()) : null,
        glyphRect: glyph ? toRect(glyph.getBoundingClientRect()) : null,
        glyphKind: descriptor.kind,
        glyphKey: descriptor.key
      };
    });

    const inlineEntries = [...section.querySelectorAll(".category-badge-stack--inline")]
      .flatMap((stack, stackIndex) => {
        const ref = stack.previousElementSibling;
        if (!(ref instanceof HTMLElement) || !ref.classList.contains("glossary-ref")) {
          return [];
        }

        const sourceTerm = ref.getAttribute("data-term") || ref.textContent?.trim() || "";
        return [...stack.querySelectorAll(".category-badge")].map((badge, badgeIndex) => {
          const content = badge.querySelector(".category-badge__content");
          const glyph = badge.querySelector(".category-badge__glyph");
          const descriptor = glyphDescriptor(glyph);
          const computed = getComputedStyle(badge);
          const backgroundColor = computed.backgroundColor;
          const testId = `badge-test-${stackIndex}-${badgeIndex}-${sourceTerm}-${badge.getAttribute("data-term") || "unknown"}`
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");
          badge.setAttribute("data-badge-test-id", testId);

          const match = backgroundColor.match(/rgba?\(([^)]+)\)/);
          const [r, g, b] = match
            ? match[1].split(",").slice(0, 3).map((value) => Number.parseFloat(value.trim()))
            : [0, 0, 0];

          return {
            sourceTerm,
            label: `${sourceTerm} ${badge.getAttribute("data-term") || ""}`.trim(),
            category: badge.getAttribute("data-term") || "",
            family: `${badge.getAttribute("data-term") || "Unknown"}|${descriptor.kind}|${descriptor.key}`,
            testId,
            badgeRect: toRect(badge.getBoundingClientRect()),
            contentRect: content ? toRect(content.getBoundingClientRect()) : null,
            glyphRect: glyph ? toRect(glyph.getBoundingClientRect()) : null,
            glyphKind: descriptor.kind,
            glyphKey: descriptor.key,
            backgroundColor: { r, g, b }
          };
        });
      });

    return {
      sectionMissing: false,
      sectionLabel: activeSectionSelector,
      devicePixelRatio: window.devicePixelRatio,
      badges,
      selectedSamples: inlineEntries
    };
  }, sectionSelector);

  if (report.sectionMissing) {
    throw new Error(`Badge consistency test failed.\n- Missing target section: ${report.sectionLabel}`);
  }

  const rasterSamples = [];
  for (const sample of report.selectedSamples) {
    const locator = page.locator(`[data-badge-test-id="${sample.testId}"]`);
    await locator.evaluate((element) => {
      element.scrollIntoView({ block: "center", inline: "center" });
    });
    const bbox = await locator.boundingBox();
    if (!bbox) {
      rasterSamples.push({
        ...sample,
        crop: { width: null, height: null },
        badgeBounds: { left: null, right: null, top: null, bottom: null },
        foregroundBounds: { left: null, right: null, top: null, bottom: null },
        margins: { left: null, right: null, top: null, bottom: null },
        centerDelta: { x: null, y: null }
      });
      continue;
    }
    const pngBytes = await page.screenshot({
      clip: {
        x: Math.floor(bbox.x),
        y: Math.floor(bbox.y),
        width: Math.ceil(bbox.width),
        height: Math.ceil(bbox.height)
      }
    });
    const analysis = await page.evaluate(
      async ({
        bytes,
        sample,
        foregroundDistanceThreshold,
        foregroundBrightnessThreshold,
        foregroundChannelFloor,
        badgeBackgroundDistanceThreshold
      }) => {
        const blob = new Blob([new Uint8Array(bytes)], { type: "image/png" });
        const bitmap = await createImageBitmap(blob);
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(bitmap, 0, 0);
        const { data, width, height } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);

        function luminance(r, g, b) {
          return (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
        }

        let bgLeft = width;
        let bgRight = -1;
        let bgTop = height;
        let bgBottom = -1;
        let fgLeft = width;
        let fgRight = -1;
        let fgTop = height;
        let fgBottom = -1;

        for (let y = 0; y < height; y += 1) {
          for (let x = 0; x < width; x += 1) {
            const index = (y * width + x) * 4;
            const r = data[index];
            const g = data[index + 1];
            const b = data[index + 2];
            const a = data[index + 3] / 255;
            const distanceFromBadgeBackground = Math.sqrt(
              ((r - sample.backgroundColor.r) ** 2) +
              ((g - sample.backgroundColor.g) ** 2) +
              ((b - sample.backgroundColor.b) ** 2)
            );

            if (a >= 0.1 && distanceFromBadgeBackground <= badgeBackgroundDistanceThreshold) {
              if (x < bgLeft) bgLeft = x;
              if (x > bgRight) bgRight = x;
              if (y < bgTop) bgTop = y;
              if (y > bgBottom) bgBottom = y;
            }
          }
        }

        if (bgRight < 0 || bgBottom < 0) {
          return {
            ...sample,
            crop: { width, height },
            badgeBounds: { left: null, right: null, top: null, bottom: null },
            foregroundBounds: { left: null, right: null, top: null, bottom: null },
            margins: { left: null, right: null, top: null, bottom: null },
            centerDelta: { x: null, y: null }
          };
        }

        for (let y = 0; y < height; y += 1) {
          for (let x = 0; x < width; x += 1) {
            const index = (y * width + x) * 4;
            const r = data[index];
            const g = data[index + 1];
            const b = data[index + 2];
            const a = data[index + 3] / 255;
            const distanceFromBackground = Math.sqrt(
              ((r - sample.backgroundColor.r) ** 2) +
              ((g - sample.backgroundColor.g) ** 2) +
              ((b - sample.backgroundColor.b) ** 2)
            );
            const brightnessDelta = luminance(r, g, b) - luminance(
              sample.backgroundColor.r,
              sample.backgroundColor.g,
              sample.backgroundColor.b
            );

            if (
              a < 0.1 ||
              distanceFromBackground < foregroundDistanceThreshold ||
              brightnessDelta < foregroundBrightnessThreshold ||
              r < foregroundChannelFloor ||
              g < foregroundChannelFloor ||
              b < foregroundChannelFloor
            ) {
              continue;
            }

            if (x < (bgLeft + 1) || x > (bgRight - 1) || y < (bgTop + 1) || y > (bgBottom - 1)) {
              continue;
            }

            if (x < fgLeft) fgLeft = x;
            if (x > fgRight) fgRight = x;
            if (y < fgTop) fgTop = y;
            if (y > fgBottom) fgBottom = y;
          }
        }

        if (fgRight < 0 || fgBottom < 0) {
          return {
            ...sample,
            crop: { width, height },
            badgeBounds: { left: bgLeft, right: bgRight, top: bgTop, bottom: bgBottom },
            foregroundBounds: { left: null, right: null, top: null, bottom: null },
            margins: { left: null, right: null, top: null, bottom: null },
            centerDelta: { x: null, y: null }
          };
        }

        const badgeRightEdge = bgRight + 1;
        const badgeBottomEdge = bgBottom + 1;
        const foregroundRightEdge = fgRight + 1;
        const foregroundBottomEdge = fgBottom + 1;

        const margins = {
          left: Number((fgLeft - bgLeft).toFixed(3)),
          right: Number((badgeRightEdge - foregroundRightEdge).toFixed(3)),
          top: Number((fgTop - bgTop).toFixed(3)),
          bottom: Number((badgeBottomEdge - foregroundBottomEdge).toFixed(3))
        };

        const foregroundCenterX = (fgLeft + foregroundRightEdge) / 2;
        const foregroundCenterY = (fgTop + foregroundBottomEdge) / 2;
        const badgeCenterX = (bgLeft + badgeRightEdge) / 2;
        const badgeCenterY = (bgTop + badgeBottomEdge) / 2;

        return {
          ...sample,
          crop: { width, height },
          badgeBounds: { left: bgLeft, right: bgRight, top: bgTop, bottom: bgBottom },
          foregroundBounds: { left: fgLeft, right: fgRight, top: fgTop, bottom: fgBottom },
          margins,
          centerDelta: {
            x: Number((foregroundCenterX - badgeCenterX).toFixed(3)),
            y: Number((foregroundCenterY - badgeCenterY).toFixed(3))
          }
        };
      },
      {
        bytes: [...pngBytes],
        sample,
        foregroundDistanceThreshold,
        foregroundBrightnessThreshold,
        foregroundChannelFloor,
        badgeBackgroundDistanceThreshold
      }
    );
    rasterSamples.push({
      ...analysis,
      debugFileName: `${sample.family.replace(/[^a-z0-9|]+/gi, "-").replace(/\|/g, "__")}__${sample.testId}.png`,
      pngBytes
    });
  }

  const failures = [];
  const inlineBadges = report.badges.filter((badge) => badge.variant === "inline");
  const baselineInline = inlineBadges[0];

  for (const badge of inlineBadges) {
    if (Math.abs(badge.badgeRect.width - baselineInline.badgeRect.width) > sizeTolerance) {
      failures.push(
        `Inline badge width mismatch for ${badge.category}: ${badge.badgeRect.width}px vs ${baselineInline.badgeRect.width}px`
      );
    }
    if (Math.abs(badge.badgeRect.height - baselineInline.badgeRect.height) > sizeTolerance) {
      failures.push(
        `Inline badge height mismatch for ${badge.category}: ${badge.badgeRect.height}px vs ${baselineInline.badgeRect.height}px`
      );
    }
    if (!badge.contentRect) {
      failures.push(`Missing content box for ${badge.category}`);
      continue;
    }
    if (Math.abs(badge.contentRect.width - baselineInline.contentRect.width) > sizeTolerance) {
      failures.push(
        `Inline badge content width mismatch for ${badge.category}: ${badge.contentRect.width}px vs ${baselineInline.contentRect.width}px`
      );
    }
    if (Math.abs(badge.contentRect.height - baselineInline.contentRect.height) > sizeTolerance) {
      failures.push(
        `Inline badge content height mismatch for ${badge.category}: ${badge.contentRect.height}px vs ${baselineInline.contentRect.height}px`
      );
    }
  }

  if (inlineBadges.length === 0) {
    failures.push(`No inline badges found in ${sectionSelector}`);
  }

  const samplesByFamily = new Map();
  for (const sample of rasterSamples) {
    const items = samplesByFamily.get(sample.family) || [];
    items.push(sample);
    samplesByFamily.set(sample.family, items);
  }

  const consistencyFailures = [];
  const centeringFailures = [];
  const outlierDiagnostics = [];
  const failingSampleIds = new Set();

  function hasForeground(sample) {
    return (
      sample.foregroundBounds.left !== null &&
      sample.foregroundBounds.right !== null &&
      sample.foregroundBounds.top !== null &&
      sample.foregroundBounds.bottom !== null
    );
  }

  for (const [family, samples] of samplesByFamily) {
    const valid = samples.filter(hasForeground);
    if (valid.length !== samples.length) {
      for (const sample of samples.filter((sample) => !hasForeground(sample))) {
        consistencyFailures.push(`${family}: ${sample.label} has no detected foreground pixels`);
        failingSampleIds.add(sample.testId);
      }
      continue;
    }

    function spread(values) {
      return Math.max(...values) - Math.min(...values);
    }

    function median(values) {
      const ordered = [...values].sort((a, b) => a - b);
      const middle = Math.floor(ordered.length / 2);
      if (ordered.length % 2 === 0) {
        return (ordered[middle - 1] + ordered[middle]) / 2;
      }
      return ordered[middle];
    }

    function recordOutliers(metricLabel, accessor) {
      const values = valid.map(accessor);
      const baseline = median(values);
      const offenders = valid
        .map((sample) => ({
          sample,
          delta: Math.abs(accessor(sample) - baseline),
          value: accessor(sample)
        }))
        .filter((entry) => entry.delta > familyConsistencyTolerancePx)
        .sort((a, b) => b.delta - a.delta);

      const kept = new Set();
      for (const offender of offenders) {
        if (kept.has(offender.sample.testId)) {
          continue;
        }
        kept.add(offender.sample.testId);
        failingSampleIds.add(offender.sample.testId);
        outlierDiagnostics.push(
          `${family}: ${metricLabel} outlier ${offender.sample.label} = ${offender.value.toFixed(3)}px (median ${baseline.toFixed(3)}px, delta ${offender.delta.toFixed(3)}px)`
        );
      }
    }

    let consistent = true;
    const leftSpread = spread(valid.map((sample) => sample.margins.left));
    const rightSpread = spread(valid.map((sample) => sample.margins.right));
    const topSpread = spread(valid.map((sample) => sample.margins.top));
    const bottomSpread = spread(valid.map((sample) => sample.margins.bottom));
    const horizontalCenterSpread = spread(valid.map((sample) => sample.centerDelta.x));
    const verticalCenterSpread = spread(valid.map((sample) => sample.centerDelta.y));

    if (leftSpread > familyConsistencyTolerancePx) {
      consistent = false;
      consistencyFailures.push(`${family}: left edge distance spread is ${leftSpread.toFixed(3)}px`);
    }
    if (rightSpread > familyConsistencyTolerancePx) {
      consistent = false;
      consistencyFailures.push(`${family}: right edge distance spread is ${rightSpread.toFixed(3)}px`);
    }
    if (topSpread > familyConsistencyTolerancePx) {
      consistent = false;
      consistencyFailures.push(`${family}: top edge distance spread is ${topSpread.toFixed(3)}px`);
    }
    if (bottomSpread > familyConsistencyTolerancePx) {
      consistent = false;
      consistencyFailures.push(`${family}: bottom edge distance spread is ${bottomSpread.toFixed(3)}px`);
    }
    if (horizontalCenterSpread > familyConsistencyTolerancePx) {
      consistent = false;
      consistencyFailures.push(`${family}: horizontal center spread is ${horizontalCenterSpread.toFixed(3)}px`);
    }
    if (verticalCenterSpread > familyConsistencyTolerancePx) {
      consistent = false;
      consistencyFailures.push(`${family}: vertical center spread is ${verticalCenterSpread.toFixed(3)}px`);
    }

    if (!consistent) {
      recordOutliers("left edge distance", (sample) => sample.margins.left);
      recordOutliers("right edge distance", (sample) => sample.margins.right);
      recordOutliers("top edge distance", (sample) => sample.margins.top);
      recordOutliers("bottom edge distance", (sample) => sample.margins.bottom);
      recordOutliers("horizontal center", (sample) => sample.centerDelta.x);
      recordOutliers("vertical center", (sample) => sample.centerDelta.y);
      continue;
    }

    for (const sample of valid) {
      const horizontalMarginDelta = Math.abs(sample.margins.left - sample.margins.right);
      const verticalMarginDelta = Math.abs(sample.margins.top - sample.margins.bottom);
      const horizontalCenterDelta = Math.abs(sample.centerDelta.x);
      const verticalCenterDelta = Math.abs(sample.centerDelta.y);

      if (horizontalMarginDelta > centeringTolerancePx) {
        centeringFailures.push(
          `${family}: ${sample.label} horizontal edge distances differ by ${horizontalMarginDelta.toFixed(3)}px`
        );
        failingSampleIds.add(sample.testId);
      }
      if (verticalMarginDelta > centeringTolerancePx) {
        centeringFailures.push(
          `${family}: ${sample.label} top/bottom edge distances differ by ${verticalMarginDelta.toFixed(3)}px`
        );
        failingSampleIds.add(sample.testId);
      }
      if (horizontalCenterDelta > centeringTolerancePx) {
        centeringFailures.push(
          `${family}: ${sample.label} horizontal center delta is ${horizontalCenterDelta.toFixed(3)}px`
        );
        failingSampleIds.add(sample.testId);
      }
      if (verticalCenterDelta > centeringTolerancePx) {
        centeringFailures.push(
          `${family}: ${sample.label} vertical center delta is ${verticalCenterDelta.toFixed(3)}px`
        );
        failingSampleIds.add(sample.testId);
      }
    }
  }

  failures.push(...consistencyFailures, ...centeringFailures);

  if (failures.length > 0) {
    await rm(debugOutputDir, { recursive: true, force: true });
    await mkdir(debugOutputDir, { recursive: true });
    const writtenDebugFiles = [];
    for (const sample of rasterSamples) {
      if (!failingSampleIds.has(sample.testId)) {
        continue;
      }
      const filePath = path.join(debugOutputDir, sample.debugFileName);
      await writeFile(filePath, sample.pngBytes);
      writtenDebugFiles.push(filePath);
    }

    await context.close();
    await browser.close();

    throw new Error(
      [
        "Badge consistency test failed.",
        ...failures.map((failure) => `- ${failure}`),
        "",
        "Outlier diagnostics:",
        ...(outlierDiagnostics.length > 0 ? outlierDiagnostics.map((line) => `- ${line}`) : ["- none"]),
        "",
        `Live badge diagnostics for ${sectionSelector}:`,
        ...report.badges.map(
          (badge) =>
            `- ${badge.variant}/${badge.category}/${badge.glyphKind}:${badge.glyphKey}: box ${badge.badgeRect.width}x${badge.badgeRect.height} content ${badge.contentRect?.width ?? "?"}x${badge.contentRect?.height ?? "?"} glyph ${badge.glyphRect?.width ?? "?"}x${badge.glyphRect?.height ?? "?"}`
        ),
        "",
        `Page screenshot diagnostics for ${sectionSelector}:`,
        ...rasterSamples.map(
          (sample) =>
            `- ${sample.family}/${sample.label}: crop ${sample.crop.width}x${sample.crop.height} badge ${sample.badgeBounds.left},${sample.badgeBounds.top} -> ${sample.badgeBounds.right},${sample.badgeBounds.bottom} fg ${sample.foregroundBounds.left},${sample.foregroundBounds.top} -> ${sample.foregroundBounds.right},${sample.foregroundBounds.bottom} margins L${sample.margins.left} R${sample.margins.right} T${sample.margins.top} B${sample.margins.bottom} center ${sample.centerDelta.x},${sample.centerDelta.y}`
        ),
        "",
        "Debug badge crops:",
        ...(writtenDebugFiles.length > 0 ? writtenDebugFiles.map((file) => `- ${file}`) : ["- none"])
      ].join("\n")
    );
  }

  await rm(debugOutputDir, { recursive: true, force: true });
  await context.close();
  await browser.close();

  process.stdout.write(`Section checked: ${sectionSelector}\n`);
  process.stdout.write(`Inline badges checked: ${inlineBadges.length}\n`);
  process.stdout.write(`Page samples checked: ${rasterSamples.length}\n`);
  process.stdout.write(
    `Families checked: ${[...samplesByFamily.entries()].map(([family, samples]) => `${family}(${samples.map((sample) => sample.label).join(", ")})`).join("; ")}\n`
  );
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
