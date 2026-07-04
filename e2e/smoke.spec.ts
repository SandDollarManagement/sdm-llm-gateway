import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('home page loads and has no critical accessibility violations', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/.+/)
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const critical = results.violations.filter((v) => v.impact === 'critical')
  expect(critical).toEqual([])
})
