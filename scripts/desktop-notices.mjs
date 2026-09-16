import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'desktop', 'dist');
const metadata = JSON.parse(
  execFileSync(
    'cargo',
    [
      'metadata',
      '--locked',
      '--format-version',
      '1',
      '--manifest-path',
      'desktop/src-tauri/Cargo.toml',
    ],
    {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'inherit'],
    },
  ),
);

const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const cargoPackages = metadata.packages
  .filter((pkg) => pkg.id !== metadata.resolve.root)
  .sort((a, b) => compare(`${a.name}@${a.version}`, `${b.name}@${b.version}`));
const texts = new Map();
const missing = [];
const components = [];

function sourceUrl(pkg, ecosystem) {
  const repository = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
  return (
    repository
      ?.replace(/^git\+/, '')
      .replace(/^git:\/\//, 'https://')
      .replace(/\.git$/, '') ||
    pkg.homepage ||
    (ecosystem === 'Cargo'
      ? `https://crates.io/crates/${pkg.name}/${pkg.version}`
      : `https://www.npmjs.com/package/${pkg.name}/v/${pkg.version}`)
  );
}

// Cargo archives can contain notices for vendored source below their root. Include
// those too, without following symlinks or reading unrelated build/cache directories.
async function licenseFiles(directory, declaredFile) {
  const paths = new Set();
  async function visit(current, licenseDirectory = false) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        if (['.git', 'target', 'node_modules'].includes(entry.name)) continue;
        await visit(path, licenseDirectory || /^(licen[cs]es|copying)$/i.test(entry.name));
      } else if (
        entry.isFile() &&
        (licenseDirectory || /^(licen[cs]e|copying|notice)(?:[._-].*)?$/i.test(entry.name))
      ) {
        paths.add(path);
      }
    }
  }
  await visit(directory);
  if (declaredFile) {
    const path = resolve(directory, declaredFile);
    const fromPackage = relative(directory, path);
    if (isAbsolute(fromPackage) || fromPackage === '..' || fromPackage.startsWith(`..${sep}`)) {
      throw new Error(`License file leaves the package directory: ${basename(directory)}`);
    }
    paths.add(path);
  }
  return Promise.all(
    [...paths].sort(compare).map(async (path) => ({
      name: relative(directory, path).split(sep).join('/'),
      text: (await readFile(path, 'utf8')).replace(/\r\n/g, '\n').trimEnd(),
    })),
  );
}

function fullLicense(file) {
  // SPDX documents describe a license, but do not contain its permission terms.
  return file.text.length > 0 && !/\.spdx$/i.test(file.name) && !/^SPDXVersion:/m.test(file.text);
}

function include(pkg, ecosystem, files) {
  const label = `${pkg.name} ${pkg.version} (${ecosystem})`;
  const source = sourceUrl(pkg, ecosystem);
  const license = pkg.license || 'Not declared in the package metadata';
  const notices = [];
  for (const file of files) {
    if (!file.text) continue;
    let entry = texts.get(file.text);
    if (!entry) {
      entry = { id: `L${String(texts.size + 1).padStart(4, '0')}`, text: file.text };
      texts.set(file.text, entry);
    }
    notices.push(`- ${file.name}: ${entry.id}`);
  }
  if (!files.some(fullLicense)) {
    const item = `${label} — ${license} — ${source}`;
    missing.push(item);
    notices.push(
      '- MISSING LICENSE TEXT: the package archive does not include full license terms.',
    );
  }
  components.push(
    `### ${label}\n\nLicense: ${license}\nSource: ${source}\n\n${notices.join('\n')}`,
  );
}

for (const name of ['@tauri-apps/api', '@tauri-apps/plugin-dialog']) {
  const directory = join(root, 'node_modules', name);
  const pkg = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
  const files = await licenseFiles(directory);
  if (name === '@tauri-apps/plugin-dialog' && !files.some(fullLicense)) {
    // The npm archive currently includes only LICENSE.spdx. Its same-version Rust
    // companion ships the full shared project license texts; keep provenance explicit.
    const companion = cargoPackages.find(
      (candidate) => candidate.name === 'tauri-plugin-dialog' && candidate.version === pkg.version,
    );
    if (companion) {
      const companionFiles = await licenseFiles(
        dirname(companion.manifest_path),
        companion.license_file,
      );
      for (const file of companionFiles.filter(fullLicense)) {
        files.push({ ...file, name: `${companion.name} ${companion.version}/${file.name}` });
      }
    }
  }
  include(pkg, 'npm', files);
}

for (const pkg of cargoPackages) {
  include(pkg, 'Cargo', await licenseFiles(dirname(pkg.manifest_path), pkg.license_file));
}

const shared = await readFile(join(root, 'THIRD_PARTY_NOTICES.md'), 'utf8');
const introduction = await readFile(join(root, 'desktop', 'THIRD_PARTY_NOTICES.md'), 'utf8');
const gaps = missing.length
  ? `## Missing packaged license texts\n\nThe following packages require upstream license review; their SPDX identifiers and source links are retained here.\n\n${missing.map((item) => `- ${item}`).join('\n')}\n\n`
  : '';
const licenseTexts = [...texts.values()].map(({ id, text }) => `### ${id}\n\n${text}`).join('\n\n');
const notices = `${introduction.trimEnd()}\n\n${gaps}## Shared editor notices\n\n${shared.trimEnd()}\n\n## Desktop dependency inventory\n\n${components.join('\n\n')}\n\n## License texts\n\n${licenseTexts}\n`;

// Write only after the complete inventory is collected: a metadata/read failure must
// fail the build instead of producing a deceptively partial new notices file.
await mkdir(output, { recursive: true });
await writeFile(join(output, 'THIRD_PARTY_NOTICES.txt'), notices);
await copyFile(join(root, 'LICENSE'), join(output, 'LICENSE.txt'));
process.stdout.write(
  `Desktop notices: ${cargoPackages.length} Cargo packages, 2 npm packages, ${texts.size} unique notice texts.\n`,
);
if (missing.length) {
  process.stderr.write(
    `Missing packaged license texts (${missing.length}):\n${missing.map((item) => `- ${item}`).join('\n')}\n`,
  );
}
