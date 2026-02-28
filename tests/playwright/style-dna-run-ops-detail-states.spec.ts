import { expect, test } from "@playwright/test";

async function openRunOpsForInfluence(page: Parameters<typeof test>[0]["page"], influenceId: string) {
  await page.goto("/admin/style-dna");
  await expect(page.getByRole("heading", { name: "Style DNA Studio" })).toBeVisible();
  await expect(page.getByText("Run Operations Log")).toBeVisible();

  const influenceSelect = page.locator("label:has-text('Style Influence (Target SREF)') select");
  await expect(influenceSelect).toBeVisible();
  await influenceSelect.selectOption(influenceId);
}

test.describe("Style DNA Studio run operations - detail states", () => {
  test("shows failed-run diagnostics in selected details and modal", async ({ page }) => {
    await openRunOpsForInfluence(page, "si_playwright_seed");

    const statusFilter = page.getByTestId("run-status-filter");
    await statusFilter.selectOption("failed");
    await expect(statusFilter).toHaveValue("failed");

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
  });

  test("shows successful-run canonical traits and empty influence state", async ({ page }) => {
    await openRunOpsForInfluence(page, "si_playwright_seed");

    const statusFilter = page.getByTestId("run-status-filter");
    await statusFilter.selectOption("succeeded");
    await expect(statusFilter).toHaveValue("succeeded");

    const firstSucceededRow = page.getByTestId("run-row").first();
    await firstSucceededRow.click();
    await expect(firstSucceededRow).toHaveAttribute("data-selected", "true");

    const selectedDetails = page.getByTestId("selected-run-details");
    await expect(selectedDetails).toBeVisible();
    await expect(selectedDetails.getByText("Vibe Shift:")).toBeVisible();
    await expect(selectedDetails.getByText("DNA Tags:")).toBeVisible();
    await expect(selectedDetails.getByText("Delta Strength:")).toBeVisible();

    const influenceSelect = page.locator("label:has-text('Style Influence (Target SREF)') select");
    await influenceSelect.selectOption("si_playwright_empty");

    await expect(page.getByText("No runs found for this influence.")).toBeVisible();
    await expect(page.getByTestId("run-row")).toHaveCount(0);
    await expect(page.getByTestId("selected-run-details")).toHaveCount(0);
  });
});
