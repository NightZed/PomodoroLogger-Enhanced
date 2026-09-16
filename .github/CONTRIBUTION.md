# How to contribute 🌟

I'm really happy you're reading this.😄 Thanks for taking the time to contribute!👍

- Pomodoro Logger's roadmap is shown on the [issue page](https://github.com/NightZed/PomodoroLogger-Enhanced/issues)
- If you find a bug or want a new feature, [create an issue](https://github.com/NightZed/PomodoroLogger-Enhanced/issues)
- If you want to work on an issue, comment on it to let me know

# Development

This project is built by [Electron](https://electronjs.org). 

You only need to install the latest version of node.js and node-gyp to build this project.

> **Note on Node 22+**: the embedded database (`nedb@1.8.0`) still calls the legacy
> `util.isDate` / `util.isRegExp` helpers that Node removed in v22. Jest therefore loads
> [`test/util-legacy-shim.js`](../test/util-legacy-shim.js) through `setupFiles` in
> `jest.config.js` to restore them for the test process only. The shim is a no-op on
> older Node versions and can be deleted once `nedb` is replaced by a maintained fork
> such as `@seald-io/nedb`.

Issue the following commands to make sure you are ready to go,

```
yarn
yarn build
yarn test
```

Start development 💻

```
yarn start
```

```
// within another terminal
npx electron .
```
- If you are using windows10 install bash shell for running above commands

---

If you are in China, there may be a connection problem when setting things up. 

Before running `yarn`, issue 

```
ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
```

Alternatively, you can add the following lines to `.npmrc` and `.yarnrc` files.

```bash
# ~/.npmrc
registry=https://registry.npmmirror.com
electron_mirror=https://npmmirror.com/mirrors/electron/
```

and

```bash
# ~/.yarnrc
registry "https://registry.npmmirror.com"
electron_mirror "https://npmmirror.com/mirrors/electron/"
```


## Coding Conventions

- Don't use independent CSS file, use [styled-component](https://www.styled-components.com) instead
- Follow the linter
- Commit messages must follow [Conventional Commits](https://www.conventionalcommits.org/)
  (enforced by commitlint). This drives automatic versioning and releases:
  `feat:` triggers a minor release, `fix:`/`perf:` a patch release,
  `BREAKING CHANGE:` in the body a major release; `docs:`/`chore:`/`test:`
  etc. trigger no release.

## Release

Releases are fully automatic via [semantic-release](https://semantic-release.gitbook.io/):

1. Just merge/push [Conventional Commits](https://www.conventionalcommits.org/)-style
   commits to `master` — never bump `package.json` version or create tags by hand.
2. The `Release` workflow runs lint + tests, then semantic-release analyzes commits
   since the last release, bumps the version, updates `CHANGELOG.md` + `package.json`,
   creates the `vX.Y.Z` tag and a GitHub Release.
3. The tag push triggers the `Build/release` workflow, which builds the
   Windows/macOS/Linux installers and uploads them to that Release.

Preview the next version locally with `yarn release --dry-run` (no GitHub token
needed for version analysis).
