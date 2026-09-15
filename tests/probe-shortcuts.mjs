import { chromium } from '@playwright/test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';

// Diagnostic fixture generation only. Production source and permissions are never changed.
const source = resolve('.output/chrome-mv3');
const temporary = await mkdtemp(join(tmpdir(), 'contextsnap-shortcut-probe-'));
const candidates = process.argv.slice(2);
if (!candidates.length) candidates.push('Alt+Shift+X', 'Ctrl+Shift+1', 'Ctrl+Shift+Y');
try {
  for (const [index, candidate] of candidates.entries()) {
    const extensionPath = join(temporary, String(index));
    await cp(source, extensionPath, { recursive: true });
    const manifestPath = join(extensionPath, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.commands['capture-area'].suggested_key.default = candidate;
    await writeFile(manifestPath, JSON.stringify(manifest));
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: true,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    });
    try {
      const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
      const commands = await worker.evaluate(() => globalThis.chrome.commands.getAll());
      process.stdout.write(`${JSON.stringify({ candidate, commands })}\n`);
    } finally {
      await context.close();
    }
  }
} finally {
  // The target is the exact fresh directory returned by mkdtemp above.
  await rm(temporary, { recursive: true, force: true });
}
