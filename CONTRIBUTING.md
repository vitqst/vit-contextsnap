# Contributing to ContextSnap

Bug reports, documentation improvements, and focused pull requests are welcome.
For larger features, open an issue describing the problem before starting implementation.
Keep communication respectful and constructive.

## Set up

Use Node.js 22.12+, 24.x, or 26+ and npm. Chrome 120+ is the target browser.

```sh
git clone https://github.com/vitqst/vit-contextsnap.git
cd vit-contextsnap
npm ci
npm run build
```

Load `.output/chrome-mv3` as an unpacked extension at `chrome://extensions`.
`npm run dev` starts the development build. Keep experiments and tests out of your
personal browser profile when they involve captures or clipboard access.

## Before opening a pull request

```sh
npm run check
npx playwright install chromium
npm run test:e2e
```

`check` runs TypeScript, ESLint, formatting, unit tests, and a production build.
The default browser suite verifies the packaged editor but skips two native capture
tests. See [browser verification](tests/README.md) for the complete isolated Linux/Xvfb
run used by CI. Run the native suite for changes to capture or its permissions.

- Keep changes small and explain the user-facing problem.
- Add a regression test that fails before fixing a bug.
- Include relevant PNG pixel assertions for rendering/export changes; inspect the UI too.
- Record behavior changes in `CHANGELOG.md` and update affected documentation.
- Use `npm run format` to apply formatting. Commit lockfile changes with dependency updates.
- Do not commit generated builds, screenshots, browser profiles, tokens, or environment files.

## Design boundaries

The [approved design](docs/plans/2026-09-15-screenshot-editor-design.md) and the README
describe the shipped product. The original requirements are historical backlog, not a
promise that every listed feature exists.

- Keep Chrome APIs in `src/platform/` and entrypoints, not geometry or rendering.
- Use source-image pixels for document coordinates; editor zoom is a view transform.
- Preserve immutable undo history and keep editor overlays out of exported pixels.
- Keep preview and export on the same renderer and hit testing on the same layer order.
- Solid redaction must cover source pixels in every exported image, including magnifiers.
  Blur is cosmetic, not secure redaction.
- Discuss new permissions, network access, dependencies, or persistent data before adding them.
- Keep third-party copyright/license notices accurate when changing bundled dependencies.

## Reporting issues safely

Use synthetic example pages and screenshots. Remove passwords, tokens, private URLs,
personal details, and browser-profile data from logs, images, recordings, and traces.
Follow [SECURITY.md](SECURITY.md) for vulnerabilities; do not disclose them in public issues.

## License

Contributions are made under the project's [MIT license](LICENSE). Only contribute
code and assets you have the right to share; preserve third-party notices.
