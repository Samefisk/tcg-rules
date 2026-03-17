import { getBadgeIconAssetPath, getBadgeIconKind } from "./badge-icons.js";

document.addEventListener("DOMContentLoaded", () => {
    initMobileNav();
    initTocToggle();
    initScrollSpy();
    initCommentsMode();
    initSearch();
    initBadgePixelSnap();
    initGlossaryTooltips();
    initHoloCards();
});

const DESKTOP_TOC_BREAKPOINT = 740;
const COMMENTS_MODE_STORAGE_KEY = "tcg-rules-comments-mode";
const COMMENTS_FILE_HANDLE_HINT_PREFIX = "tcg-rules-comment-file:";
const COMMENTS_FILE_HANDLE_DB_NAME = "tcg-rules-comment-authoring";
const COMMENTS_FILE_HANDLE_STORE_NAME = "file-handles";
const COMMENTS_PREVIEW_WRITE_ENDPOINT = "/__comment-authoring/write";
const COMMENTS_PREVIEW_STATUS_ENDPOINT = "/__comment-authoring/status";

function initMobileNav() {
    const trigger = document.getElementById("mobile-menu-trigger");
    const closeBtn = document.getElementById("close-mobile-nav");
    const backdrop = document.getElementById("mobile-nav-backdrop");

    if (!trigger || !closeBtn || !backdrop) return;

    function openNav() { backdrop.hidden = false; }
    function closeNav() { backdrop.hidden = true; }

    trigger.addEventListener("click", openNav);
    closeBtn.addEventListener("click", closeNav);
    backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop) closeNav();
    });
}

function initScrollSpy() {
    const sentinels = [...document.querySelectorAll("[data-scrollspy-sentinel][data-scrollspy-for]")];
    const banner = document.querySelector("[data-sticky-section-banner]");
    const bannerLabel = banner?.querySelector("[data-sticky-section-label]");
    const mirroredHeadings = [...document.querySelectorAll("[data-mirrored-heading-for]")];
    const tocLinks = [...document.querySelectorAll("[data-toc-link][data-toc-id]")];

    if (sentinels.length === 0) {
        if (banner) banner.hidden = true;
        return;
    }

    const trackedTargets = sentinels
        .map((sentinel) => {
            const targetId = sentinel.getAttribute("data-scrollspy-for");
            const section = targetId ? document.getElementById(targetId) : null;
            const label = section?.getAttribute("data-scrollspy-label")?.trim() || "";
            if (!section || !label) return null;
            return { sentinel, section, id: targetId, label };
        })
        .filter(Boolean);

    if (trackedTargets.length <= 1) {
        if (banner) banner.hidden = true;
        return;
    }

    let activeSectionId = null;
    let activeTargetIndex = 0;
    let syncFrame = null;

    function syncActiveState(activeTarget) {
        const activeId = activeTarget?.id || null;
        const activeLabel = activeTarget?.label || "";
        const bannerVisible = Boolean(activeId && activeLabel);

        if (activeId === activeSectionId && (!banner || banner.hidden === !bannerVisible)) return;
        activeSectionId = activeId;
        window.__ACTIVE_SCROLLSPY_ID__ = activeId;
        document.dispatchEvent(new CustomEvent("scrollspy:change", {
            detail: {
                activeId
            }
        }));

        if (banner && bannerLabel) {
            if (activeId && activeLabel && bannerVisible) {
                banner.hidden = false;
                bannerLabel.textContent = activeLabel;
            } else {
                banner.hidden = true;
                bannerLabel.textContent = "";
            }
        }

        mirroredHeadings.forEach((heading) => {
            const isMirrored = bannerVisible && activeId && heading.getAttribute("data-mirrored-heading-for") === activeId;
            if (isMirrored) {
                heading.setAttribute("data-banner-mirrored", "true");
            } else {
                heading.removeAttribute("data-banner-mirrored");
            }
        });

        tocLinks.forEach((link) => {
            const isActive = activeId && link.getAttribute("data-toc-id") === activeId;
            link.classList.toggle("active", Boolean(isActive));
            if (isActive) {
                link.setAttribute("aria-current", "true");
            } else {
                link.removeAttribute("aria-current");
            }
        });
    }

    function resolveInitialActiveTargetIndex() {
        const { handoffLine } = getStickySectionMetrics();
        let resolvedIndex = 0;

        trackedTargets.forEach((target, index) => {
            if (target.sentinel.getBoundingClientRect().top <= handoffLine) {
                resolvedIndex = index;
            }
        });

        return resolvedIndex;
    }

    function resolveActiveTarget() {
        const { handoffLine, hysteresis } = getStickySectionMetrics();
        let nextIndex = activeTargetIndex;

        while (nextIndex < trackedTargets.length - 1) {
            const nextTarget = trackedTargets[nextIndex + 1];
            if (nextTarget.sentinel.getBoundingClientRect().top <= handoffLine - hysteresis) {
                nextIndex += 1;
                continue;
            }
            break;
        }

        while (nextIndex > 0) {
            const currentTarget = trackedTargets[nextIndex];
            if (currentTarget.sentinel.getBoundingClientRect().top > handoffLine + hysteresis) {
                nextIndex -= 1;
                continue;
            }
            break;
        }

        activeTargetIndex = nextIndex;
        return trackedTargets[nextIndex];
    }

    function syncFromScrollPosition() {
        syncFrame = null;
        syncActiveState(resolveActiveTarget());
    }

    function scheduleSync() {
        if (syncFrame !== null) return;
        syncFrame = window.requestAnimationFrame(syncFromScrollPosition);
    }

    activeTargetIndex = resolveInitialActiveTargetIndex();
    syncActiveState(resolveActiveTarget());
    window.addEventListener("scroll", scheduleSync, { passive: true });
    window.addEventListener("resize", () => {
        activeTargetIndex = resolveInitialActiveTargetIndex();
        scheduleSync();
    }, { passive: true });
}

