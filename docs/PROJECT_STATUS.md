# Project status

Updated: 2026-10-02

## Verified locally

The workspace initially contained one master PDF and five PNG concept/sprite references. It did not contain a Git repository, source code, `index.html`, a package manifest, a GLB/glTF model, the named Ultimate Beta archive, tests, or deployment configuration.

The two files `ChatGPT Installer.exe` and `Microsoft.Services.Store.winmd` are unrelated to the game and remain untouched.

## Reported but not verifiable from supplied files

The dossier describes an advanced HTML/Web 3D beta with land/water movement, swimming, diving, oxygen, energy, touch camera, environmental effects, three Echoes, an Ancient Site, a mobile HUD, and a procedural Luma proxy. None of that implementation was present in the workspace, so it cannot be treated as verified functionality.

The dossier names `loiclapierremaker974/seal-odyssey`, but the repository actually associated with the connected GitHub account is `loiclapierremaker974/-seal-odyssey` (with a leading hyphen). It was empty when inspected on 2026-10-02.

## Current recovery decision

A clean P0 foundation was created because there was no recoverable beta source. It is intentionally modular and data-driven so an older beta can later be compared or migrated without presenting this bootstrap as the missing original.

The foundation passes 25 domain tests and a production Vite build. It was also exercised in a headless Chrome mobile landscape viewport: boot, WebGL scene, introduction, HUD and tactile care dialog loaded without console errors after the visual-QA correction.

Only source code, data, tests and project documentation are intended for the public repository. The confidential master PDF, local reference PNG files and unrelated machine files are explicitly excluded by `.gitignore`. GitHub Pages deployment is defined in `.github/workflows/deploy-pages.yml` and is gated by tests plus a production build.
