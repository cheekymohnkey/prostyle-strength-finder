import { expect, type Locator, type Page } from "@playwright/test";

export async function openRunOpsForInfluence(page: Page, influenceId: string): Promise<void> {
  await page.goto("/admin/style-dna");
  await expect(page.getByRole("heading", { name: "Style DNA Studio" })).toBeVisible();
  await expect(page.getByText("Run Operations Log")).toBeVisible();
  await selectInfluence(page, influenceId);
}

export async function selectInfluence(page: Page, influenceId: string): Promise<void> {
  const influenceSelect = page.locator("label:has-text('Style Influence (Target SREF)') select");
  await expect(influenceSelect).toBeVisible();
  await influenceSelect.selectOption(influenceId);
}

export function getStatusFilter(page: Page): Locator {
  return page.getByTestId("run-status-filter");
}

export function getLimitSelect(page: Page): Locator {
  return page.getByTestId("run-limit-select");
}

export function getRunRows(page: Page): Locator {
  return page.getByTestId("run-row");
}

export function getPageIndicator(page: Page): Locator {
  return page.getByTestId("run-page-indicator");
}

export function getRefreshRunsButton(page: Page): Locator {
  return page.getByRole("button", { name: "Refresh runs" });
}

export async function selectStatus(page: Page, status: "all" | "queued" | "in_progress" | "succeeded" | "failed"): Promise<void> {
  const statusFilter = getStatusFilter(page);
  await statusFilter.selectOption(status);
  await expect(statusFilter).toHaveValue(status);
}

export function runRowByText(page: Page, text: string): Locator {
  return page.locator('[data-testid="run-row"]', { hasText: text });
}

export async function openRunDetailModal(page: Page): Promise<void> {
  const viewDetails = page.getByTestId("view-run-details");
  await expect(viewDetails).toBeVisible();
  await viewDetails.click();
  await expect(page.getByTestId("run-detail-modal")).toBeVisible();
}

export async function closeRunDetailModalWithButton(page: Page): Promise<void> {
  const modal = page.getByTestId("run-detail-modal");
  await page.getByRole("button", { name: "Close" }).click();
  await expect(modal).toHaveCount(0);
}