function initTocToggle() {
    const trigger = document.querySelector("[data-toc-trigger]");
    const overlay = document.querySelector("[data-toc-overlay]");
    const panel = document.querySelector("[data-toc-panel]");
    const overlayLinks = [...document.querySelectorAll("[data-toc-overlay] [data-toc-link]")];

    if (!trigger || !overlay || !panel) return;

    const desktopMediaQuery = window.matchMedia(`(min-width: ${DESKTOP_TOC_BREAKPOINT}px)`);
    const focusableSelector = [
        "a[href]",
        "button:not([disabled])",
        "textarea:not([disabled])",
        "input:not([disabled])",
        "select:not([disabled])",
        "[tabindex]:not([tabindex='-1'])"
    ].join(", ");
    let isTocOpen = false;
    let lastFocusedElement = null;
    let viewportSyncFrame = null;
    let viewportSyncTimeout = null;

    function getFocusableElements() {
        return [...panel.querySelectorAll(focusableSelector)]
            .filter((element) => !element.hasAttribute("hidden") && element.getAttribute("aria-hidden") !== "true");
    }

    function syncTriggerState() {
        trigger.setAttribute("aria-expanded", isTocOpen ? "true" : "false");
    }

    function openToc() {
        if (desktopMediaQuery.matches || isTocOpen) return;

        isTocOpen = true;
        lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : trigger;
        overlay.hidden = false;
        document.body.classList.add("has-open-toc");
        syncTriggerState();

        window.requestAnimationFrame(() => {
            panel.focus();
        });
    }

    function closeToc({ restoreFocus = true } = {}) {
        if (!isTocOpen) return;

        isTocOpen = false;
        overlay.hidden = true;
        document.body.classList.remove("has-open-toc");
        syncTriggerState();

        if (restoreFocus) {
            const focusTarget = lastFocusedElement instanceof HTMLElement ? lastFocusedElement : trigger;
            window.requestAnimationFrame(() => {
                focusTarget?.focus();
            });
        }
    }

    function syncDesktopSidebarAfterViewportChange() {
        requestScrollSpySync();

        if (viewportSyncFrame !== null) {
            window.cancelAnimationFrame(viewportSyncFrame);
        }
        if (viewportSyncTimeout !== null) {
            window.clearTimeout(viewportSyncTimeout);
        }

        viewportSyncFrame = window.requestAnimationFrame(() => {
            viewportSyncFrame = null;
            requestScrollSpySync();
        });

        viewportSyncTimeout = window.setTimeout(() => {
            viewportSyncTimeout = null;
            requestScrollSpySync();
        }, 180);
    }

    function handleKeydown(event) {
        if (!isTocOpen) return;

        if (event.key === "Escape") {
            event.preventDefault();
            closeToc();
            return;
        }

        if (event.key !== "Tab") return;

        const focusableElements = getFocusableElements();
        if (focusableElements.length === 0) {
            event.preventDefault();
            panel.focus();
            return;
        }

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        const activeElement = document.activeElement;

        if (event.shiftKey && activeElement === firstElement) {
            event.preventDefault();
            lastElement.focus();
        } else if (!event.shiftKey && activeElement === lastElement) {
            event.preventDefault();
            firstElement.focus();
        }
    }

    function handleViewportChange(event) {
        if (event.matches) {
            closeToc({ restoreFocus: false });
            syncDesktopSidebarAfterViewportChange();
        }
    }

    syncTriggerState();
    trigger.addEventListener("click", () => {
        if (isTocOpen) {
            closeToc();
            return;
        }

        openToc();
    });
    overlay.addEventListener("click", (event) => {
        if (event.target === overlay) {
            closeToc();
        }
    });
    overlayLinks.forEach((link) => {
        link.addEventListener("click", () => {
            if (!desktopMediaQuery.matches) {
                closeToc({ restoreFocus: false });
            }
        });
    });
    document.addEventListener("keydown", handleKeydown);
    desktopMediaQuery.addEventListener("change", handleViewportChange);
    window.addEventListener("resize", () => {
        if (desktopMediaQuery.matches) {
            closeToc({ restoreFocus: false });
            syncDesktopSidebarAfterViewportChange();
        }
    }, { passive: true });
}

function initCommentsMode() {
    const modeTriggers = [...document.querySelectorAll("[data-comments-mode-trigger]")];
    const commentBlocks = [...document.querySelectorAll("[data-rule-commented-block]")];

    if (modeTriggers.length === 0) return;

    let commentsEnabled = false;
    let activeComposerBlock = null;
    const supportsDirectFileSave = typeof window.showOpenFilePicker === "function";
    let supportsPreviewServerSave = false;
    const canProbePreviewServer = isLocalPreviewOrigin(window.location);
    const fileHandleCache = new Map();
    const fileHandleStore = createFileHandleStore();

    try {
        commentsEnabled = window.localStorage.getItem(COMMENTS_MODE_STORAGE_KEY) === "true";
    } catch {
        commentsEnabled = false;
    }

    function getDirectBlockChild(block, selector) {
        if (!(block instanceof HTMLElement)) return null;
        return block.querySelector(`:scope > ${selector}`);
    }

    function closeComposer(block) {
        const composer = getDirectBlockChild(block, "[data-rule-comment-composer]");
        const addButton = getDirectBlockChild(block, "[data-rule-comment-add]");
        const note = composer?.querySelector("[data-rule-comment-note]");
        const input = composer?.querySelector("[data-rule-comment-input]");

        if (!(composer instanceof HTMLElement) || !(addButton instanceof HTMLElement)) return;

        composer.hidden = true;
        addButton.setAttribute("aria-expanded", "false");
        block.removeAttribute("data-comment-composer-open");
        composer.removeAttribute("data-comment-editing");
        composer.removeAttribute("data-edit-start-offset");
        composer.removeAttribute("data-edit-end-offset");
        if (note instanceof HTMLElement && note.hasAttribute("data-note-error")) {
            note.hidden = true;
            note.textContent = "";
            note.removeAttribute("data-note-error");
        }
        if (input instanceof HTMLTextAreaElement) {
            resetComposerInputHeight(input);
        }
        if (activeComposerBlock === block) {
            activeComposerBlock = null;
        }
    }

    function openComposer(block, { value = "", editStartOffset = "", editEndOffset = "" } = {}) {
        if (activeComposerBlock && activeComposerBlock !== block) {
            closeComposer(activeComposerBlock);
        }

        const composer = getDirectBlockChild(block, "[data-rule-comment-composer]");
        const addButton = getDirectBlockChild(block, "[data-rule-comment-add]");
        const input = composer?.querySelector("[data-rule-comment-input]");

        if (!(composer instanceof HTMLElement) || !(addButton instanceof HTMLElement) || !(input instanceof HTMLTextAreaElement)) return;

        composer.hidden = false;
        addButton.setAttribute("aria-expanded", "true");
        block.setAttribute("data-comment-composer-open", "true");
        input.value = value;
        if (editStartOffset !== "" && editEndOffset !== "") {
            composer.setAttribute("data-comment-editing", "true");
            composer.setAttribute("data-edit-start-offset", String(editStartOffset));
            composer.setAttribute("data-edit-end-offset", String(editEndOffset));
        } else {
            composer.removeAttribute("data-comment-editing");
            composer.removeAttribute("data-edit-start-offset");
            composer.removeAttribute("data-edit-end-offset");
        }
        activeComposerBlock = block;
        window.requestAnimationFrame(() => {
            autosizeComposerInput(input);
            input.focus();
            input.setSelectionRange(input.value.length, input.value.length);
        });
    }

    function setComposerNote(block, message, { error = false } = {}) {
        const composer = getDirectBlockChild(block, "[data-rule-comment-composer]");
        const note = composer?.querySelector("[data-rule-comment-note]");
        if (!(note instanceof HTMLElement)) return;

        note.hidden = false;
        note.textContent = message;
        if (error) {
            note.setAttribute("data-note-error", "true");
        } else {
            note.removeAttribute("data-note-error");
        }
    }

    function setComposerBusy(block, isBusy) {
        const composer = getDirectBlockChild(block, "[data-rule-comment-composer]");
        const addButton = getDirectBlockChild(block, "[data-rule-comment-add]");
        const saveButton = composer?.querySelector("[data-rule-comment-save]");
        const input = composer?.querySelector("[data-rule-comment-input]");

        [addButton, saveButton, input].forEach((element) => {
            if (!(element instanceof HTMLElement)) return;
            if (isBusy) {
                element.setAttribute("aria-disabled", "true");
                if ("disabled" in element) {
                    element.disabled = true;
                }
            } else {
                element.removeAttribute("aria-disabled");
                if ("disabled" in element) {
                    element.disabled = false;
                }
            }
        });
    }

    function syncModeState() {
        document.body.classList.toggle("comments-mode-enabled", commentsEnabled);

        modeTriggers.forEach((trigger) => {
            trigger.setAttribute("aria-pressed", commentsEnabled ? "true" : "false");
            trigger.classList.toggle("is-active", commentsEnabled);
        });

        commentBlocks.forEach((block) => {
            const commentPanel = getDirectBlockChild(block, "[data-rule-comment]");
            const addButton = getDirectBlockChild(block, "[data-rule-comment-add]");
            if (commentPanel instanceof HTMLElement) {
                const hasComments = block.getAttribute("data-has-comments") === "true";
                commentPanel.hidden = !commentsEnabled || !hasComments;
            }
            if (!commentsEnabled) {
                closeComposer(block);
            }
            if (!(addButton instanceof HTMLButtonElement)) return;
            const canAuthorComments = supportsDirectFileSave || supportsPreviewServerSave;
            addButton.disabled = !canAuthorComments;
            addButton.setAttribute("aria-disabled", canAuthorComments ? "false" : "true");
            addButton.title = canAuthorComments
                ? "Add author comment"
                : canProbePreviewServer
                    ? "Comment authoring requires the latest local preview server. Restart npm run preview if needed."
                    : "Comment authoring requires the local preview server or a browser with local file access";
        });
    }

    modeTriggers.forEach((trigger) => {
        trigger.addEventListener("click", () => {
            commentsEnabled = !commentsEnabled;

            try {
                window.localStorage.setItem(COMMENTS_MODE_STORAGE_KEY, commentsEnabled ? "true" : "false");
            } catch {
                // Ignore storage failures and keep the in-memory state for this session.
            }

            syncModeState();
        });
    });

    commentBlocks.forEach((block) => {
        const addButton = getDirectBlockChild(block, "[data-rule-comment-add]");
        const composer = getDirectBlockChild(block, "[data-rule-comment-composer]");

        if (addButton instanceof HTMLElement) {
            addButton.addEventListener("click", () => {
                if (!commentsEnabled || (!supportsDirectFileSave && !supportsPreviewServerSave)) return;
                const isOpen = addButton.getAttribute("aria-expanded") === "true";
                if (isOpen) {
                    closeComposer(block);
                    return;
                }
                openComposer(block);
            });
        }

        block.addEventListener("click", (event) => {
            const targetElement = event.target instanceof Element
                ? event.target
                : event.target instanceof Node
                    ? event.target.parentElement
                    : null;
            const editButton = targetElement?.closest("[data-rule-comment-edit]") || null;
            if (!(editButton instanceof HTMLElement)) return;
            const owningBlock = editButton.closest("[data-rule-commented-block]");
            if (owningBlock !== block) return;
            if (!commentsEnabled || (!supportsDirectFileSave && !supportsPreviewServerSave)) return;
            const entry = editButton.closest("[data-rule-comment-entry]");
            if (!(entry instanceof HTMLElement)) return;
            const text = entry.querySelector("[data-rule-comment-text]")?.textContent || "";
            const editStartOffset = entry.getAttribute("data-comment-start-offset") || "";
            const editEndOffset = entry.getAttribute("data-comment-end-offset") || "";
            openComposer(block, { value: text, editStartOffset, editEndOffset });
        });

        if (composer instanceof HTMLFormElement) {
            const input = composer.querySelector("[data-rule-comment-input]");
            if (input instanceof HTMLTextAreaElement) {
                input.addEventListener("input", () => {
                    autosizeComposerInput(input);
                });
            }

            composer.addEventListener("submit", async (event) => {
                event.preventDefault();
                if (!commentsEnabled || (!supportsDirectFileSave && !supportsPreviewServerSave)) return;

                const input = composer.querySelector("[data-rule-comment-input]");
                if (!(input instanceof HTMLTextAreaElement)) return;

                const normalizedComment = normalizeCommentInput(input.value);
                if (!normalizedComment) {
                    setComposerNote(block, "Enter a comment before saving.", { error: true });
                    return;
                }

                if (normalizedComment.includes("-->")) {
                    setComposerNote(block, "Comments cannot contain the sequence -->.", { error: true });
                    return;
                }

                const editStartOffset = Number.parseInt(composer.getAttribute("data-edit-start-offset") || "", 10);
                const editEndOffset = Number.parseInt(composer.getAttribute("data-edit-end-offset") || "", 10);
                setComposerBusy(block, true);
                setComposerNote(block, "Saving comment to source markdown...");

                try {
                    const isEditing = composer.getAttribute("data-comment-editing") === "true"
                        && Number.isFinite(editStartOffset)
                        && Number.isFinite(editEndOffset);
                    const saveResult = await saveCommentToSource(block, normalizedComment, fileHandleCache, fileHandleStore, isEditing ? {
                        startOffset: editStartOffset,
                        endOffset: editEndOffset
                    } : null);
                    if (isEditing) {
                        applyEditedCommentToDom(block, normalizedComment, saveResult.editRange?.startOffset ?? editStartOffset, saveResult.editRange?.endOffset ?? editEndOffset);
                    } else {
                        applySavedCommentToDom(block, normalizedComment, saveResult.editRange || null);
                    }
                    input.value = "";
                    resetComposerInputHeight(input);
                    closeComposer(block);
                } catch (error) {
                    setComposerNote(block, error instanceof Error ? error.message : "Could not save the comment.", { error: true });
                } finally {
                    setComposerBusy(block, false);
                }
            });
        }
    });

    syncModeState();

    if (canProbePreviewServer) {
        probePreviewServerCommentSupport()
            .then((supported) => {
                supportsPreviewServerSave = supported;
                syncModeState();
            })
            .catch(() => {
                supportsPreviewServerSave = false;
                syncModeState();
            });
    }
}

