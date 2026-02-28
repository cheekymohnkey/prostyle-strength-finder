import { expect, test } from "@playwright/test";

async function openRunOpsForInfluence(page: Parameters<typeof test>[0]["page"], influenceId: string) {
  await page.goto("/admin/style-dna");
  await expect(page.getByRole("heading", { name: "Style DNA Studio" })).toBeVisible();
  await expect(page.getByText("Run Operations Log")).toBeVisible();

  const influenceSelect = page.locator("label:has-text('Style Influence (Target SREF)') select");
  await expect(influenceSelect).toBeVisible();
  await influenceSelect.selectOption(influenceId);
}

test.describe("Style DNA Studio run operations - retry disable UX", () => {
  test("shows disable reason when run cannot be loaded for retry", async ({ page }) => {
    await openRunOpsForInfluence(page, "si_playwright_seed");

    const statusFilter = page.getByTestId("run-status-filter");
    await statusFilter.selectOption("failed");
    await expect(statusFilter).toHaveValue("failed");

    const runRows = page.getByTestId("run-row");
    await expect.poll(async () => runRows.count()).toBeGreaterThanOrEqual(2);

    const retryDisabledRow = page.locator('[data-testid="run-row"]', {
      hasText: "Seeded failed run without test grid reference.",
    });
    const retryDisabledWrapper = retryDisabledRow.locator('div[title*="Retry unavailable: Test grid reference is missing."]');

    await expect(retryDisabledWrapper).toBeVisible();
    await expect(retryDisabledWrapper.getByRole("button", { name: "Load for retry" })).toBeDisabled();
  });

  test("loads retry context when references are present and allows clearing stored grid", async ({ page }) => {
    await openRunOpsForInfluence(page, "si_playwright_seed");

    const statusFilter = page.getByTestId("run-status-filter");
    await statusFilter.selectOption("failed");
    await expect(statusFilter).toHaveValue("failed");

    const loadableRetryRow = page.locator('[data-testid="run-row"]', {
      hasText: "Seeded failed run for diagnostics assertions.",
    });
    await expect(loadableRetryRow).toBeVisible();
    await loadableRetryRow.getByRole("button", { name: "Load for retry" }).click();

    await expect(page.getByText("Using stored test grid")).toBeVisible();
    await expect(page.getByRole("button", { name: "Submit Retry" })).toBeEnabled();

    await page.getByRole("button", { name: "Clear" }).click();
    await expect(page.getByText("Using stored test grid")).toHaveCount(0);
  });
});
