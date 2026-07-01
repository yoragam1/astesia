# E2E Testing Strategy

## 1. Metadata
- **Name:** `e2e-testing`
- **Origin:** `Astesia Core`
- **Description:** `Defines the strategy and standards for End-to-End testing using tools like Playwright to simulate actual user behavior.`

## 2. When to Use
Invoke this skill in the **Quality Layer** when generating integration and E2E test suites after the Engineering layer has completed feature implementation.

## 3. Practical Guidance
1. **User Simulation:** E2E tests must simulate the user exactly as they would interact with the application. Use locators based on accessibility roles (e.g., `getByRole('button', { name: 'Submit' })`) rather than CSS selectors or test IDs whenever possible.
2. **Focus on CUJs:** Do not write E2E tests for every minor edge case. Focus E2E tests strictly on the Critical User Journeys (CUJs) defined in the `.astesia/brd.md`. Leave edge cases to unit tests.
3. **Data State Management:** Tests must be deterministic. Explicitly define whether the tests run against a dedicated staging database (requiring setup/teardown scripts) or use mocked API responses.
4. **Page Object Model (POM):** For complex applications, organize tests using the Page Object Model pattern to keep test files clean and maintainable.

## 4. Tested Examples

### ✅ Gold Standard: Playwright E2E Test Structure
```typescript
import { test, expect } from '@playwright/test';

test.describe('E-Commerce Checkout (CUJ)', () => {
  // Test data setup runs before the journey begins
  test.beforeEach(async ({ page }) => {
    // Optionally seed database or mock API here
  });

  test('Guest can purchase a t-shirt successfully', async ({ page }) => {
    // 1. Navigate to catalog
    await page.goto('/catalog');
    
    // 2. Select item using accessible locators
    await page.getByRole('link', { name: 'Black T-Shirt' }).click();
    await page.getByRole('button', { name: 'Add to Cart' }).click();
    
    // 3. Checkout process
    await page.getByRole('link', { name: 'Cart' }).click();
    await page.getByRole('button', { name: 'Checkout as Guest' }).click();
    
    // 4. Fill form
    await page.getByLabel('Email Address').fill('guest@example.com');
    await page.getByRole('button', { name: 'Place Order' }).click();
    
    // 5. Verification
    await expect(page.getByRole('heading', { name: 'Order Confirmed' })).toBeVisible();
    await expect(page.getByText('Your order ID is')).toBeVisible();
  });
});
```
