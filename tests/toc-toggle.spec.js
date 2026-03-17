import { test, expect } from "@playwright/test";

test.describe("Responsive table of contents", () => {
    test("mobile trigger opens and closes the ToC sheet with accessible state", async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto("/rules/hero-turn-procedure.html");

        const trigger = page.locator("[data-toc-trigger]");
        const overlay = page.locator("[data-toc-overlay]");
        const closeButton = page.locator("[data-toc-close]");

        await expect(trigger).toHaveAttribute("aria-expanded", "false");
        await expect(overlay).toBeHidden();

        await trigger.click();

        await expect(overlay).toBeVisible();
        await expect(trigger).toHaveAttribute("aria-expanded", "true");
        await expect(page.locator("#toc-overlay-title")).toBeFocused();

        await closeButton.click();

        await expect(overlay).toBeHidden();
        await expect(trigger).toHaveAttribute("aria-expanded", "false");
        await expect(trigger).toBeFocused();
    });

    test("mobile ToC closes on backdrop, Escape, and link selection while updating the hash", async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto("/rules/hero-turn-procedure.html");

        const trigger = page.locator("[data-toc-trigger]");
        const overlay = page.locator("[data-toc-overlay]");
        const backdrop = page.locator("[data-toc-overlay]");
        const targetLink = page.locator("[data-toc-overlay] a[data-toc-id='section-4-7']").first();

        await trigger.click();
        await expect(overlay).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(overlay).toBeHidden();

        await trigger.click();
        await expect(overlay).toBeVisible();
        await backdrop.click({ position: { x: 12, y: 12 } });
        await expect(overlay).toBeHidden();

        await trigger.click();
        await expect(overlay).toBeVisible();
        await targetLink.click();

        await expect(overlay).toBeHidden();
        await expect.poll(async () => page.evaluate(() => window.location.hash)).toBe("#section-4-7");
    });

    test("desktop keeps the sidebar ToC and ignores mobile overlay behavior", async ({ page }) => {
        await page.goto("/rules/hero-turn-procedure.html#section-4-7");

        const trigger = page.locator("[data-toc-trigger]");
        const overlay = page.locator("[data-toc-overlay]");
        const sidebar = page.locator(".sidebar-panel .toc-container");

        await expect(sidebar).toBeVisible();
        await expect(overlay).toBeHidden();

        await trigger.click();

        await expect(overlay).toBeHidden();
        await expect(trigger).toHaveAttribute("aria-expanded", "false");

        await expect(page.locator(".sidebar-panel a[data-toc-id='section-4-7']")).toHaveClass(/active/);
    });

    test("active section is reflected in both desktop and mobile ToC copies", async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto("/rules/hero-turn-procedure.html#section-4-7");

        await expect(page.locator(".sidebar-panel a[data-toc-id='section-4-7']")).toHaveClass(/active/);

        await page.locator("[data-toc-trigger]").click();
        await expect(page.locator("[data-toc-overlay] a[data-toc-id='section-4-7']")).toHaveClass(/active/);
    });
});
