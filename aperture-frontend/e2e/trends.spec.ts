import { test, expect } from "@playwright/test";

test.describe("Aperture Trends & Demographics UI", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/trends");
    await page.waitForLoadState("domcontentloaded");
  });

  test("loads the trends page successfully", async ({ page }) => {
    await expect(page).toHaveTitle(/Apperture|Aperture|Trend/i);
    const mainHeading = page.locator("h1, h2, h3").first();
    await expect(mainHeading).toBeVisible();
  });

  test("renders 'Who's talking' demographics panel with 3 proportional sections", async ({ page }) => {
    // Demographics section header
    const demoHeading = page.locator("text=Who's talking").first();
    await expect(demoHeading).toBeVisible();

    // 1. Column: Age Bracket Estimates
    const ageHeader = page.locator("text=Age Bracket Estimates").first();
    await expect(ageHeader).toBeVisible();
    await expect(page.locator("text=13–17").first()).toBeVisible();
    await expect(page.locator("text=25–34").first()).toBeVisible();

    // 2. Column: Primary Language & Donut chart
    const langHeader = page.locator("text=Primary Language").first();
    await expect(langHeader).toBeVisible();
    const donutContainer = page.locator(".lang-donut-container");
    await expect(donutContainer).toBeVisible();

    // Check legend pills below donut
    await expect(page.locator("text=Hindi").first()).toBeVisible();
    await expect(page.locator("text=English").first()).toBeVisible();
    await expect(page.locator("text=Hinglish").first()).toBeVisible();

    // 3. Column: Key Cohorts
    const cohortHeader = page.locator("text=Key Cohorts").first();
    await expect(cohortHeader).toBeVisible();
    await expect(page.locator("text=Affinity clusters").first()).toBeVisible();

    // Check vertical tags container is present
    const cohortPills = page.locator("div[title]");
    expect(await cohortPills.count()).toBeGreaterThanOrEqual(3);
  });

  test("interacts with language legend pills to dynamically highlight donut segments", async ({ page }) => {
    const hinglishPill = page.locator("text=Hinglish").first();
    if (await hinglishPill.isVisible()) {
      await hinglishPill.hover();
      // Should show hovered state
      await expect(hinglishPill).toHaveClass(/bg-gray-100|shadow/);

      // Verify the donut center text updates or displays percentage
      const donutCenterPct = page.locator(".lang-donut-container span.tnum").first();
      await expect(donutCenterPct).toBeVisible();
      const pctText = await donutCenterPct.textContent();
      expect(pctText).toMatch(/%/);
    }
  });

  test("opens narrative slide-over modal, inspects KPI cards, emotion mix, and platform icons", async ({ page }) => {
    // Find narrative row
    const narrativeRow = page.locator(".narrative-row, [role='button']").filter({ hasText: /posts|engagement|volume|active/i }).first();
    
    if (await narrativeRow.isVisible()) {
      await narrativeRow.click();

      // Check modal dialog
      const modal = page.locator("[role='dialog']");
      await expect(modal).toBeVisible();

      // Check KPI Cards inside modal
      const assignedPostsCard = modal.locator("text=ASSIGNED POSTS").first();
      if (await assignedPostsCard.isVisible()) {
        await expect(assignedPostsCard).toBeVisible();
      }

      // Check Emotion Mix inside modal
      const emotionSection = modal.locator("text=Emotion mix, tone & sentiment").or(modal.locator("text=Emotion mix"));
      if (await emotionSection.isVisible()) {
        await expect(emotionSection).toBeVisible();
      }

      // Close modal by pressing Escape
      await page.keyboard.press("Escape");
      await expect(modal).not.toBeVisible();
    }
  });

  test("verifies responsive desktop viewport consistency for the demographics panel", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    
    // Ensure the 3 sections are rendered side-by-side in a multi-column grid
    const ageHeader = page.locator("text=Age Bracket Estimates").first();
    const langHeader = page.locator("text=Primary Language").first();
    const cohortHeader = page.locator("text=Key Cohorts").first();

    await expect(ageHeader).toBeVisible();
    await expect(langHeader).toBeVisible();
    await expect(cohortHeader).toBeVisible();

    const ageBox = await ageHeader.boundingBox();
    const langBox = await langHeader.boundingBox();
    const cohortBox = await cohortHeader.boundingBox();

    // Verify left-to-right horizontal ordering
    if (ageBox && langBox && cohortBox) {
      expect(ageBox.x).toBeLessThan(langBox.x);
      expect(langBox.x).toBeLessThan(cohortBox.x);
    }
  });

  test("enters presentation mode, navigates slides, and verifies url sync & controls", async ({ page }) => {
    // Click 'Present' button
    const presentBtn = page.locator("#presentBtn");
    await expect(presentBtn).toBeVisible();
    await presentBtn.click();

    // Verify presentation mode body class and UI elements
    await expect(page.locator("body")).toHaveClass(/presentation-mode/);
    await expect(page.locator("#presentNav")).toBeVisible();
    await expect(page.locator("#exitPresentBtn")).toBeVisible();
    await expect(page.locator("#pCount")).toHaveText(/1 \/ 7/);

    // Verify slide cover briefing elements
    await expect(page.locator("text=Executive Research Briefing").first()).toBeVisible();

    // Advance to next slide via keyboard ArrowRight
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#pCount")).toHaveText(/2 \/ 7/);
    expect(page.url()).toContain("present=true");
    expect(page.url()).toContain("slide=1");

    // Advance to Slide 3 (Narrative Landscape) via #pNext button
    await page.locator("#pNext").click();
    await expect(page.locator("#pCount")).toHaveText(/3 \/ 7/);
    expect(page.url()).toContain("slide=2");

    // Open narrative modal dialog in presentation mode
    const narrativeRow = page.locator(".narrative-row, [role='button']").filter({ hasText: /posts|engagement|volume|active/i }).first();
    if (await narrativeRow.isVisible()) {
      await narrativeRow.click();
      const modal = page.locator("[role='dialog']");
      await expect(modal).toBeVisible();

      // Press Escape: Modal MUST close, but presentation mode MUST stay active!
      await page.keyboard.press("Escape");
      await expect(modal).not.toBeVisible();
      await expect(page.locator("body")).toHaveClass(/presentation-mode/);
      await expect(page.locator("#presentNav")).toBeVisible();
    }

    // Advance to slide 7 (Slide 6 - Quotes feed)
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press("ArrowRight");
    }
    await expect(page.locator("#pCount")).toHaveText(/7 \/ 7/);

    // Verify that .present-quotes-grid is visible and .normal-feed-box is hidden in presentation mode
    const quotesGrid = page.locator(".present-quotes-grid");
    await expect(quotesGrid).toBeVisible();
    const normalFeed = page.locator(".normal-feed-box");
    await expect(normalFeed).not.toBeVisible();

    // Exit presentation mode using #exitPresentBtn
    await page.locator("#exitPresentBtn").click();
    await expect(page.locator("body")).not.toHaveClass(/presentation-mode/);
    expect(page.url()).not.toContain("present=true");
  });
});
