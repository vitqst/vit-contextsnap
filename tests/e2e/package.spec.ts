import { test, expect } from '@playwright/test';
import { access, readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

test('release candidate has a Chrome-compatible build version and visible RC label', async () => {
  const manifest = JSON.parse(await readFile(resolve('.output/chrome-mv3/manifest.json'), 'utf8'));
  const pkg = JSON.parse(await readFile(resolve('package.json'), 'utf8'));
  expect(pkg.version).toBe('0.2.0-rc.2');
  expect(manifest.version).toBe('0.2.0.2');
  expect(manifest.version_name).toBe(pkg.version);
});

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

test('production package includes project and third-party license notices from their authoritative sources', async () => {
  const output = resolve('.output/chrome-mv3');
  const license = await readFile(resolve('LICENSE'), 'utf8');
  const notices = await readFile(resolve('THIRD_PARTY_NOTICES.md'), 'utf8');
  expect(await readFile(join(output, 'LICENSE.txt'), 'utf8')).toBe(license);
  expect(await readFile(join(output, 'THIRD_PARTY_NOTICES.txt'), 'utf8')).toBe(notices);
  expect(license).toContain('MIT License');
  expect(license).toContain('Copyright (c) 2026 vitqst and contributors');

  const runtimePackages = [
    'react',
    'react-dom',
    'scheduler',
    'roughjs',
    'hachure-fill',
    'path-data-parser',
    'points-on-curve',
    'points-on-path',
    'perfect-freehand',
    'lucide-react',
  ];
  for (const name of runtimePackages) {
    const upstreamLicense = await readFile(resolve('node_modules', name, 'LICENSE'), 'utf8');
    expect(notices, `Preserve the complete upstream license for ${name}`).toContain(
      upstreamLicense.trim(),
    );
  }
  expect(notices).toContain('The MIT License (MIT) (for portions derived from Feather)');
  expect(notices).toContain('Copyright (c) 2023 Aaron');
  expect(notices).toContain('https://github.com/wxt-dev/wxt/blob/wxt-v0.21.4/LICENSE');
});
