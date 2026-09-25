module.exports = {
    collectCoverage: true,
    // nedb@1.8.0 relies on util.isDate/util.isRegExp, which Node 23+ removed.
    setupFiles: ['<rootDir>/test/util-legacy-shim.js'],
    // jest 27+ defaults to the node environment, but the component tests need a DOM.
    testEnvironment: 'jsdom',
    testMatch: ['**/*.(spec|test).[jt]s?(x)'],
    transform: {
        '^.+\\.tsx?$': ['ts-jest', { diagnostics: false }]
    },
    transformIgnorePatterns: [],
    moduleFileExtensions: ['ts', 'tsx', 'js', 'json', 'node'],
    moduleNameMapper: {
        '\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga|dat)$':
            '<rootDir>/__mocks__/fileMock.js',
        '\\.(s?css|sass)$': '<rootDir>/__mocks__/styleMock.js',
        '^worker-loader!': '<rootDir>/__mocks__/workerMock.js'
    },
    // nedb-based action tests are I/O heavy; give them room so a loaded machine
    // does not trip the default 5s per-test timeout
    testTimeout: 30000,
    // ts-jest source maps report sources as `file:/D:/...` URLs on Windows, and
    // the default `lcov` reporter (lcov + html) then tries to create directories
    // containing `:` and fails with "Path contains invalid characters".
    // Nothing consumes the HTML report (locally or in CI), so emit flat files only.
    coverageReporters: ['text', 'lcovonly', 'json-summary'],
    roots: ['<rootDir>'],
    modulePaths: ['<rootDir>'],
    moduleDirectories: ['node_modules'],
    // For Circle CI
    reporters: ['default', 'jest-junit']
};
