import { expect, test } from "@playwright/test";
import { getRunRows, openRunOpsForInfluence, runRowByText, selectStatus } from "./support/run-ops-helpers";

test.describe("Style DNA Studio run operations - retry disable UX", () => {
  test("shows disable reason when run cannot be loaded for retry", async ({ page }) => {
    await openRunOpsForInfluence(page, "si_playwright_seed");

    await selectStatus(page, "failed");

    const runRows = getRunRows(page);
    await expect.poll(async () => runRows.count()).toBeGreaterThanOrEqual(2);

    const retryDisabledRow = runRowByText(page, "Seeded failed run without test grid reference.");
    const retryDisabledWrapper = retryDisabledRow.locator('div[title*="Action required: Test grid reference is missing"]');

    await expect(retryDisabledWrapper).toBeVisible();
    await expect(retryDisabledWrapper.getByRole("button", { name: "Load for retry" })).toBeDisabled();
  });

  test("shows actionable retry-disable reason when stored retry prerequisites are missing", async ({ page }) => {
    await openRunOpsForInfluence(page, "si_playwright_seed");

    await selectStatus(page, "failed");

    const loadableRetryRow = runRowByText(page, "Seeded failed run for diagnostics assertions.");
    await expect(loadableRetryRow).toBeVisible();
    await loadableRetryRow.getByRole("button", { name: "Load for retry" }).click();

    const influenceSelect = page.locator("label:has-text('Style Influence (Target SREF)') select");
    await influenceSelect.selectOption("");

    const submitRetryButton = page.getByRole("button", { name: "Submit Retry" });
    await expect(submitRetryButton).toBeDisabled();

    const disabledSubmitWrapper = page
      .locator('div[title*="Action required:"]')
      .filter({ has: submitRetryButton });
    await expect(disabledSubmitWrapper).toBeVisible();
    await expect(disabledSubmitWrapper).toHaveAttribute("title", /Style influence is not selected/i);
  });

  test("loads retry context when references are present", async ({ page }) => {
    await openRunOpsForInfluence(page, "si_playwright_seed");

    await selectStatus(page, "failed");

    const loadableRetryRow = runRowByText(page, "Seeded failed run for diagnostics assertions.");
    await expect(loadableRetryRow).toBeVisible();
    await loadableRetryRow.getByRole("button", { name: "Load for retry" }).click();

    await expect(page.getByText("Using stored test grid")).toBeVisible();

    const storedGridCard = page.locator("div", { hasText: "Using stored test grid" }).first();
    const submitRetryButton = storedGridCard.getByRole("button", { name: "Submit Retry" });
    await expect(submitRetryButton).toBeVisible();
  });
});
