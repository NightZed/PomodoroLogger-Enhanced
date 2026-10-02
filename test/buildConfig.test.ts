import { readdirSync, readFileSync, statSync } from 'fs';
import { builtinModules } from 'module';
import path from 'path';

const rootDir = path.resolve(__dirname, '..');

type BuildConfig = {
    files: string[];
    asarUnpack: string[];
};

const pkg = JSON.parse(readFileSync(path.join(rootDir, 'package.json'), 'utf8')) as {
    build: BuildConfig;
};

// active-win resolves its native addon through @mapbox/node-pre-gyp when
// `lib/windows-binding.js` is loaded. That require is a *runtime* dependency of
// the packaged app, so `build.files` must not exclude it.
//
// Regression: v0.17.0 added the exclusion glob for node_modules/@mapbox while
// slimming the package (see build.files in package.json). The installed app
// then failed `initActiveWin()` with MODULE_NOT_FOUND, `activeWin()` returned
// undefined on every monitor tick, so every session was recorded with empty
// `apps` / `switchActivities` /
// `stayTimeInSecond` -- a blank Sankey diagram in History, with no error
// anywhere (packaged builds have no console).
function collectRuntimeDependencies(): string[] {
    const names = new Set<string>();
    const sources = [
        'index.js',
        path.join('lib', 'windows.js'),
        path.join('lib', 'windows-binding.js'),
    ];
    const requirePattern = /require\(\s*(['"])([^'"]+)\1\s*\)/g;

    for (const file of sources) {
        const fullPath = path.join(rootDir, 'node_modules', 'active-win', file);
        const source = readFileSync(fullPath, 'utf8');
        let match: RegExpExecArray | null;
        while ((match = requirePattern.exec(source)) !== null) {
            const request = match[2];
            if (request.startsWith('.') || request.startsWith('node:')) {
                continue;
            }

            const segments = request.split('/');
            const packageName = request.startsWith('@')
                ? segments.slice(0, 2).join('/')
                : segments[0];
            if (builtinModules.includes(packageName)) {
                continue;
            }

            names.add(packageName);
        }
    }

    return Array.from(names).sort();
}

// `files` may still exclude parts of a package (Sources, tests, ...); only a
// pattern that removes the package directory itself breaks the require.
// Handles the two shapes used in this repo: `!` + `**/node_modules/foo{,/**}`
// and `!` + `**/node_modules/foo/**`.
function excludesWholePackage(pattern: string, packageName: string): boolean {
    if (!pattern.startsWith('!')) {
        return false;
    }

    const glob = pattern
        .slice(1)
        .replace(/\{,\/\*\*\}$/, '')
        .replace(/\/\*\*$/, '');
    const target = `node_modules/${packageName}`;
    return glob === target || glob.endsWith(`/${target}`);
}

function packageIsInstalled(packageName: string): boolean {
    const candidates = [
        path.join(rootDir, 'node_modules', packageName),
        path.join(rootDir, 'node_modules', 'active-win', 'node_modules', packageName),
    ];
    return candidates.some((dir) => {
        try {
            return statSync(path.join(dir, 'package.json')).isFile();
        } catch (e) {
            return false;
        }
    });
}

function findNativeBindings(dir: string, found: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        const fullPath = path.join(dir, entry);
        if (statSync(fullPath).isDirectory()) {
            findNativeBindings(fullPath, found);
        } else if (entry.endsWith('.node')) {
            found.push(fullPath);
        }
    }

    return found;
}

describe('electron-builder packaging config', () => {
    const runtimeDependencies = collectRuntimeDependencies();

    it('loads every runtime dependency of active-win', () => {
        // windows-binding.js must find @mapbox/node-pre-gyp both in the working
        // tree and in the shipped package.
        expect(runtimeDependencies).toContain('@mapbox/node-pre-gyp');

        for (const dependency of runtimeDependencies) {
            expect({ dependency, installed: packageIsInstalled(dependency) }).toEqual({
                dependency,
                installed: true,
            });
        }
    });

    it('does not exclude active-win runtime dependencies from the package', () => {
        for (const dependency of runtimeDependencies) {
            const exclusions = pkg.build.files.filter((pattern) =>
                excludesWholePackage(pattern, dependency)
            );
            expect({ dependency, exclusions }).toEqual({ dependency, exclusions: [] });
        }
    });

    it('keeps the native addon loadable from the asar', () => {
        // `.node` files live outside the asar so process.dlopen can map them,
        // and active-win's platform binary (`main` on macOS) is spawned as a
        // separate process, so it cannot run from inside the archive either.
        expect(pkg.build.asarUnpack).toContain('**/*.node');
        expect(pkg.build.asarUnpack).toContain('**/node_modules/active-win/main');

        const bindings = findNativeBindings(path.join(rootDir, 'node_modules', 'active-win'));
        expect(bindings.length).toBeGreaterThan(0);
    });
});
