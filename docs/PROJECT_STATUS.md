# Project status

Updated: 2026-10-06

## Development and reference

Repository: `loiclapierremaker974/-seal-odyssey`.
The creator supplied the visible Luma presentation sheet on October 6. Its anatomy, materials and coastal atmosphere guide the procedural model. The physical 3D assets shown in the sheet were not supplied.

Version 0.3.1 retains the continuous skinned body, small bone rig, cream muzzle, curved whiskers, flattened flippers and live 3D care introduced in 0.3.0. It adds a rounder skull, less protruding eyes, finer irregular spots and short volumetric fur. Three mobile or six desktop alpha-tested shells share the body geometry and skeleton. Fur length and coverage decrease with wetness; fur shells do not cast incorrect depth shadows.

Aelys has more sharply sculpted rock shelves and fissures, colored limestone strata and moss streaks. Horizontal cliff collision contours are intersections of the actual Float32 side triangles, rather than samples of an idealized surface. The accessible depth range is covered; future traversal on cliff tops will need top-surface collision. Smaller foreground cliffs improve the view of the ruins.

Warmer direct sunlight, a clearer blue sky, lighter atmospheric haze, fine sand ripples, small pebbles and narrower grass blades improve the shore. The playable movement, water, care, Echoes, quests, optional audio and local saves are preserved.

## Verification and real captures

Version 0.3.0 was published at commit `d4513f584b9846bd7a1c38b77f1e9684a67325fc`, with 48 passing tests and successful Pages deployment (run 37508029591).
The 0.3.1 working branch is `codex/luma-fur-light-2026-10-06`.

The validation workflow runs domain/model/collision tests, a production build and actual Chromium/SwiftShader WebGL checks on desktop/high and touch/low profiles. New checks verify shared fur binding and wet length, closed coastal contours and agreement with rendered rock triangles. Browser checks cover shader compilation/linking, draw calls, introduction, sound controls and live 3D care.

Real screenshots and diagnostics are published as Actions artifacts and on the isolated `seal-render-previews` branch. Their source SHA and passed status must match the version being reviewed. Browser captures temporarily drain GL and pause test RAF callbacks; they are not device frame-rate measurements.

Only the main-branch Pages workflow publishes the game:
https://loiclapierremaker974.github.io/-seal-odyssey/

## Scope and remaining work

The game remains a playable procedural foundation. The presentation sheet's final sculpt, detailed facial anatomy, groomed fur and polished environment quality are still an artistic target. Water reflection remains approximate, facial acting is limited and the world/story scope is small.

Real iPhone Safari/PWA performance, offline launch and update/resume still need device testing. Recorded music, production character assets, a larger living world and the extended narrative remain unfinished.

The October 1 and October 5 PDFs could not be opened through the current tool workspace. Published canon/game data remain the narrative source; unread document instructions are not treated as user requests. Private reference documents and user saves are not added to the public asset tree.
