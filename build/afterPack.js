'use strict';

/**
 * electron-builder afterPack hook.
 *
 * better-sqlite3 ships one prebuilt binary per platform/arch (8 in total) and
 * also ships its C sources (`deps/sqlite3.c` alone is ~9 MB) because the npm
 * package is meant to be built from source. Only the single
 * `prebuilds/<platform>-<arch>.node` file is ever loaded at runtime, so every
 * other prebuild can be dropped from the packaged app.
 *
 * The source/build inputs are already excluded by `build.files`; this hook only
 * has to remove the prebuilds for foreign platforms.
 */

const fs = require('fs');
const path = require('path');

/** Set to false to keep Electron's D3D12/Graphite shader compiler. */
const REMOVE_WINDOWS_D3D12_COMPILER = true;

function remove(target) {
    const stat = fs.existsSync(target) ? fs.lstatSync(target) : null;
    if (stat == null) {
        return 0;
    }
    const size = stat.isDirectory() ? directorySize(target) : stat.size;
    fs.rmSync(target, { recursive: true, force: true });
    return size;
}

function directorySize(dir) {
    let total = 0;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const child = path.join(dir, entry.name);
        total += entry.isDirectory() ? directorySize(child) : fs.lstatSync(child).size;
    }
    return total;
}

function pruneBetterSqlite3(unpackedDir, platform, arch) {
    const moduleDir = path.join(unpackedDir, 'node_modules', 'better-sqlite3');
    const prebuildsDir = path.join(moduleDir, 'prebuilds');
    if (!fs.existsSync(prebuildsDir)) {
        return 0;
    }

    // better-sqlite3 uses `linuxmusl-*` for musl-based distributions and a
    // `universal` macOS build contains both darwin slices.
    const keep = new Set();
    if (arch === 'universal') {
        keep.add('darwin-x64.node');
        keep.add('darwin-arm64.node');
    } else {
        keep.add(`${platform}-${arch}.node`);
        if (platform === 'linux') {
            keep.add(`linuxmusl-${arch}.node`);
        }
    }

    let removed = 0;
    for (const entry of fs.readdirSync(prebuildsDir, { withFileTypes: true })) {
        if (!keep.has(entry.name)) {
            removed += remove(path.join(prebuildsDir, entry.name));
        }
    }
    return removed;
}

function pruneWindowsGpuCompilers(appOutDir) {
    if (!REMOVE_WINDOWS_D3D12_COMPILER) {
        return 0;
    }

    // dxcompiler.dll/dxil.dll are the DXC shader compiler used by Dawn's D3D12
    // backend (WebGPU) and by Skia Graphite. Electron 44 reports
    // `skia_graphite: disabled_off` and uses ANGLE/D3D11, which needs
    // d3dcompiler_47.dll instead (also available in Windows' System32). This
    // app never uses WebGPU, so DXC is dead weight (~26 MB raw).
    //
    // Re-check this if Electron ever enables Skia Graphite by default.
    let removed = 0;
    for (const name of ['dxcompiler.dll', 'dxil.dll']) {
        removed += remove(path.join(appOutDir, name));
    }
    return removed;
}

exports.default = async function afterPack(context) {
    // electron-builder's Arch enum: 0=ia32, 1=x64, 2=armv7l, 3=arm64, 4=universal
    const arch = ['ia32', 'x64', 'armv7l', 'arm64', 'universal'][context.arch] || 'x64';
    const platform = context.electronPlatformName;
    const resourcesDir = context.packager.getResourcesDir(context.appOutDir);
    const unpackedDir = path.join(resourcesDir, 'app.asar.unpacked');

    let removed = pruneBetterSqlite3(unpackedDir, platform, arch);
    if (platform === 'win32') {
        removed += pruneWindowsGpuCompilers(context.appOutDir);
    }

    if (removed > 0) {
        console.log(
            `  • afterPack pruned ${(removed / 1024 / 1024).toFixed(1)} MB ` +
                `(better-sqlite3 foreign prebuilds${platform === 'win32' ? ', D3D12 compiler' : ''})`
        );
    }
};
