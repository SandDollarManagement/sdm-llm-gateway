// CommonJS spec (JS-only project). Basic smoke: the app boots and the root responds.
const { test, expect } = require('@playwright/test')

test('gateway root responds', async ({ page }) => {
  const res = await page.goto('/')
  expect(res, 'expected an HTTP response from /').toBeTruthy()
})
