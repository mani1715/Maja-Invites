import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const ARTIFACTS_DIR = 'C:/Users/ettel/.gemini/antigravity/brain/91d5b73b-1564-49c0-a361-6e1d8f2f11a6';

test.describe('Create Gallery Workflow Page', () => {
  test('Step 1 to Step 4 visual walkthrough', async ({ page }) => {
    // 1. Log in as test photographer
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('http://localhost:8127/auth');

    // Sign in form
    await page.fill('input[type="email"]', 'test.studio@maja.test');
    await page.fill('input[type="password"]', 'MajaTest@123');
    await page.click('button[type="submit"]');

    // Wait until logged in and navigate to /studio/invitations?tab=gallery
    await page.waitForURL((url) => !url.pathname.includes('/auth'), { timeout: 15000 });
    await page.goto('http://localhost:8127/studio/invitations?tab=gallery');
    await page.waitForTimeout(2000);

    // Verify "+ Create Gallery" links to /studio/galleries/new
    const createBtn = page.locator('a[href="/studio/galleries/new"]').first();
    await expect(createBtn).toBeVisible();

    // Take screenshot of StudioInvitations showing the dedicated link
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'screenshot_step0_invitations_gallery_tab.png'), fullPage: false });

    // Click to navigate to /studio/galleries/new
    await createBtn.click();
    await page.waitForURL('**/studio/galleries/new', { timeout: 10000 });
    await page.waitForTimeout(1000);

    // Capture Step 1 Desktop
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'screenshot_step1_details_desktop.png'), fullPage: true });

    // Capture Step 1 Mobile (390px)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'screenshot_step1_details_mobile_390.png'), fullPage: true });

    // Switch back to desktop
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(500);

    // Fill Step 1 details
    await page.fill('input[placeholder="e.g. Diya & Kabir Royal Wedding"]', 'Ananya & Rohan Royal Celebration');
    await page.fill('input[placeholder="e.g. Kabir Sharma"]', 'Rohan Verma');
    await page.fill('input[type="date"]', '2026-11-28');

    // Click 180 Days option card
    await page.locator('.sgn-expiry-card').nth(1).click();

    // Click "Continue to Albums & Photos"
    await page.click('button:has-text("Continue to Albums & Photos")');
    await page.waitForTimeout(2500);

    // Now in Step 2: Albums & Photos
    // Add suggested albums
    const haldiChip = page.locator('button.sgn-chip:has-text("Haldi")');
    if (await haldiChip.isVisible()) {
      await haldiChip.click();
      await page.waitForTimeout(500);
    }
    const receptionChip = page.locator('button.sgn-chip:has-text("Reception")');
    if (await receptionChip.isVisible()) {
      await receptionChip.click();
      await page.waitForTimeout(500);
    }

    // Capture Step 2 Desktop
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'screenshot_step2_albums_photos_desktop.png'), fullPage: true });

    // Capture Step 2 Mobile
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'screenshot_step2_albums_photos_mobile_390.png'), fullPage: true });

    // Switch back to desktop and continue to Step 3
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(500);
    await page.click('button:has-text("Continue to Appearance")');
    await page.waitForTimeout(1000);

    // In Step 3: Appearance & Branding
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'screenshot_step3_appearance_desktop.png'), fullPage: true });

    // Capture Step 3 Mobile
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'screenshot_step3_appearance_mobile_390.png'), fullPage: true });

    // Switch back to desktop and continue to Step 4
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(500);
    await page.click('button:has-text("Continue to Review & Share")');
    await page.waitForTimeout(1000);

    // In Step 4: Review & Share
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'screenshot_step4_review_share_desktop.png'), fullPage: true });

    // Publish Gallery
    const publishBtn = page.locator('button:has-text("Publish Gallery Live")');
    if (await publishBtn.isVisible()) {
      await publishBtn.click();
      await page.waitForTimeout(2000);
    }

    // Capture Published Step 4 with live link & QR
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'screenshot_step4_published_desktop.png'), fullPage: true });

    // Capture Step 4 Mobile
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'screenshot_step4_published_mobile_390.png'), fullPage: true });
  });
});
