import { expect, test } from "@playwright/test";

test.describe("Style DNA Studio run operations", () => {
  test("opens studio and can open run detail modal when rows exist", async ({ page }) => {
    await page.goto("/admin/style-dna");

    await expect(page.getByRole("heading", { name: "Style DNA Studio" })).toBeVisible();
    await expect(page.getByText("Run Operations Log")).toBeVisible();

    const runRows = page.getByRole("button", { name: "Load for retry" });
    const runRowCount = await runRows.count();
    test.skip(runRowCount === 0, "No run rows available in current environment for modal interaction check.");

    await runRows.first().click();
    const viewDetails = page.getByRole("button", { name: "View details" });
    await expect(viewDetails).toBeVisible();
    await viewDetails.click();

    await expect(page.getByText("Run Detail")).toBeVisible();
    await page.getByRole("button", { name: "Close" }).click();
    await expect(page.getByText("Run Detail")).toHaveCount(0);
  });
});
