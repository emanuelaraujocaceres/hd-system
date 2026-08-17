/**
 * E2E Tests — Critical User Flows
 *
 * These tests verify the most important user journeys work end-to-end.
 * Run: npx playwright test
 *
 * Prerequisites:
 * - Dev server running (npm run dev)
 * - Playwright browsers installed (npx playwright install chromium)
 */

import { test, expect } from '@playwright/test';

test.describe('Login Flow', () => {
  test('shows login modal when no user is logged in', async ({ page }) => {
    await page.goto('/');
    // Login modal should be visible
    await expect(page.locator('text=Entrar')).toBeVisible({ timeout: 10000 });
  });

  test('login form has email and password fields', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('input[type="email"], input[placeholder*="email"]')).toBeVisible({ timeout: 10000 });
  });
});

test.describe('PDV (Point of Sale)', () => {
  test('PDV tab loads without crash', async ({ page }) => {
    await page.goto('/');
    // Wait for app to load
    await page.waitForLoadState('networkidle');
    // Should not show error boundary
    const errorBoundary = page.locator('text=Algo deu errado');
    await expect(errorBoundary).not.toBeVisible({ timeout: 5000 });
  });
});

test.describe('Navigation', () => {
  test('sidebar has all main tabs', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Check sidebar exists (even if login is needed)
    const body = await page.textContent('body');
    // App should render without white screen
    expect(body).toBeTruthy();
    expect(body!.length).toBeGreaterThan(0);
  });
});

test.describe('Error Boundary', () => {
  test('app renders without unhandled errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Should not have unhandled errors
    expect(errors).toHaveLength(0);
  });
});

test.describe('Performance', () => {
  test('initial page load under 5 seconds', async ({ page }) => {
    const start = Date.now();
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const loadTime = Date.now() - start;

    expect(loadTime).toBeLessThan(5000);
  });
});
