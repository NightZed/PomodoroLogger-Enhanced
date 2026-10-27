const os = require('os');

const babelJest = (presets) => [
    'babel-jest',
    {
        babelrc: false,
        configFile: false,
        presets,
    },
];

const nodeEnvPreset = ['@babel/preset-env', { targets: { node: 'current' }, modules: 'commonjs' }];
const typescriptPreset = ['@babel/preset-typescript', { onlyRemoveTypeImports: false }];

module.exports = {
    // Coverage instrumentation slows every suite down. Run `yarn test:coverage`
    // when a report is actually needed.
    collectCoverage: false,
    // Pins NODE_ENV=test and installs jsdom polyfills before any test module.
    setupFiles: ['<rootDir>/test/setup-env.js'],
    setupFilesAfterEnv: [
        '<rootDir>/test/react-act-environment.js',
        '<rootDir>/test/jsdom-compat.js',
        '<rootDir>/test/console-gate.js',
        '<rootDir>/test/dbBridge.ts',
    ],
    // jest 27+ defaults to the node environment, but the component tests need a DOM.
    testEnvironment: 'jsdom',
    // jest-environment-jsdom resolves package "exports" with the "browser"
    // condition, so dual ESM/CJS packages are resolved to their ESM entry
    // (nanoid -> index.browser.js, nanoid backs src/utils/uid.ts). Jest runs
    // tests in a CommonJS/Node-like runtime, so it then fails with
    // "Must use import to load ES Module". Resolve like Node does instead, which
    // picks the "require" (index.cjs) entry of such packages.
    testEnvironmentOptions: {
        customExportConditions: ['node'],
    },
    testMatch: ['**/*.(spec|test).[jt]s?(x)'],
    // TypeScript 7 has no JavaScript compiler API, so ts-jest cannot be used.
    // Babel strips the types for Jest; `yarn typecheck` is the type-checking
    // step (the previous ts-jest setup already had diagnostics disabled).
    //
    // Keep the transform options free of RegExp/function values: Jest sends the
    // project config to parallel workers with JSON serialization, which turns a
    // RegExp into `{}`. A `test` override would then fail Babel validation
    // ("overrides[0].test must be a string/Function/RegExp"), so `.ts` and `.tsx`
    // use separate transform entries instead of one transform with overrides.
    transform: {
        '^.+\\.tsx$': babelJest([nodeEnvPreset, typescriptPreset, '@babel/preset-react']),
        '^.+\\.ts$': babelJest([nodeEnvPreset, typescriptPreset]),
        // marked 18 and react-hotkeys-hook 5 are ESM-only (no CJS entry).
        // Jest's VM runtime cannot require() their ESM files directly, so
        // transpile those dependencies.
        'node_modules[/\\\\](marked|react-hotkeys-hook)[/\\\\].+\\.js$': babelJest([nodeEnvPreset]),
    },
    // Keep the default node_modules exclusion, but allow the ESM dependencies
    // above through the transform. Other dependencies stay untouched.
    transformIgnorePatterns: ['/node_modules/(?!(marked|react-hotkeys-hook)/)'],
    moduleFileExtensions: ['ts', 'tsx', 'js', 'json', 'node'],
    moduleNameMapper: {
        '\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga|dat)$':
            '<rootDir>/__mocks__/fileMock.js',
        '\\.(s?css|sass)$': '<rootDir>/__mocks__/styleMock.js',
        '(^|/)nativeWorkerFactory$': '<rootDir>/__mocks__/nativeWorkerFactory.js',
        // @ant-design/icons@6 ships dual ESM/CJS; force the CJS 'lib/' entry so
        // Jest's CommonJS runtime does not try to require() its ESM 'es/'
        // build (breaks under customExportConditions: ['node']).
        '^@ant-design/icons$': '<rootDir>/node_modules/@ant-design/icons/lib/index.js',
        // @ant-design/colors@v8 ships ESM 'es/'; icons@6 CJS build requires
        // '@ant-design/colors/es/generate', which breaks under Jest CJS.
        '^@ant-design/colors/es/generate$':
            '<rootDir>/node_modules/@ant-design/colors/lib/generate.js',
    },
    // Action tests exercise real SQLite transactions; give them room so a
    // loaded machine does not trip the default 5s per-test timeout.
    testTimeout: 30000,
    // Most of the wall time is jsdom/antd setup and timer waiting rather than
    // raw CPU work, so Jest's default (cores - 1) leaves a core idle. Use all
    // available cores, capped so a many-core machine does not spawn a worker
    // per test file.
    maxWorkers: Math.min(8, os.cpus().length),
    // Nothing consumes the HTML coverage report (locally or in CI), so emit flat
    // files only. This also avoids Windows-specific problems in reporters that
    // turn source paths into directories.
    coverageReporters: ['text', 'lcovonly', 'json-summary'],
    roots: ['<rootDir>'],
    modulePaths: ['<rootDir>'],
    moduleDirectories: ['node_modules'],
    // For Circle CI
    reporters: ['default', 'jest-junit'],
};