function autosizeComposerInput(input) {
    if (!(input instanceof HTMLTextAreaElement)) return;
    input.style.height = "auto";
    input.style.height = `${Math.max(input.scrollHeight, 40)}px`;
}

function resetComposerInputHeight(input) {
    if (!(input instanceof HTMLTextAreaElement)) return;
    input.style.height = "";
}

function normalizeCommentInput(value) {
    return String(value || "")
        .replace(/\r?\n+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

async function saveCommentToSource(block, commentText, fileHandleCache, fileHandleStore, editRange = null) {
    const expectedFilePath = block.getAttribute("data-source-file") || "";
    const expectedFileName = block.getAttribute("data-source-file-name") || expectedFilePath.split("/").pop() || "";
    const rawSourceMarkdown = block.getAttribute("data-source-raw-markdown") || "";
    const hintedStartOffset = Number.parseInt(block.getAttribute("data-source-start-offset") || "", 10);
    const targetType = block.getAttribute("data-source-target-type") || "block";
    const commentIndent = Number.parseInt(block.getAttribute("data-source-comment-indent") || "0", 10);

    if (!expectedFilePath || !expectedFileName || !rawSourceMarkdown) {
        throw new Error("This block is missing source metadata, so it cannot be written back safely.");
    }

    if (typeof window.showOpenFilePicker === "function") {
        const handle = await getWritableFileHandle(expectedFilePath, expectedFileName, fileHandleCache, fileHandleStore);
        const sourceText = await readTextFromFileHandle(handle);
        const updatedText = editRange
            ? replaceCommentTextInSource(sourceText, commentText, editRange)
            : (() => {
                const insertionOffset = resolveCommentInsertionOffset(sourceText, rawSourceMarkdown, Number.isFinite(hintedStartOffset) ? hintedStartOffset : 0);
                const insertionText = buildCommentInsertionText(commentText, targetType, Number.isFinite(commentIndent) ? commentIndent : 0);
                return `${sourceText.slice(0, insertionOffset)}${insertionText}${sourceText.slice(insertionOffset)}`;
            })();
        const writable = await handle.createWritable();

        await writable.write(updatedText);
        await writable.close();

        return {
            fileName: handle.name || expectedFileName,
            editRange: editRange || inferInsertedCommentRange(updatedText, commentText)
        };
    }

    if (isLocalPreviewOrigin(window.location)) {
        return saveCommentThroughPreviewServer({
            filePath: expectedFilePath,
            rawSourceMarkdown,
            commentText,
            hintedStartOffset: Number.isFinite(hintedStartOffset) ? hintedStartOffset : 0,
            targetType,
            commentIndent: Number.isFinite(commentIndent) ? commentIndent : 0,
            editRange
        });
    }

    throw new Error("Comment authoring requires the local preview server or a browser with local file access.");
}

function buildCommentInsertionText(commentText, targetType, commentIndent) {
    if (targetType === "list-item") {
        return `\n${" ".repeat(Math.max(0, commentIndent))}<!-- COMMENT: ${commentText} -->`;
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

function replaceCommentTextInSource(fileText, commentText, editRange) {
    const startOffset = Number.parseInt(String(editRange?.startOffset ?? ""), 10);
    const endOffset = Number.parseInt(String(editRange?.endOffset ?? ""), 10);
    if (!Number.isFinite(startOffset) || !Number.isFinite(endOffset) || startOffset < 0 || endOffset < startOffset) {
        throw new Error("This comment is missing edit metadata, so it cannot be updated safely.");
    }

    const existingComment = fileText.slice(startOffset, endOffset);
    if (!existingComment.startsWith("<!-- COMMENT:") || !existingComment.endsWith("-->")) {
        throw new Error("Could not match the existing comment in source markdown.");
    }

    const replacement = existingComment.replace(/<!--\s*COMMENT:\s*.+?\s*-->$/, `<!-- COMMENT: ${commentText} -->`);
    return `${fileText.slice(0, startOffset)}${replacement}${fileText.slice(endOffset)}`;
}

async function saveCommentThroughPreviewServer(payload) {
    let response;
    try {
        response = await window.fetch(COMMENTS_PREVIEW_WRITE_ENDPOINT, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });
    } catch {
        throw new Error("Could not reach the local preview server. Restart npm run preview and reload the page.");
    }

    let data = null;
    try {
        data = await response.json();
    } catch {
        data = null;
    }

    if (!response.ok || !data?.ok) {
        if (response.status === 404) {
            throw new Error("The running preview server does not support comment writing yet. Restart npm run preview and reload the page.");
        }
        throw new Error(data?.error || "Could not save the comment through the local preview server.");
    }

    return {
        fileName: data.fileName || payload.filePath.split("/").pop() || payload.filePath,
        editRange: data.editRange || payload.editRange || null
    };
}

async function probePreviewServerCommentSupport() {
    try {
        const response = await window.fetch(COMMENTS_PREVIEW_STATUS_ENDPOINT, {
            method: "GET",
            cache: "no-store"
        });
        if (!response.ok) {
            return false;
        }
        const data = await response.json().catch(() => null);
        return Boolean(data?.supportsWrite);
    } catch {
        return false;
    }
}

async function getWritableFileHandle(expectedFilePath, expectedFileName, fileHandleCache, fileHandleStore) {
    const cached = fileHandleCache.get(expectedFilePath) || await fileHandleStore.get(expectedFilePath);
    if (cached) {
        await verifyFileHandle(cached, expectedFileName);
        const hasPermission = await ensureFileHandlePermission(cached);
        if (hasPermission) {
            fileHandleCache.set(expectedFilePath, cached);
            return cached;
        }
    }

    const [handle] = await window.showOpenFilePicker({
        multiple: false,
        suggestedName: expectedFileName,
        types: [
            {
                description: "Markdown files",
                accept: {
                    "text/markdown": [".md"]
                }
            }
        ]
    });

    if (!handle) {
        throw new Error("No source markdown file was selected.");
    }

    await verifyFileHandle(handle, expectedFileName);

    const hasPermission = await ensureFileHandlePermission(handle);
    if (!hasPermission) {
        throw new Error("Write permission was denied for the selected markdown file.");
    }

    fileHandleCache.set(expectedFilePath, handle);
    await fileHandleStore.set(expectedFilePath, handle);

    try {
        window.localStorage.setItem(`${COMMENTS_FILE_HANDLE_HINT_PREFIX}${expectedFilePath}`, expectedFileName);
    } catch {
        // Ignore storage issues for file handle hints.
    }

    return handle;
}

async function verifyFileHandle(handle, expectedFileName) {
    if (!handle || typeof handle.name !== "string") {
        throw new Error("The selected file handle is invalid.");
    }
    if (handle.name !== expectedFileName) {
        throw new Error(`Selected file "${handle.name}" does not match expected source file "${expectedFileName}".`);
    }
}

async function ensureFileHandlePermission(handle) {
    if (typeof handle.queryPermission === "function") {
        const query = await handle.queryPermission({ mode: "readwrite" });
        if (query === "granted") {
            return true;
        }
    }

    if (typeof handle.requestPermission === "function") {
        const request = await handle.requestPermission({ mode: "readwrite" });
        return request === "granted";
    }

    return true;
}

async function readTextFromFileHandle(handle) {
    const file = await handle.getFile();
    return file.text();
}

function resolveCommentInsertionOffset(fileText, rawSourceMarkdown, hintedStartOffset) {
    const matchStart = findNearestOccurrence(fileText, rawSourceMarkdown, hintedStartOffset);
    if (matchStart === -1) {
        throw new Error("Could not locate the target block in the selected markdown file.");
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
            throw new Error("Encountered an unterminated COMMENT directive while preparing the save.");
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

function applySavedCommentToDom(block, commentText, editRange = null) {
    block.setAttribute("data-has-comments", "true");

    const panel = block.querySelector(":scope > [data-rule-comment]");
    if (!(panel instanceof HTMLElement)) {
        return;
    }

    const newComment = document.createElement("p");
    newComment.setAttribute("data-rule-comment-text", "");
    newComment.textContent = commentText;
    const commentEntry = document.createElement("div");
    commentEntry.className = "rule-comment-entry";
    commentEntry.setAttribute("data-rule-comment-entry", "");
    if (editRange?.startOffset != null && editRange?.endOffset != null) {
        commentEntry.setAttribute("data-comment-start-offset", String(editRange.startOffset));
        commentEntry.setAttribute("data-comment-end-offset", String(editRange.endOffset));
    }
    commentEntry.innerHTML = `
        <div class="rule-comment__meta">
            <p class="rule-comment__label">Comment</p>
            <button type="button" class="rule-comment-edit" data-rule-comment-edit>Edit</button>
        </div>
    `;
    commentEntry.appendChild(newComment);
    panel.appendChild(commentEntry);
    panel.hidden = false;
}

function applyEditedCommentToDom(block, commentText, startOffset, endOffset) {
    const panel = block.querySelector(":scope > [data-rule-comment]");
    if (!(panel instanceof HTMLElement)) {
        return;
    }
    const matchingEntry = [...panel.querySelectorAll("[data-rule-comment-entry]")].find((entry) => (
        entry.getAttribute("data-comment-start-offset") === String(startOffset)
        && entry.getAttribute("data-comment-end-offset") === String(endOffset)
    ));
    if (!(matchingEntry instanceof HTMLElement)) {
        return;
    }
    const textNode = matchingEntry.querySelector("[data-rule-comment-text]") || matchingEntry.querySelector("p:last-child");
    if (textNode instanceof HTMLElement) {
        textNode.textContent = commentText;
    }
}

function createFileHandleStore() {
    return {
        async get(key) {
            try {
                const store = await openFileHandleDatabase();
                return await new Promise((resolve, reject) => {
                    const transaction = store.transaction(COMMENTS_FILE_HANDLE_STORE_NAME, "readonly");
                    const request = transaction.objectStore(COMMENTS_FILE_HANDLE_STORE_NAME).get(key);
                    request.onsuccess = () => resolve(request.result || null);
                    request.onerror = () => reject(request.error);
                });
            } catch {
                return null;
            }
        },
        async set(key, handle) {
            try {
                const store = await openFileHandleDatabase();
                await new Promise((resolve, reject) => {
                    const transaction = store.transaction(COMMENTS_FILE_HANDLE_STORE_NAME, "readwrite");
                    const request = transaction.objectStore(COMMENTS_FILE_HANDLE_STORE_NAME).put(handle, key);
                    request.onsuccess = () => resolve();
                    request.onerror = () => reject(request.error);
                });
            } catch {
                // Ignore persistence failures and fall back to in-memory handles only.
            }
        }
    };
}

function isLocalPreviewOrigin(locationLike) {
    const host = String(locationLike?.hostname || "").toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

let fileHandleDatabasePromise = null;

function openFileHandleDatabase() {
    if (fileHandleDatabasePromise) {
        return fileHandleDatabasePromise;
    }

    fileHandleDatabasePromise = new Promise((resolve, reject) => {
        const request = window.indexedDB.open(COMMENTS_FILE_HANDLE_DB_NAME, 1);
        request.onupgradeneeded = () => {
            const database = request.result;
            if (!database.objectStoreNames.contains(COMMENTS_FILE_HANDLE_STORE_NAME)) {
                database.createObjectStore(COMMENTS_FILE_HANDLE_STORE_NAME);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });

    return fileHandleDatabasePromise;
}

function getStickySectionMetrics() {
    const rootStyles = getComputedStyle(document.documentElement);
    const rawOffset = rootStyles.getPropertyValue("--sticky-section-offset").trim();
    const rawHeight = rootStyles.getPropertyValue("--sticky-section-height").trim();
    const offset = Number.parseFloat(rawOffset);
    const height = Number.parseFloat(rawHeight);

    return {
        offset: Number.isFinite(offset) ? offset : 0,
        height: Number.isFinite(height) ? height : 0,
        handoffLine: (Number.isFinite(offset) ? offset : 0) + (Number.isFinite(height) ? height : 0) + 8,
        hysteresis: 28
    };
}

let searchData = null;
let defaultFuse = null;
let changelogFuse = null;
const searchTypePriority = {
    section: 0,
    subsection: 1,
    term: 2,
    changelog: 3
};

function getPixelSnappedOffset(value, devicePixelRatio = window.devicePixelRatio || 1) {
    return (Math.round(value * devicePixelRatio) / devicePixelRatio) - value;
}

function applyBadgePixelSnap(root = document) {
    const badges = root.querySelectorAll?.(".category-badge") || [];
    const devicePixelRatio = window.devicePixelRatio || 1;

    badges.forEach((badge) => {
        const rect = badge.getBoundingClientRect();
        badge.style.setProperty("--category-badge-snap-x", `${getPixelSnappedOffset(rect.left, devicePixelRatio)}px`);
        badge.style.setProperty("--category-badge-snap-y", `${getPixelSnappedOffset(rect.top, devicePixelRatio)}px`);
    });
}

function initBadgePixelSnap() {
    let frame = null;

    function schedule() {
        if (frame !== null) return;
        frame = window.requestAnimationFrame(() => {
            frame = null;
            applyBadgePixelSnap(document);
        });
    }

    applyBadgePixelSnap(document);
    schedule();
    window.addEventListener("load", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    document.addEventListener("scrollspy:change", schedule);
    document.fonts?.ready?.then(schedule).catch(() => {});
}

function getBasepath() {
    const assetStylesheet = [...document.querySelectorAll('link[rel="stylesheet"]')]
        .find((link) => link.getAttribute("href")?.includes("assets/styles.css"));
    if (!assetStylesheet) return "";
    return assetStylesheet.getAttribute("href").split("assets/styles.css")[0];
}

function createCategoryBadgeGlyph(category) {
    const content = document.createElement("span");
    content.className = "category-badge__content";
    content.setAttribute("aria-hidden", "true");

    const glyph = document.createElement("span");
    glyph.className = "category-badge__glyph category-badge__glyph--text";
    glyph.textContent = category?.badge || "";
    content.appendChild(glyph);
    return content;
}

function applyCategoryBadgeBackgroundPresentation(badge, category) {
    if (!category?.badgeColor) {
        return;
    }

    badge.style.setProperty("--category-badge-bg", category.badgeColor);
}

function applyCategoryBadgeIconPresentation(badge, category, variant = "tooltip") {
    const iconKind = getBadgeIconKind(category);
    if (!iconKind) {
        return false;
    }

    badge.classList.add("category-badge--icon");
    badge.setAttribute("data-badge-icon", iconKind);
    badge.style.setProperty("--category-badge-icon-url", `url("${getBadgeIconAssetPath(iconKind, variant, getBasepath())}")`);
    const content = document.createElement("span");
    content.className = "category-badge__content category-badge__content--icon";
    content.setAttribute("aria-hidden", "true");
    const glyph = document.createElement("span");
    glyph.className = "category-badge__glyph category-badge__glyph--meta";
    glyph.textContent = iconKind;
    content.appendChild(glyph);
    badge.appendChild(content);
    return true;
}

async function initSearch() {
    const triggers = document.querySelectorAll("[data-search-trigger]");
    const modal = document.getElementById("search-modal");
    const closeBtn = document.getElementById("search-close");
    const input = document.getElementById("search-input");
    const resultsContainer = document.getElementById("search-results");
    const emptyState = document.getElementById("search-empty");
    const queryDisplay = document.getElementById("search-query-display");

    if (!modal || !closeBtn || !input || !resultsContainer || !emptyState || !queryDisplay) return;
    let activeResultIndex = -1;

    function openSearch() {
        modal.hidden = false;
        input.focus();
        if (defaultFuse && changelogFuse) {
            handleSearch();
            return;
        }
        loadSearchIndex(); // Lazy load
    }

    function closeSearch() {
        modal.hidden = true;
        input.value = "";
        resultsContainer.innerHTML = "";
        emptyState.hidden = true;
        activeResultIndex = -1;
        input.removeAttribute("aria-activedescendant");
    }

    function getResultItems() {
        return [...resultsContainer.querySelectorAll(".search-result-item")];
    }

    function getNavigableItems() {
        return [
            ...resultsContainer.querySelectorAll(".search-result-item, .search-subsection-item")
        ].filter((item) => item.getClientRects().length > 0);
    }

    function getActiveNavigableItem() {
        return getNavigableItems()[activeResultIndex] || null;
    }

    function isResultsVisualOrderReversed() {
        return resultsContainer.classList.contains("search-results--reversed");
    }

    function getSectionSubsections(sectionId) {
        return (searchData?.defaultIndex || []).filter((item) => item.type === "subsection" && item.sectionId === sectionId);
    }

    function normalizeUrlPath(value) {
        if (!value) return "/";
        try {
            const url = new URL(value, window.location.origin);
            return url.pathname.replace(/\/+$/, "") || "/";
        } catch {
            return value.replace(/\/+$/, "") || "/";
        }
    }

    function normalizeHash(value) {
        return value || "";
    }

    function getItemScrollspyId(item) {
        if (!item) return null;
        if (item.type === "section") {
            return `rule-section-${item.id}`;
        }
        if (item.type === "subsection") {
            return `section-${item.id.replace(/\./g, "-")}`;
        }
        return null;
    }

    function getCurrentLocationState() {
        return {
            path: normalizeUrlPath(window.location.pathname),
            hash: normalizeHash(window.location.hash)
        };
    }

    function getCurrentScrollspyId() {
        return typeof window.__ACTIVE_SCROLLSPY_ID__ === "string" ? window.__ACTIVE_SCROLLSPY_ID__ : null;
    }

    function getItemLocationState(item) {
        try {
            const url = new URL(`${getBasepath()}${item.url}`, window.location.origin);
            return {
                path: normalizeUrlPath(url.pathname),
                hash: normalizeHash(url.hash)
            };
        } catch {
            return {
                path: normalizeUrlPath(`${getBasepath()}${item.url}`),
                hash: ""
            };
        }
    }

    function isCurrentSectionItem(item) {
        const activeScrollspyId = getCurrentScrollspyId();
        const sectionScrollspyId = getItemScrollspyId(item);
        if (activeScrollspyId && sectionScrollspyId === activeScrollspyId) return true;
        if (activeScrollspyId) {
            return getSectionSubsections(item.id).some((subsection) => getItemScrollspyId(subsection) === activeScrollspyId);
        }

        const currentLocation = getCurrentLocationState();
        const itemLocation = getItemLocationState(item);
        if (currentLocation.path === itemLocation.path) return true;

        return getSectionSubsections(item.id).some((subsection) => getItemLocationState(subsection).path === currentLocation.path);
    }

    function isCurrentSubsectionItem(item) {
        const activeScrollspyId = getCurrentScrollspyId();
        if (activeScrollspyId) {
            return getItemScrollspyId(item) === activeScrollspyId;
        }

        const currentLocation = getCurrentLocationState();
        const itemLocation = getItemLocationState(item);
        return currentLocation.path === itemLocation.path && currentLocation.hash === itemLocation.hash;
    }

    function syncCurrentLocationClasses() {
        const sectionItems = [...resultsContainer.querySelectorAll(".search-result-item[data-section-id]")];
        const subsectionItems = [...resultsContainer.querySelectorAll(".search-subsection-item[data-subsection-id]")];

        sectionItems.forEach((element) => {
            const item = {
                type: "section",
                id: element.getAttribute("data-section-id"),
                url: element.getAttribute("data-item-url") || ""
            };
            element.classList.toggle("is-current-location", isCurrentSectionItem(item));
        });

        subsectionItems.forEach((element) => {
            const item = {
                type: "subsection",
                id: element.getAttribute("data-subsection-id"),
                sectionId: element.getAttribute("data-parent-section-id") || "",
                url: element.getAttribute("data-item-url") || ""
            };
            element.classList.toggle("is-current-location", isCurrentSubsectionItem(item));
        });
    }

    function updateActiveResult(nextIndex) {
        const items = getNavigableItems();
        if (items.length === 0) {
            activeResultIndex = -1;
            input.removeAttribute("aria-activedescendant");
            return;
        }

        const clampedIndex = Math.max(0, Math.min(nextIndex, items.length - 1));
        activeResultIndex = clampedIndex;

        items.forEach((item, index) => {
            const isActive = index === clampedIndex;
            item.classList.toggle("active-descendant", isActive);
            item.setAttribute("aria-selected", String(isActive));
        });

        const activeItem = items[clampedIndex];
        input.setAttribute("aria-activedescendant", activeItem.id);
        activeItem.scrollIntoView({ block: "nearest" });
    }

    function getDefaultActiveResultIndex() {
        const items = getNavigableItems();
        const currentSectionItem = items.find((item) => item.classList.contains("search-result-item") && item.classList.contains("is-current-location"));
        if (currentSectionItem) {
            return items.indexOf(currentSectionItem);
        }

        const currentItem = items.find((item) => item.classList.contains("is-current-location"));
        if (currentItem) {
            return items.indexOf(currentItem);
        }

        return 0;
    }

    function setActiveResultByElement(element) {
        const items = getNavigableItems();
        const nextIndex = items.indexOf(element);
        if (nextIndex === -1) return;
        updateActiveResult(nextIndex);
    }

    function expandResultGroup(group) {
        if (!group || group.open) return;
        collapseOtherResultGroups(group);
        group.open = true;
    }

    function collapseResultGroup(group) {
        if (!group || !group.open) return;
        group.open = false;
    }

    function collapseOtherResultGroups(activeGroup) {
        getSectionGroups().forEach((group) => {
            if (group !== activeGroup) {
                collapseResultGroup(group);
            }
        });
    }

    function moveSelectionToFirstSubsection(group) {
        if (!group) return;
        expandResultGroup(group);
        const firstSubsection = group.querySelector(".search-subsection-item");
        if (firstSubsection) {
            setActiveResultByElement(firstSubsection);
        }
        window.requestAnimationFrame(() => {
            const deferredFirstSubsection = group.querySelector(".search-subsection-item");
            if (deferredFirstSubsection) {
                setActiveResultByElement(deferredFirstSubsection);
            }
        });
    }

    function getSectionGroups() {
        return [...resultsContainer.querySelectorAll(".search-result-group")];
    }

    function getSectionGroupForItem(item) {
        return item?.closest(".search-result-group") || null;
    }

    function getSectionGroupIndex(group) {
        return getSectionGroups().indexOf(group);
    }

    function moveSelectionToSectionGroup(group, { firstSubsection = false } = {}) {
        if (!group) return;
        if (firstSubsection) {
            moveSelectionToFirstSubsection(group);
            return;
        }

        const sectionItem = group.querySelector(".search-result-item");
        if (sectionItem) {
            setActiveResultByElement(sectionItem);
        }
    }

    function moveSelectionToAdjacentSectionGroup(fromGroup, offset, options = {}) {
        const groups = getSectionGroups();
        const currentIndex = groups.indexOf(fromGroup);
        if (currentIndex === -1) return;

        const targetGroup = groups[currentIndex + offset];
        if (!targetGroup) return;
        moveSelectionToSectionGroup(targetGroup, options);
    }

    function moveSelectionLeftFromSection(sectionItem) {
        const currentGroup = getSectionGroupForItem(sectionItem);
        if (!currentGroup) return;

        const currentGroupIndex = getSectionGroupIndex(currentGroup);
        if (currentGroupIndex <= 0) return;

        const previousGroup = getSectionGroups()[currentGroupIndex - 1];
        if (!previousGroup) return;

        if (previousGroup.open) {
            moveSelectionToFirstSubsection(previousGroup);
            return;
        }

        moveSelectionToSectionGroup(previousGroup);
    }

    function moveSelectionToParentSection(subsectionItem) {
        const activeGroup = subsectionItem?.closest(".search-result-group");
        const parentItem = activeGroup?.querySelector(".search-result-item");
        if (!activeGroup || !parentItem) return;

        setActiveResultByElement(parentItem);
        if (!activeGroup.open) return;

        window.requestAnimationFrame(() => {
            collapseResultGroup(activeGroup);
            setActiveResultByElement(parentItem);
        });
        window.requestAnimationFrame(() => {
            setActiveResultByElement(parentItem);
        });
    }

    triggers.forEach((trigger) => {
        trigger.addEventListener("click", openSearch);
    });
    closeBtn.addEventListener("click", closeSearch);
    modal.addEventListener("click", (e) => {
        if (e.target === modal) closeSearch();
    });
    resultsContainer.addEventListener("click", (e) => {
        const expandToggle = e.target.closest(".search-result-expand");
        if (expandToggle) {
            const group = expandToggle.closest(".search-result-group");
            if (group && !group.open) {
                window.requestAnimationFrame(() => {
                    collapseOtherResultGroups(group);
                });
            }
            return;
        }
        if (e.target.closest(".search-result-item") || e.target.closest(".search-subsection-item")) {
            closeSearch();
        }
    });
    document.addEventListener("scrollspy:change", () => {
        syncCurrentLocationClasses();
    });

    document.addEventListener("keydown", (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "k") {
            e.preventDefault();
            openSearch();
        }
        if (!modal.hidden && e.key === "ArrowDown") {
            e.preventDefault();
            const delta = isResultsVisualOrderReversed() ? -1 : 1;
            updateActiveResult(activeResultIndex === -1 ? getDefaultActiveResultIndex() : activeResultIndex + delta);
        }
        if (!modal.hidden && e.key === "ArrowUp") {
            e.preventDefault();
            const delta = isResultsVisualOrderReversed() ? 1 : -1;
            updateActiveResult(activeResultIndex === -1 ? getDefaultActiveResultIndex() : activeResultIndex + delta);
        }
        if (!modal.hidden && e.key === "ArrowRight") {
            const activeItem = getActiveNavigableItem();
            const activeGroup = getSectionGroupForItem(activeItem);

            // if (activeItem?.classList.contains("search-subsection-item")) {
            //     e.preventDefault();
            //     moveSelectionToAdjacentSectionGroup(activeGroup, 1);
            // } else
            if (activeGroup && activeItem?.classList.contains("search-result-item")) {
                e.preventDefault();
                moveSelectionToFirstSubsection(activeGroup);
            }
        }
        if (!modal.hidden && e.key === "ArrowLeft") {
            const activeItem = getActiveNavigableItem();
            const activeGroup = getSectionGroupForItem(activeItem);

            if (activeItem?.classList.contains("search-subsection-item")) {
                e.preventDefault();
                moveSelectionToParentSection(activeItem);
            } else if (activeGroup?.open && activeItem?.classList.contains("search-result-item")) {
                e.preventDefault();
                collapseResultGroup(activeGroup);
                setActiveResultByElement(activeItem);
            }
            // else if (activeGroup && activeItem?.classList.contains("search-result-item")) {
            //     e.preventDefault();
            //     moveSelectionLeftFromSection(activeItem);
            // }
        }
        if (!modal.hidden && e.key === "Enter") {
            const activeItem = getActiveNavigableItem();
            if (activeItem) {
                e.preventDefault();
                const toggle = activeItem.closest(".search-result-expand");
                if (toggle) {
                    toggle.click();
                } else {
                    activeItem.click();
                }
            }
        }
        if (e.key === "Escape" && !modal.hidden) {
            closeSearch();
        }
    });

    async function loadSearchIndex() {
        if (defaultFuse && changelogFuse) return;
        try {
            if (window.__SEARCH_DATA__ && typeof window.__SEARCH_DATA__ === "object") {
                searchData = window.__SEARCH_DATA__;
            } else if (Array.isArray(window.__SEARCH_INDEX__)) {
                searchData = {
                    defaultIndex: window.__SEARCH_INDEX__,
                    changelogIndex: []
                };
            } else {
                const res = await fetch(getBasepath() + "assets/search-index.json");
                if (!res.ok) throw new Error("Failed to load search index");
                const loaded = await res.json();
                searchData = Array.isArray(loaded)
                    ? { defaultIndex: loaded, changelogIndex: [] }
                    : loaded;
            }
            defaultFuse = new Fuse(searchData.defaultIndex || [], {
                keys: [
                    { name: "title", weight: 2 },
                    { name: "content", weight: 1 }
                ],
                threshold: 0.3,
                ignoreLocation: true
            });
            changelogFuse = new Fuse(searchData.changelogIndex || [], {
                keys: [
                    { name: "title", weight: 2 },
                    { name: "content", weight: 1 }
                ],
                threshold: 0.3,
                ignoreLocation: true
            });
            handleSearch();
        } catch (e) {
            console.error(e);
            emptyState.textContent = "Search index could not be loaded.";
            emptyState.hidden = false;
        }
    }

    function parseSearchQuery(rawQuery) {
        const trimmed = rawQuery.trim();
        const typeMatch = trimmed.match(/^(ss|s|t)(?:\s+(.*))?$/i);
        const changelogMatch = trimmed.match(/^c(?:\s+(.*))?$/i);
        if (typeMatch) {
            const [, prefix, term] = typeMatch;
            const normalizedPrefix = prefix.toLowerCase();
            const type = normalizedPrefix === "ss" ? "subsection" : normalizedPrefix === "s" ? "section" : "term";

            return {
                mode: "typed",
                type,
                term: (term || "").trim()
            };
        }

        if (!changelogMatch) {
            return {
                mode: "default",
                type: null,
                term: trimmed
            };
        }

        return {
            mode: "changelog",
            type: "changelog",
            term: (changelogMatch[1] || "").trim()
        };
    }

    function syncSearchInputMode(parsed) {
        input.classList.remove(
            "search-input-mode-section",
            "search-input-mode-subsection",
            "search-input-mode-term",
            "search-input-mode-changelog"
        );

        if (!parsed) return;
        if (parsed.mode === "changelog") {
            input.classList.add("search-input-mode-changelog");
            return;
        }
        if (parsed.mode === "typed" && parsed.type) {
            input.classList.add(`search-input-mode-${parsed.type}`);
        }
    }

    function showEmptyState(message, query = "") {
        resultsContainer.innerHTML = "";
        emptyState.innerHTML = query
            ? `${escapeHtml(message)} "<span id="search-query-display">${escapeHtml(query)}</span>"`
            : escapeHtml(message);
        emptyState.hidden = false;
        activeResultIndex = -1;
        input.removeAttribute("aria-activedescendant");
    }

    function escapeHtml(value) {
        return value
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function renderResults(items, { expandableSections = false, reverseVisualOrder = false } = {}) {
        emptyState.hidden = true;
        resultsContainer.classList.toggle("search-results--reversed", reverseVisualOrder);

        const basepath = getBasepath();
        const html = items.map((item, index) => {
            if (expandableSections && item.type === "section") {
                const subsectionItems = getSectionSubsections(item.id);
                const subsectionHtml = subsectionItems.map((subsection, subsectionIndex) => `
          <a href="${basepath}${subsection.url}" class="search-subsection-item${isCurrentSubsectionItem(subsection) ? " is-current-location" : ""}" id="search-subsection-${index}-${subsectionIndex}" role="option" aria-selected="false" data-subsection-id="${subsection.id}" data-parent-section-id="${item.id}" data-item-url="${subsection.url}">
            <span class="search-subsection-title">${subsection.title}</span>
          </a>
        `).join("");

                return `
        <details class="search-result-group" ${isCurrentSectionItem(item) ? "open" : ""}>
          <summary class="search-result-expand">
            <span class="search-result-item${isCurrentSectionItem(item) ? " is-current-location" : ""}" id="search-result-${index}" role="option" aria-selected="false" data-section-id="${item.id}" data-item-url="${item.url}">
              <span class="search-result-heading">
                <span class="search-result-title">${item.title}</span>
                <span class="search-result-type">${item.type}</span>
              </span>
              <span class="search-result-preview">${item.content}</span>
            </span>
          </summary>
          <div class="search-subsection-list">
            ${subsectionHtml}
          </div>
        </details>
      `;
            }

            return `
        <a href="${basepath}${item.url}" class="search-result-item" id="search-result-${index}" role="option" aria-selected="false" data-item-url="${item.url}">
          <span class="search-result-heading">
            <span class="search-result-title">${item.title}</span>
            <span class="search-result-type">${item.type}</span>
          </span>
          <span class="search-result-preview">${item.content}</span>
        </a>
      `;
        }).join("");

        resultsContainer.innerHTML = html;
        resultsContainer.setAttribute("role", "listbox");
        updateActiveResult(getDefaultActiveResultIndex());
    }

    function showSectionBrowseResults() {
        const sectionItems = (searchData?.defaultIndex || []).filter((item) => item.type === "section");
        if (sectionItems.length === 0) {
            resultsContainer.innerHTML = "";
            emptyState.hidden = true;
            activeResultIndex = -1;
            input.removeAttribute("aria-activedescendant");
            return;
        }

        renderResults(sectionItems, { expandableSections: true, reverseVisualOrder: false });
    }

    function handleSearch() {
        if (!defaultFuse || !changelogFuse) return;
        const parsed = parseSearchQuery(input.value);
        syncSearchInputMode(parsed);
        if (!parsed.term) {
            if (parsed.mode === "changelog" && input.value.trim()) {
                showEmptyState("C searches changelog entries only. Try", "C attunement");
                return;
            }
            if (parsed.mode === "typed" && input.value.trim()) {
                const examples = {
                    section: {
                        message: "S searches sections only. Try",
                        query: "S setup"
                    },
                    subsection: {
                        message: "SS searches subsections only. Try",
                        query: "SS 4.7"
                    },
                    term: {
                        message: "T searches glossary terms only. Try",
                        query: "T attunement"
                    }
                };
                const example = examples[parsed.type] || examples.section;
                showEmptyState(example.message, example.query);
                return;
            }
            showSectionBrowseResults();
            return;
        }

        const activeFuse = parsed.mode === "changelog" ? changelogFuse : defaultFuse;
        const results = activeFuse.search(parsed.term)
            .filter((result) => !parsed.type || result.item.type === parsed.type)
            .sort((a, b) => {
                const typeDelta = (searchTypePriority[a.item.type] ?? Number.MAX_SAFE_INTEGER) - (searchTypePriority[b.item.type] ?? Number.MAX_SAFE_INTEGER);
                if (typeDelta !== 0) return typeDelta;
                return (a.score ?? 0) - (b.score ?? 0);
            });

        if (results.length === 0) {
            const queryPrefix = parsed.mode === "changelog"
                ? "C"
                : parsed.type === "subsection"
                    ? "SS"
                    : parsed.type === "section"
                        ? "S"
                        : parsed.type === "term"
                            ? "T"
                            : "";
            const displayQuery = queryPrefix ? `${queryPrefix} ${parsed.term}` : parsed.term;
            showEmptyState("No results found for", displayQuery);
            return;
        }

        renderResults(results.slice(0, 8).map((result) => result.item), { reverseVisualOrder: true });
    }

    input.addEventListener("input", handleSearch);
}

function initGlossaryTooltips() {
    const refs = document.querySelectorAll(".glossary-ref, .section-ref");
    const tooltip = document.getElementById("glossary-tooltip");
    if (!tooltip || !window.FloatingUIDOM) return;

    const { computePosition, flip, shift, offset } = window.FloatingUIDOM;

    function parseCategoryBadges(rawValue) {
        if (!rawValue) return [];
        try {
            const parsed = JSON.parse(rawValue);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }

    function parseChildTerms(rawValue) {
        if (!rawValue) return [];
        try {
            const parsed = JSON.parse(rawValue);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }

    function plainTooltipText(value) {
        return String(value || "")
            .replace(/\[\[([a-z0-9-]+)\|([^[\]]+)\]\]/g, "$2")
            .replace(/\[\[section:([^[\]|]+)(?:\|([^[\]]+))?\]\]/g, (_, __, label) => label || "")
            .replace(/\*\*([^*]+)\*\*/g, "$1")
            .replace(/`([^`]+)`/g, "$1")
            .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
            .trim();
    }

    function renderTooltip(term, definition, categoryBadges, childTerms) {
        tooltip.replaceChildren();

        const header = document.createElement("div");
        header.className = "tooltip__header";

        const title = document.createElement("strong");
        title.className = "tooltip__title";
        title.textContent = term || "";

        header.appendChild(title);

        if (categoryBadges.length > 0) {
            const badgeStack = document.createElement("span");
            badgeStack.className = "category-badge-stack category-badge-stack--tooltip";
            badgeStack.setAttribute("aria-hidden", "true");

            categoryBadges.forEach((category) => {
                const badge = document.createElement("span");
                badge.className = "category-badge";
                badge.title = category.label || "";
                badge.setAttribute("aria-label", category.label || "");
                applyCategoryBadgeBackgroundPresentation(badge, category);
                if (!applyCategoryBadgeIconPresentation(badge, category, "tooltip")) {
                    badge.appendChild(createCategoryBadgeGlyph(category));
                }
                badgeStack.appendChild(badge);
            });

            header.appendChild(badgeStack);
        }

        const body = document.createElement("div");
        body.className = "tooltip__body";
        body.textContent = definition || "";

        tooltip.append(header, body);

        if (childTerms.length > 0) {
            const children = document.createElement("div");
            children.className = "tooltip__children";

            childTerms.forEach((child) => {
                const item = document.createElement("div");
                item.className = "tooltip__child-item";

                const childTitle = document.createElement("span");
                childTitle.className = "tooltip__child-title";
                childTitle.textContent = child.label || "";

                const childDescription = document.createElement("span");
                childDescription.className = "tooltip__child-description";
                const plainDescription = plainTooltipText(child.shortDefinition).replace(/[.!?]+$/, "");
                childDescription.textContent = ` - ${plainDescription}.`;

                item.append(childTitle, childDescription);
                children.appendChild(item);
            });

            tooltip.appendChild(children);
        }

        applyBadgePixelSnap(tooltip);
    }

    function showTooltip(el, term, definition, categoryBadges, childTerms) {
        renderTooltip(term, definition, categoryBadges, childTerms);
        tooltip.hidden = false;

        function update() {
            computePosition(el, tooltip, {
                placement: "top",
                middleware: [offset(8), flip(), shift({ padding: 8 })]
            }).then(({ x, y }) => {
                Object.assign(tooltip.style, {
                    left: `${x}px`,
                    top: `${y}px`,
                    position: "absolute"
                });
            });
        }

        update();
    }

    function hideTooltip() {
        tooltip.hidden = true;
    }

    refs.forEach(ref => {
        const term = ref.getAttribute("data-term");
        const def = ref.getAttribute("data-definition");
        const categoryBadges = parseCategoryBadges(ref.getAttribute("data-category-badges"));
        const childTerms = parseChildTerms(ref.getAttribute("data-child-terms"));

        ref.addEventListener("mouseenter", () => showTooltip(ref, term, def, categoryBadges, childTerms));
        ref.addEventListener("mouseleave", hideTooltip);
        ref.addEventListener("focus", () => showTooltip(ref, term, def, categoryBadges, childTerms));
        ref.addEventListener("blur", hideTooltip);
    });
}

function initHoloCards() {
    const cards = document.querySelectorAll(".holo-card");
    if (cards.length === 0) return;

    cards.forEach((card) => {
        const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const tiltRange = prefersReducedMotion ? 12 : 28;

        function updateFromPoint(clientX, clientY) {
            const rect = card.getBoundingClientRect();
            const x = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
            const y = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
            const rotateY = (x - 0.5) * tiltRange;
            const rotateX = (0.5 - y) * tiltRange;

            card.style.setProperty("--pointer-x", `${(x * 100).toFixed(2)}%`);
            card.style.setProperty("--pointer-y", `${(y * 100).toFixed(2)}%`);
            card.style.transform = `perspective(1200px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg)`;
            card.classList.add("is-tilting");
        }

        function updateFromCenter() {
            const rect = card.getBoundingClientRect();
            updateFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        }

        function resetTilt() {
            card.style.setProperty("--pointer-x", "50%");
            card.style.setProperty("--pointer-y", "50%");
            card.style.transform = "perspective(1200px) rotateX(0deg) rotateY(0deg)";
            card.classList.remove("is-tilting");
        }

        card.addEventListener("pointerenter", updateFromCenter);
        card.addEventListener("pointermove", (event) => {
            updateFromPoint(event.clientX, event.clientY);
        });
        card.addEventListener("mousemove", (event) => {
            updateFromPoint(event.clientX, event.clientY);
        });

        card.addEventListener("pointerleave", resetTilt);
        card.addEventListener("pointercancel", resetTilt);
        card.addEventListener("mouseleave", resetTilt);
        card.addEventListener("blur", resetTilt);

        card.addEventListener("focus", () => {
            card.classList.add("is-tilting");
            updateFromCenter();
        });

        resetTilt();
    });
}
