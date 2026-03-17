import fs from "node:fs/promises";
import path from "node:path";
import { test, expect } from "@playwright/test";

const heroTurnProcedurePath = path.resolve("rules/4-hero-turn-procedure.md");

test.describe("Markdown source comments", () => {
    test("comments stay hidden by default and become visible in comment mode", async ({ page }) => {
        await page.goto("/rules/hero-turn-procedure.html");

        const modeTrigger = page.locator("[data-comments-mode-trigger]").first();
        const commentedBlock = page.locator("[data-rule-commented-block][data-has-comments='true']").first();
        const uncommentedBlock = page.locator("[data-rule-commented-block]:not([data-has-comments='true'])").first();
        const commentPanel = commentedBlock.locator("[data-rule-comment]");
        const emptyCommentPanel = uncommentedBlock.locator("[data-rule-comment]");

        await expect(modeTrigger).toHaveAttribute("aria-pressed", "false");
        await expect(commentPanel).toBeHidden();
        await expect(emptyCommentPanel).toBeHidden();
        await expect(commentedBlock.locator("[data-rule-comment-toggle]")).toHaveCount(0);

        await modeTrigger.click();

        await expect(modeTrigger).toHaveAttribute("aria-pressed", "true");
        await expect(commentPanel).toBeVisible();
        await expect(emptyCommentPanel).toBeHidden();

        await page.reload();

        await expect(page.locator("[data-comments-mode-trigger]").first()).toHaveAttribute("aria-pressed", "true");
        await expect(page.locator("[data-rule-commented-block][data-has-comments='true']").first().locator("[data-rule-comment]")).toBeVisible();
    });

    test("add comment still works on local preview when File System Access API is unavailable", async ({ page }) => {
        await page.addInitScript(() => {
            delete window.showOpenFilePicker;
        });

        await page.goto("/rules/hero-turn-procedure.html#section-4-7");
        await page.locator("[data-comments-mode-trigger]").first().click();

        const addButton = page.locator("[data-rule-comment-add]").first();
        await expect(addButton).toBeEnabled();
        await expect(addButton).toHaveAttribute("title", "Add author comment");
    });

    test("nested list items expose add comment controls in comments mode", async ({ page }) => {
        await page.goto("/rules/card-anatomy.html#section-1-1");
        await page.locator("[data-comments-mode-trigger]").first().click();

        const nestedListItem = page.locator("[data-block-type='list-item']").filter({
            has: page.locator(".rule-commented-block__content", { hasText: "Agility" })
        }).first();

        await expect(nestedListItem.locator("[data-rule-comment-add]")).toBeVisible();
    });

    test("the first visible list item can open its composer even near the floating tab bar", async ({ page }) => {
        await page.goto("/rules/card-anatomy.html#section-1-1");
        await page.locator("[data-comments-mode-trigger]").first().click();

        const firstListItem = page.locator("[data-block-type='list-item']").first();
        await firstListItem.locator("[data-rule-comment-add]").click();

        await expect(firstListItem.locator("[data-rule-comment-composer]")).toBeVisible();
    });

    test("the add hit area toggles the composer open and closed", async ({ page }) => {
        await page.goto("/rules/hero-turn-procedure.html#section-4-8");
        await page.locator("[data-comments-mode-trigger]").first().click();

        const targetBlock = page.locator("[data-rule-commented-block]").filter({ hasNot: page.locator("[data-has-comments='true']") }).first();
        const addButton = targetBlock.locator("[data-rule-comment-add]");
        const composer = targetBlock.locator("[data-rule-comment-composer]");

        await addButton.click();
        await expect(composer).toBeVisible();
        await expect(targetBlock.locator("[data-rule-comment-cancel]")).toHaveCount(0);

        await addButton.click();
        await expect(composer).toBeHidden();
    });

    test("existing comments expose an edit action and update in page state", async ({ page }) => {
        const sourceText = await fs.readFile(heroTurnProcedurePath, "utf8");

        await page.addInitScript((initialSource) => {
            window.__mockRuleSourceText = initialSource;
            window.FileSystemFileHandle = class FileSystemFileHandle {};
            window.showOpenFilePicker = async () => [{
                kind: "file",
                name: "4-hero-turn-procedure.md",
                async getFile() {
                    return new File([window.__mockRuleSourceText], "4-hero-turn-procedure.md", { type: "text/markdown" });
                },
                async queryPermission() {
                    return "granted";
                },
                async requestPermission() {
                    return "granted";
                },
                async createWritable() {
                    return {
                        async write(contents) {
                            window.__mockRuleSourceText = contents;
                        },
                        async close() {}
                    };
                }
            }];
        }, sourceText);

        await page.goto("/rules/hero-turn-procedure.html#section-4-7");
        await page.locator("[data-comments-mode-trigger]").first().click();

        const commentedBlock = page.locator("#section-4-7 [data-rule-commented-block][data-has-comments='true']").first();
        await commentedBlock.locator("[data-rule-comment-edit]").first().click();
        await commentedBlock.locator("[data-rule-comment-input]").fill("Edited author comment");
        await commentedBlock.locator("[data-rule-comment-save]").click();

        await expect(commentedBlock.locator("[data-rule-comment]")).toContainText("Edited author comment");
        const updatedSource = await page.evaluate(() => window.__mockRuleSourceText);
        expect(updatedSource).toContain("<!-- COMMENT: Edited author comment -->");
    });

    test("list item comments can open edit mode", async ({ page }) => {
        await page.goto("/rules/card-anatomy.html#section-1-1");
        await page.locator("[data-comments-mode-trigger]").first().click();

        const commentedListItem = page.locator("[data-block-type='list-item'][data-has-comments='true']").filter({
            has: page.locator("[data-rule-comment-text]", { hasText: "a bit to overly explained." })
        }).first();

        await commentedListItem.locator("[data-rule-comment-edit]").click();
        await expect(commentedListItem.locator("[data-rule-comment-composer]")).toBeVisible();
        await expect(commentedListItem.locator("[data-rule-comment-input]")).toHaveValue("a bit to overly explained.");
    });

    test("website authoring writes a new COMMENT directive back to the source markdown file", async ({ page }) => {
        const sourceText = await fs.readFile(heroTurnProcedurePath, "utf8");

        await page.addInitScript((initialSource) => {
            window.__mockRuleSourceText = initialSource;
            window.FileSystemFileHandle = class FileSystemFileHandle {};
            window.showOpenFilePicker = async () => [{
                kind: "file",
                name: "4-hero-turn-procedure.md",
                async getFile() {
                    return new File([window.__mockRuleSourceText], "4-hero-turn-procedure.md", { type: "text/markdown" });
                },
                async queryPermission() {
                    return "granted";
                },
                async requestPermission() {
                    return "granted";
                },
                async createWritable() {
                    return {
                        async write(contents) {
                            window.__mockRuleSourceText = contents;
                        },
                        async close() {}
                    };
                }
            }];
        }, sourceText);

        await page.goto("/rules/hero-turn-procedure.html#section-4-8");
        await page.locator("[data-comments-mode-trigger]").first().click();

        const targetBlock = page.locator("[data-rule-commented-block]").filter({ hasNot: page.locator("[data-has-comments='true']") }).first();
        await targetBlock.locator("[data-rule-comment-add]").click();
        await targetBlock.locator("[data-rule-comment-input]").fill("UI authored comment");
        await targetBlock.locator("[data-rule-comment-save]").click();

        await expect(targetBlock.locator("[data-rule-comment]")).toContainText("UI authored comment");
        await expect(targetBlock.locator("[data-rule-comment]")).toBeVisible();
        await expect(targetBlock.locator("[data-rule-comment-composer]")).toBeHidden();

        const updatedSource = await page.evaluate(() => window.__mockRuleSourceText);
        expect(updatedSource).toContain("<!-- COMMENT: UI authored comment -->");
    });
});
