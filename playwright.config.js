import fs from 'fs'
import path from 'path'
import { defineConfig } from '@playwright/test'

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
const resolvedExecutablePath = envPath && fs.existsSync(envPath)
  ? envPath
  : candidates.find((p) => fs.existsSync(p))

export default defineConfig({
  testDir: './tests/playwright',
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:3001',
    headless: true,
    ...(resolvedExecutablePath ? { launchOptions: { executablePath: resolvedExecutablePath } } : {}),
  },
  webServer: {
    command: 'node server/index.js',
    url: 'http://127.0.0.1:3001/health',
    reuseExistingServer: true,
    timeout: 120000,
  },
})
