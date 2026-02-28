import { expect, test } from "@playwright/test";
import {
  getLimitSelect,
  getPageIndicator,
  getRunRows,
  getStatusFilter,
  openRunOpsForInfluence,
  selectStatus,
} from "./support/run-ops-helpers";

test.describe("Style DNA Studio run operations - filter and paging", () => {
  test("supports status transitions and paging controls", async ({ page }) => {
    await openRunOpsForInfluence(page, "si_playwright_seed");

    const statusFilter = getStatusFilter(page);
    const limitSelect = getLimitSelect(page);
    await expect(statusFilter).toBeVisible();
    await expect(limitSelect).toBeVisible();

    await limitSelect.selectOption("20");
    await expect(limitSelect).toHaveValue("20");

    await selectStatus(page, "all");

    const runRows = getRunRows(page);
    await expect(runRows).toHaveCount(10);

    const pageIndicator = getPageIndicator(page);
    await expect(pageIndicator).toHaveText(/^1\/\d+$/);

    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(pageIndicator).toHaveText(/^2\/\d+$/);
    const secondPageCount = await runRows.count();
    expect(secondPageCount).toBeGreaterThan(0);
    expect(secondPageCount).toBeLessThanOrEqual(10);

    await page.getByRole("button", { name: "Prev", exact: true }).click();
    await expect(pageIndicator).toHaveText(/^1\/\d+$/);

    await selectStatus(page, "failed");
    await expect.poll(async () => runRows.count()).toBeGreaterThanOrEqual(2);

    await selectStatus(page, "all");
    await expect(pageIndicator).toHaveText(/^1\/\d+$/);
  });

  test("supports queued and in-progress filters and resets paging on filter change", async ({ page }) => {
    await openRunOpsForInfluence(page, "si_playwright_seed");

    const statusFilter = getStatusFilter(page);
    await expect(statusFilter).toBeVisible();

    const runRows = getRunRows(page);
    const pageIndicator = getPageIndicator(page);

    await selectStatus(page, "all");
    await expect(runRows).toHaveCount(10);

    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(pageIndicator).toHaveText(/^2\/\d+$/);

    await selectStatus(page, "queued");
    await expect.poll(async () => runRows.count()).toBe(1);
    await expect(pageIndicator).toHaveText(/^1\/1$/);

    await selectStatus(page, "in_progress");
    await expect.poll(async () => runRows.count()).toBe(1);
    await expect(pageIndicator).toHaveText(/^1\/1$/);

    await selectStatus(page, "all");
    await expect(pageIndicator).toHaveText(/^1\/\d+$/);
  });

  test("resets paging when fetch limit changes", async ({ page }) => {
    await openRunOpsForInfluence(page, "si_playwright_seed");

    const statusFilter = getStatusFilter(page);
    const limitSelect = getLimitSelect(page);
    const runRows = getRunRows(page);
    const pageIndicator = getPageIndicator(page);

    await selectStatus(page, "all");

    await limitSelect.selectOption("20");
    await expect(limitSelect).toHaveValue("20");
    await expect(runRows).toHaveCount(10);

    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(pageIndicator).toHaveText(/^2\/\d+$/);

    await limitSelect.selectOption("50");
    await expect(limitSelect).toHaveValue("50");
    await expect(pageIndicator).toHaveText(/^1\/\d+$/);

    const refreshedCount = await runRows.count();
    expect(refreshedCount).toBeGreaterThan(0);
    expect(refreshedCount).toBeLessThanOrEqual(10);
  });
});
