import { expect, test } from "@playwright/test";

async function openRunOpsForInfluence(page: Parameters<typeof test>[0]["page"], influenceId: string) {
  await page.goto("/admin/style-dna");
  await expect(page.getByRole("heading", { name: "Style DNA Studio" })).toBeVisible();
  await expect(page.getByText("Run Operations Log")).toBeVisible();

  const influenceSelect = page.locator("label:has-text('Style Influence (Target SREF)') select");
  await expect(influenceSelect).toBeVisible();
  await influenceSelect.selectOption(influenceId);
}

test.describe("Style DNA Studio run operations - filter and paging", () => {
  test("supports status transitions and paging controls", async ({ page }) => {
    await openRunOpsForInfluence(page, "si_playwright_seed");

    const statusFilter = page.getByTestId("run-status-filter");
    const limitSelect = page.getByTestId("run-limit-select");
    await expect(statusFilter).toBeVisible();
    await expect(limitSelect).toBeVisible();

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

    await statusFilter.selectOption("all");
    await expect(statusFilter).toHaveValue("all");
    await expect(pageIndicator).toHaveText(/^1\/\d+$/);
  });
});
