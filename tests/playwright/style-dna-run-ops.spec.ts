import { expect, test } from "@playwright/test";

test.describe("Style DNA Studio run operations", () => {
  test("covers run-ops paging, filter transitions, disable reasons, and failure diagnostics", async ({ page }) => {
    await page.goto("/admin/style-dna");

    await expect(page.getByRole("heading", { name: "Style DNA Studio" })).toBeVisible();
    await expect(page.getByText("Run Operations Log")).toBeVisible();

    const influenceSelect = page.locator("label:has-text('Style Influence (Target SREF)') select");
    await expect(influenceSelect).toBeVisible();
    await influenceSelect.selectOption("si_playwright_seed");

    const statusFilter = page.getByTestId("run-status-filter");
    const limitSelect = page.getByTestId("run-limit-select");
    await expect(statusFilter).toBeVisible();
    await expect(limitSelect).toBeVisible();

    await statusFilter.selectOption("succeeded");
    await expect(statusFilter).toHaveValue("succeeded");
    await limitSelect.selectOption("20");
    await expect(limitSelect).toHaveValue("20");

    await statusFilter.selectOption("all");
    await expect(statusFilter).toHaveValue("all");

    const runRows = page.getByTestId("run-row");
    await expect(runRows).toHaveCount(10);

    const pageIndicator = page.getByTestId("run-page-indicator");
    await expect(pageIndicator).toHaveText(/^1\/\d+$/);
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(pageIndicator).toHaveText(/^2\/\d+$/);
    const secondPageCount = await runRows.count();
    expect(secondPageCount).toBeGreaterThan(0);
    expect(secondPageCount).toBeLessThanOrEqual(10);
    await page.getByRole("button", { name: "Prev", exact: true }).click();
    await expect(pageIndicator).toHaveText(/^1\/\d+$/);

    await statusFilter.selectOption("failed");
    await expect(statusFilter).toHaveValue("failed");
    await expect.poll(async () => runRows.count()).toBeGreaterThanOrEqual(2);

    const retryDisabledRow = page.locator('[data-testid="run-row"]', {
      hasText: "Seeded failed run without test grid reference.",
    });
    const retryDisabledWrapper = retryDisabledRow.locator('div[title*="Retry unavailable: Test grid reference is missing."]');
    await expect(retryDisabledWrapper).toBeVisible();
    await expect(retryDisabledWrapper.getByRole("button", { name: "Load for retry" })).toBeDisabled();

    const diagnosticsFailedRow = page.locator('[data-testid="run-row"]', {
      hasText: "Seeded failed run for diagnostics assertions.",
    });
    await diagnosticsFailedRow.click();
    await expect(diagnosticsFailedRow).toHaveAttribute("data-selected", "true");

    await expect(page.getByTestId("selected-run-details")).toBeVisible();
    await expect(page.getByText("Run failed before result payload was persisted.")).toBeVisible();

    const viewDetails = page.getByTestId("view-run-details");
    await expect(viewDetails).toBeVisible();
    await viewDetails.click();

    const modal = page.getByTestId("run-detail-modal");
    await expect(modal).toBeVisible();
    await expect(modal.getByText("Run Detail")).toBeVisible();
    await expect(modal.getByText("Error code:")).toBeVisible();
    await expect(modal.getByText("PLAYWRIGHT_SIMULATED_FAILURE")).toBeVisible();
    await expect(modal.getByText("Seeded failed run for diagnostics assertions.")).toBeVisible();
    await page.getByRole("button", { name: "Close" }).click();
    await expect(modal).toHaveCount(0);

    await statusFilter.selectOption("all");
    await expect(statusFilter).toHaveValue("all");
    await expect(pageIndicator).toHaveText(/^1\/\d+$/);
  });
});
