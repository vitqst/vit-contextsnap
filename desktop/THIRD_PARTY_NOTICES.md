# ContextSnap Desktop third-party notices

ContextSnap Desktop is MIT licensed; its license accompanies the application as
`LICENSE.txt`. The editor's JavaScript notices are reproduced from the repository's
root `THIRD_PARTY_NOTICES.md`.

`node scripts/desktop-notices.mjs` generates `desktop/dist/THIRD_PARTY_NOTICES.txt`
from the installed Tauri JavaScript packages and dependency sources resolved by
`desktop/src-tauri/Cargo.lock`. It requires installed npm dependencies and Cargo;
Cargo may download locked source archives when they are not already cached.

The inventory includes the complete Cargo dependency graph, including build tools
and dependencies for other operating systems. Each component lists its version,
declared license, source URL, and references to reproduced license or notice texts.
Identical texts share an identifier. Both alternatives are included when packages
provide separate MIT and Apache license files.

When an npm package provides only SPDX metadata, the generator can use the license
texts from its same-version Rust companion, explicitly naming that source. Packages
without full packaged license terms are listed under “Missing packaged license
texts,” with their declared license and upstream URL for release review.

System libraries supplied by Linux or macOS remain subject to their distributors'
licenses. The generated inventory covers the application's installed dependencies.
