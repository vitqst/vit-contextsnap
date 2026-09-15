# Browser verification

Install dependencies and the test browser, then build the actual MV3 package:

```sh
npm ci
npx playwright install chromium
npm run build
npm run test:e2e
```

The default suite launches bundled Chromium in headless mode with a disposable profile.
It verifies the packaged extension's editor, real PNG downloads, clipboard contents,
redaction pixels, cropping, wrapped arrow labels and geometry edits, undo, and object deletion.
New-tool checks cover numbered steps, blur strength, circular magnifier sampling, and masks
remaining covered regardless of whether a lens was added before or after the mask.
Image-layer coverage checks insertion, clipboard paste, proportional resizing, layer order,
undo/redo, and flattened pixels, including privacy effects over inserted images. Source
navigation checks confirm the editor stays open and saved-URL fallbacks preserve its work.
It never opens your normal Chrome profile. A small HTTP fixture server runs only on
`127.0.0.1:4179` and stops when the test run finishes.

The two capture tests require native Chrome shortcut activation to grant `activeTab`.
Opening `popup.html` as a tab or calling `chrome.action.openPopup()` is insufficient to
grant that permission. These tests are skipped in the default headless run. On Linux
with `Xvfb`, `xvfb-run`, and `xdotool` installed, run the complete suite in a fresh virtual
display:

```sh
xvfb-run -a sh -c 'CONTEXTSNAP_NATIVE_INPUT=1 CONTEXTSNAP_HEADED=1 CONTEXTSNAP_TEST_DISPLAY="$DISPLAY" npx playwright test'
```

This sends native shortcuts only to the fixture window inside that virtual display.
The harness first aligns Chrome's native tab dimensions with the requested viewport;
Playwright's window-decoration estimates can differ from bare Xvfb, so checking only the
page's emulated DOM dimensions is insufficient for a native screenshot test.
It exercises the production capture APIs and permissions without changing the manifest,
granting extra host access, or replacing Chrome APIs with mocks. Use this command for
full capture verification; `npm run test:e2e` alone does not verify capture activation.

Failure screenshots and traces appear in `test-results/`; the HTML report is in
`playwright-report/`. Open the report with `npx playwright show-report`. The arrow test
also saves an editor screenshot and flattened output for visual inspection.

To diagnose shortcut assignment in the bundled browser, run
`node tests/probe-shortcuts.mjs 'Ctrl+Shift+1' 'Alt+Shift+R'`. This creates disposable
copies of the package, changes only the candidate shortcut, and prints what Chrome
actually assigns. It does not edit production files or change extension permissions.
