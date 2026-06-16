import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores([
    'dist/**',
    '**/dist/**',
    'output/**',
    '**/output/**',
    'server/photoshop/**',
    'test-results/**',
    'tests/**',
    '.qwen/**',
    '.superpowers/**',
    '.trae/**',
    '3-字体/**',
    'Antigravity-Manager/**',
    '_git_ref_local/**',
    'agent-browser/**',
    'psd-to-ecommerce-new/**',
    '套图素材/**',
    '已做好的款可参考/**',
  ]),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_' }],
    },
  },
])
