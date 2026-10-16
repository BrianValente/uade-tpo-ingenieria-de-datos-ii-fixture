import js from '@eslint/js'
import { defineConfig } from 'eslint/config'
import prettier from 'eslint-config-prettier/flat'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default defineConfig(
  { ignores: ['node_modules/**', 'dist/**', 'coverage/**'] },
  {
    files: ['**/*.{ts,mjs}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  prettier,
)
