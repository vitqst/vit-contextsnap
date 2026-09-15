import { test, expect } from '@playwright/test';
import { access, readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

test('production package is MV3 with on-demand access and bundled editor assets', async () => {
  const output = resolve('.output/chrome-mv3');
  const manifest = JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8')) as {
    manifest_version: number;
    permissions: string[];
    host_permissions?: string[];
    content_scripts?: unknown[];
    background: { service_worker: string };
    action: { default_popup: string };
  };
  expect(manifest.manifest_version).toBe(3);
  expect(manifest.permissions).toContain('activeTab');
  expect(manifest.permissions).not.toContain('<all_urls>');
  expect(manifest.permissions).not.toContain('debugger');
  expect(manifest.host_permissions ?? []).toEqual([]);
  expect(manifest.content_scripts ?? []).toEqual([]);
  await Promise.all([
    access(join(output, manifest.background.service_worker)),
    access(join(output, manifest.action.default_popup)),
    access(join(output, 'editor.html')),
  ]);
  const files = await readdir(output, { recursive: true });
  expect(files.filter((file) => file.endsWith('.map'))).toEqual([]);
});
