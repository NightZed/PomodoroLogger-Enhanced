import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import path from 'path';

type ReleaseType = 'major' | 'minor' | 'patch' | null;
type PluginConfig = { preset: string };
type VerifierResult = {
    types: Record<string, ReleaseType>;
    hasBreakingChanges: boolean;
    hasCommitLink: boolean;
};

const rootDir = path.resolve(__dirname, '..');
const releaseConfig = JSON.parse(readFileSync(path.join(rootDir, '.releaserc.json'), 'utf8')) as {
    plugins: Array<string | [string, PluginConfig]>;
};

const verifier = String.raw`
import fs from 'node:fs/promises';
import { analyzeCommits } from '@semantic-release/commit-analyzer';
import { generateNotes } from '@semantic-release/release-notes-generator';

const config = JSON.parse(await fs.readFile('.releaserc.json', 'utf8'));
const logger = { log() {}, error() {}, success() {} };
const messages = {
    headerBang: 'fix(electron)!: migrate to Electron 39 APIs and fix build toolchain',
    bodyBreaking:
        'fix(electron): migrate to Electron 39 APIs and fix build toolchain\n\nBREAKING CHANGE: Electron 39 requires newer native integrations',
    plainFix: 'fix(electron): migrate to Electron 39 APIs and fix build toolchain',
};
const types = {};
for (const [label, message] of Object.entries(messages)) {
    types[label] = await analyzeCommits(config.plugins[0][1], {
        cwd: process.cwd(),
        logger,
        commits: [{ hash: label, message }],
    });
}

const notes = await generateNotes(config.plugins[1][1], {
    cwd: process.cwd(),
    logger,
    commits: [{ hash: '1da16c5', message: messages.headerBang }],
    lastRelease: {
        gitTag: 'v0.16.0',
        gitHead: 'bf399292784531ed572649b18b116b1c50980941',
    },
    nextRelease: {
        version: '1.0.0',
        gitTag: 'v1.0.0',
        gitHead: '1da16c56ecb26672ee21c78a58f4fd68daa12582',
    },
    options: {
        repositoryUrl: 'https://github.com/NightZed/PomodoroLogger-Enhanced',
    },
});

process.stdout.write(
    JSON.stringify({
        types,
        hasBreakingChanges: notes.includes('BREAKING CHANGES'),
        hasCommitLink: notes.includes('1da16c5'),
    })
);
`;

function runVerifier(): VerifierResult {
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', verifier], {
        cwd: rootDir,
        encoding: 'utf8',
    });

    return JSON.parse(output) as VerifierResult;
}

describe('semantic-release configuration', () => {
    it('uses the Conventional Commits preset for analysis and release notes', () => {
        expect(releaseConfig.plugins).toEqual([
            ['@semantic-release/commit-analyzer', { preset: 'conventionalcommits' }],
            ['@semantic-release/release-notes-generator', { preset: 'conventionalcommits' }],
            '@semantic-release/github',
        ]);
    });

    it('classifies breaking headers, breaking footers, and fixes correctly', () => {
        const result = runVerifier();

        expect(result.types).toEqual({
            headerBang: 'major',
            bodyBreaking: 'major',
            plainFix: 'patch',
        });
        expect(result.hasBreakingChanges).toBe(true);
        expect(result.hasCommitLink).toBe(true);
    });
});
