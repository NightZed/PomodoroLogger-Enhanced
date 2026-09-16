const common = {
    "transform": {
        "^.+\\.tsx?$": "ts-jest"
    },
    "moduleFileExtensions": [
        "ts",
        "tsx",
        "js",
        "json",
        "node"
    ],
    "moduleNameMapper": {
        "\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga|dat)$": "<rootDir>/__mocks__/fileMock.js",
        "\\.(s?css|sass)$": "<rootDir>/__mocks__/styleMock.js",
        "^worker-loader!": "<rootDir>/__mocks__/workerMock.js",
    }
};

module.exports = {
    ...common,
    collectCoverage: true,
    // nedb@1.8.0 relies on util.isDate/util.isRegExp, which Node 22 removed.
    setupFiles: ['<rootDir>/test/util-legacy-shim.js'],
    testMatch: ['**/*.(spec|test).[jt]s?(x)'],
    transformIgnorePatterns: [ ],
    // nedb-based action tests are I/O heavy; give them room so a loaded machine
    // does not trip the default 5s per-test timeout
    testTimeout: 30000,
    globals: {
        'ts-jest': {
            diagnostics: false
        }
    },
    "roots": [
        "<rootDir>",
    ],
    "modulePaths": [
        "<rootDir>",
    ],
    "moduleDirectories": [
        "node_modules"
    ],
    // For Circle CI
    reporters: ["default", "jest-junit"],
};
