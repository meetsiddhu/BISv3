import cds from '@sap/cds/eslint.config.mjs'
import cdsPlugin from '@sap/eslint-plugin-cds'

export default [
  ...cds.recommended,
  cdsPlugin.configs.recommended,
  {
    ignores: [
      '**/dist/**',
      '**/Component-preload.js',
      '**/webapp/lib/**',
      '**/webapp/vendor/**',
      'gen/**'
    ]
  },
  {
    // Idiomatic intentional-ignore convention: a leading underscore on a param, var, or
    // caught error signals "deliberately unused" (e.g. fixed handler signatures, catches
    // that intentionally swallow). Genuinely-dead names without the prefix still warn.
    rules: {
      'no-unused-vars': ['warn', {
        args: 'after-used',
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrors: 'all',
        caughtErrorsIgnorePattern: '^_'
      }]
    }
  },
  {
    // Developer/CLI tooling (data generators, seeders, CSV rebuilders) — console output
    // is their intended interface, not a code smell.
    files: ['scripts/**/*.js'],
    rules: { 'no-console': 'off' }
  },
  {
    files: ['app/**/webapp/**/*.js'],
    languageOptions: {
      globals: {
        alert: 'readonly',
        Blob: 'readonly',
        Event: 'readonly',
        FileReader: 'readonly',
        HBox: 'readonly',
        MutationObserver: 'readonly',
        navigator: 'readonly'
      }
    },
    rules: {
      // An empty catch is an explicit "intentionally ignore" in UI event code.
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-useless-assignment': 'warn'
    }
  }
]
