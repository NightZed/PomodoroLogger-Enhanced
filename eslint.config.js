/**
 * ESLint flat config, replacing tslint (which does not support TypeScript 5).
 *
 * The rule set starts from the recommended JavaScript + TypeScript rules and
 * deliberately keeps the stylistic rules quiet: formatting is owned by prettier
 * (`eslint-config-prettier`), and the renderer talks to Electron/remote objects
 * that are typed as `any`, so `no-explicit-any` would only produce noise.
 */
const js = require('@eslint/js');
const globals = require('globals');
const tseslint = require('typescript-eslint');
const react = require('eslint-plugin-react');
const reactHooks = require('eslint-plugin-react-hooks');
const prettier = require('eslint-config-prettier/flat');

module.exports = tseslint.config(
    {
        ignores: [
            'dist/**',
            'release/**',
            'coverage/**',
            'webpack-visualization/**',
            'db/**',
            'db-bk/**',
            '__test__db/**',
            '__test__screenshots/**',
            'screenshots/**',
            'public/**',
            'node_modules/**'
        ]
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        // Plain Node scripts that lint-staged can hand to eslint (jest setup
        // files, mock helpers): no DOM, CommonJS modules, no TS-only rules.
        files: ['test/**/*.js', 'mocks/**/*.js', '__mocks__/**/*.js'],
        languageOptions: {
            globals: {
                ...globals.node,
                ...globals.commonjs
            }
        },
        rules: {
            '@typescript-eslint/no-require-imports': 'off',
            '@typescript-eslint/no-var-requires': 'off'
        }
    },
    {
        files: ['src/**/*.{ts,tsx}', 'test/**/*.ts', 'mocks/**/*.ts'],
        languageOptions: {
            globals: {
                ...globals.node,
                ...globals.browser,
                ...globals.jest
            },
            parserOptions: {
                ecmaFeatures: { jsx: true }
            }
        },
        plugins: {
            react,
            'react-hooks': reactHooks
        },
        settings: {
            react: { version: 'detect' }
        },
        rules: {
            // TypeScript takes care of unknown identifiers (and knows the globals
            // of every environment this project runs in).
            'no-undef': 'off',
            'no-empty': ['error', { allowEmptyCatch: true }],
            // The rules below are newly enforced by eslint: tslint never checked
            // them and the existing code violates them in places that are
            // unrelated to this migration, so they start as warnings.
            'no-useless-escape': 'warn',
            'no-control-regex': 'warn',
            '@typescript-eslint/no-unused-expressions': 'warn',
            '@typescript-eslint/no-unused-vars': [
                'warn',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    caughtErrors: 'none'
                }
            ],
            'react-hooks/rules-of-hooks': 'warn',
            'react-hooks/exhaustive-deps': 'warn',
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-unsafe-function-type': 'off',
            '@typescript-eslint/no-empty-function': 'off',
            '@typescript-eslint/no-non-null-assertion': 'off',
            '@typescript-eslint/ban-ts-comment': 'off',
            '@typescript-eslint/no-var-requires': 'off',
            '@typescript-eslint/no-require-imports': 'off'
        }
    },
    prettier
);
