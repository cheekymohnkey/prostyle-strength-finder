import { expect, test } from "@playwright/test";
import { getRunRows, openRunOpsForInfluence, runRowByText, selectStatus } from "./support/run-ops-helpers";

test.describe("Style DNA Studio run operations - retry disable UX", () => {
  test("shows disable reason when run cannot be loaded for retry", async ({ page }) => {
    await openRunOpsForInfluence(page, "si_playwright_seed");

    await selectStatus(page, "failed");

    const runRows = getRunRows(page);
    await expect.poll(async () => runRows.count()).toBeGreaterThanOrEqual(2);

    const retryDisabledRow = runRowByText(page, "Seeded failed run without test grid reference.");
    const retryDisabledWrapper = retryDisabledRow.locator('div[title*="Retry unavailable: Test grid reference is missing."]');

    await expect(retryDisabledWrapper).toBeVisible();
    await expect(retryDisabledWrapper.getByRole("button", { name: "Load for retry" })).toBeDisabled();
  });

  test("loads retry context when references are present and allows clearing stored grid", async ({ page }) => {
    await openRunOpsForInfluence(page, "si_playwright_seed");

    await selectStatus(page, "failed");

    const loadableRetryRow = runRowByText(page, "Seeded failed run for diagnostics assertions.");
    await expect(loadableRetryRow).toBeVisible();
    await loadableRetryRow.getByRole("button", { name: "Load for retry" }).click();

    await expect(page.getByText("Using stored test grid")).toBeVisible();
    await expect(page.getByRole("button", { name: "Submit Retry" })).toBeEnabled();

    await page.getByRole("button", { name: "Clear" }).click();
    await expect(page.getByText("Using stored test grid")).toHaveCount(0);
  });
});
