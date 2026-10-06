# Project status

Updated: 2026-10-06

## Development and reference

Repository: `loiclapierremaker974/-seal-odyssey`.
The creator supplied the visible Luma presentation sheet on October 6 and asked for the in-game anatomy and scenery to follow it. The image has been inspected; its physical 3D assets were not supplied.

Version 0.3.0 replaces the primitive seal with a continuous skinned body, a short raised neck, rounded juvenile head, cream muzzle, mottled silver skin, glossy dark eyes, curved whiskers and flattened fore/hind flippers. A small bone rig blends land and swimming posture. Facial details follow the head together; eyes and reflections blink together. Skin roughness changes with immersion and drying.

Aelys now has a granular sandy shore, weathered rocks, flexible grass blades, layered distant cliffs with limestone relief, masonry arches, ruined towers, moss, warm clouds and animated waterfalls. Geometry is built locally without downloaded third-party assets. Height-dependent coastal outlines and lagoon bounds stop the seal at the cliff surface and keep it on the modeled water surface. The follow camera starts closer to Luma. Care reuses the same live WebGL canvas and character in a closer portrait view; the old CSS seal is removed.

The 0.2.0 water, optional procedural audio, accessible controls, care, Echoes, quest and local-save behavior are retained.

## Verification and real captures

The working branch is `codex/aqualys-sensory-pass-2026-10-05`, pull request #1.
On October 6 the validation runner executed the domain/model/collision tests and production build for commit `a205cc980f92ad5dc8ebfbbf51704566786454b8`; both succeeded.
On commit `ca7fc000f88a9524a599241f3f63a07680f79502`, both graphics profiles compiled/linked without GL errors and the touch/low scenario passed all interactions. The desktop screenshot exceeded its software-renderer timeout; subsequent capture code briefly pauses test RAF callbacks and drains GL before taking a real frame.
Browser validation checks actual Chromium/SwiftShader GLSL compilation, linking, draw calls, introduction, sound controls and care on desktop/high and touch/low profiles.

JPEG captures are produced by that real browser session, alongside PNG screenshots and JSON diagnostics in Actions artifacts. The branch `seal-render-previews` holds only generated review captures and their source SHA/run/status metadata. No private reference image or user save is published there. A capture must be checked against its source SHA and validation status before being called a validated preview.

Only the main-branch Pages workflow publishes the game. Development checks and review captures alone do not change the live site.
Live URL: https://loiclapierremaker974.github.io/-seal-odyssey/

## Scope and remaining work

This is a playable procedural foundation inspired by the sheet. It is not yet equivalent to its polished art rendering. The body uses a small custom rig rather than a finished production character, facial acting is limited, cliff collisions approximate the horizontal contour at the seal’s height, and water uses approximate sky reflection rather than scene reflection/refraction.

Real iPhone Safari/PWA performance, offline launch and update/resume still require device testing. Recorded music/audio, production sculpt/retopology/rigging, final PBR assets, the larger living world and extended narrative are still absent.

The October 1 and October 5 PDFs could not be opened through the current tool workspace. Published canon/game data remain the narrative source; unread document instructions are not treated as user requests. The earlier advanced-beta archive/source remains unavailable. The reference sheet and PDFs stay private rather than being copied into the public asset tree.
