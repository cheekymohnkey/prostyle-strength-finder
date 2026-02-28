import { expect, test } from "@playwright/test";

test.describe("Style DNA Studio run operations", () => {
  test("supports run operations interactions when run rows are present", async ({ page }) => {
    await page.goto("/admin/style-dna");

    await expect(page.getByRole("heading", { name: "Style DNA Studio" })).toBeVisible();
    await expect(page.getByText("Run Operations Log")).toBeVisible();

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
    const runRowCount = await runRows.count();
    test.skip(runRowCount === 0, "No run rows available in current environment for modal interaction check.");

    const firstRow = runRows.first();
    await firstRow.click();
    await expect(firstRow).toHaveAttribute("data-selected", "true");

    await expect(page.getByTestId("selected-run-details")).toBeVisible();

    const viewDetails = page.getByTestId("view-run-details");
    await expect(viewDetails).toBeVisible();
    await viewDetails.click();

    const modal = page.getByTestId("run-detail-modal");
    await expect(modal).toBeVisible();
    await expect(modal.getByText("Run Detail")).toBeVisible();
    await page.getByRole("button", { name: "Close" }).click();
    await expect(modal).toHaveCount(0);
  });
});
