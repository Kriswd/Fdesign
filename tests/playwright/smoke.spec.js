import fs from 'fs'
import path from 'path'
import { test, expect } from '@playwright/test'

const envPath = String(process.env.PLAYWRIGHT_EXECUTABLE_PATH || '').trim()
const bases = [
  String(process.env.PROGRAMFILES || ''),
  String(process.env.ProgramFiles || ''),
  String(process.env['PROGRAMFILES(X86)'] || ''),
  String(process.env['ProgramFiles(x86)'] || ''),
  String(process.env.LOCALAPPDATA || ''),
].filter(Boolean)
const candidates = []
for (const base of bases) {
  candidates.push(path.join(base, 'Google/Chrome/Application/chrome.exe'))
  candidates.push(path.join(base, 'Microsoft/Edge/Application/msedge.exe'))
}
const hasBrowser = (envPath && fs.existsSync(envPath)) || candidates.some((p) => fs.existsSync(p))
const maybeTest = hasBrowser ? test : test.skip

test('健康检查可用', async ({ request }) => {
  const resp = await request.get('/health')
  expect(resp.ok()).toBeTruthy()
  const data = await resp.json()
  expect(data && data.status).toBe('ok')
})

maybeTest('主页可访问', async ({ page }) => {
  const resp = await page.goto('/')
  expect(resp && resp.ok()).toBeTruthy()
  const html = await page.content()
  expect(html.length).toBeGreaterThan(100)
})
