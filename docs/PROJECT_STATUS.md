# Project status

Updated: 2026-10-05

## Existing foundation and publication

The connected repository is `loiclapierremaker974/-seal-odyssey`.
The original P0 foundation is commit `edc8b0added6fd4e2855b20e81d69d6cd6728d1e`.
It contains land/water movement, diving, oxygen/energy, three Echoes, the Ancient Site, care/trust and a versioned local save.

GitHub Actions run [37270058776](https://github.com/loiclapierremaker974/-seal-odyssey/actions/runs/37270058776), on 2026-10-05, completed tests, production build and Pages deployment successfully. The published foundation is [Seal Odyssey](https://loiclapierremaker974.github.io/-seal-odyssey/).
The earlier note that Pages was waiting for administrative activation is obsolete.

## Current development: 0.2.0 sensory pass

This iteration extends the existing Web/Three.js foundation:

- One-pass water with wave normals, sky approximation, depth tint, shoreline foam and correct tone mapping / color output.
- Shoreline information sampled from the same deterministic terrain as locomotion.
- Consistent visible sun and directional illumination.
- Luma wetness and drying expressed through roughness/clearcoat.
- Optional, generated Web Audio ambience and brief Echo, site and care cues.
- Accessible sound control; local preference, gesture-only startup, tab visibility lifecycle and disposal.
- CI domain tests, build and desktop/high plus touch/low WebGL startup checks; screenshots and diagnostics retained as run artifacts.

Changes on a development branch are not automatically published to Pages. Only the existing main-branch deployment workflow publishes a release.

## Reference access and scope

The October 1 master dossier and October 5 production transmission were attached again by the creator. Their download could not be opened in this session because no execution workspace is available.
This iteration therefore uses the public `CANON_SNAPSHOT.md`, gameplay data and existing source as its references. It does not claim to implement new instructions from the unread October 5 transmission.

The P0 origin remains the same: the advanced beta archive and its original source were not supplied in the earlier recovery workspace. The current implementation is a clean foundation, not a restoration or proof of that reported beta.

Private PDFs, concept PNGs and unrelated machine files are excluded from the public repository. They are not production assets.

## Validation and remaining work

`pnpm test` runs Node domain/lifecycle tests. `pnpm build` creates the Vite production output.
The new browser workflow instruments real shader compilation, program linking and draw calls, then exercises introduction, sound and care in Chromium's software WebGL renderer.

CI outcomes are available on each commit's checks. Software-renderer smoke tests establish startup and shader validity, not final artistic quality or phone performance.
Real iPhone Safari/PWA checks, offline launch, update/resume and multi-generation performance measurements remain to be performed.

Luma and the landscape remain procedural proxies. No production GLB, rig, morphs, PBR texture set, voice recording or final music is present. The complete canon and production transmission still need to be read before extending story, lineages or wider game systems.
