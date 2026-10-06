# Asset inventory

Updated: 2026-10-05

The reference table below records the earlier recovery workspace. These private source files are not included in the public GitHub tree.

| File | Observed content | Runtime status |
| --- | --- | --- |
| `Seal_Odyssey_Dossier_Maitre_Transmission_Codex_2026-10-01.pdf` | 20-page master creative/technical dossier | Source reference |
| `seal1.png` | Rendered cute seal concept with luminous markings | Reference only |
| `seal2.png` | Early sprite-layout concept | Reference only |
| `seal3.png` | Polished 2D player sprite-sheet presentation | Reference only |
| `seal45.png` | Repeated pose/expression concept grid | Reference only |
| `78790bdf-8e49-43d6-8948-e37c36957672.png` | Early idle/walk pose sheet | Reference only |

The PNGs are not a production 3D model, rig, texture set, or verified animation export. Their provenance and commercial rights have not been documented in the supplied workspace, so the bootstrap does not ship them as runtime assets.

The project still needs a production Luma GLB pipeline covering sculpt/model, UVs, PBR textures, rig, morph targets, animation clips, optimization/LODs, licensing, and source-file archival.

## Generated runtime material in 0.2.0

- Ocean height field: a 256 × 256 unsigned-byte texture generated from the shared Aelys terrain, disposed with the scene.
- Luma: existing primitive geometry; wet/dry material parameters, no new production model or texture.
- Sound: generated noise and oscillator cues via Web Audio, enabled voluntarily. These are prototype ambience, not final recordings or music.
- Browser captures and shader diagnostics: CI artifacts, excluded from source control.

The October 1 and October 5 PDFs attached for this session have not been read because their download requires an execution workspace that is unavailable. No assets or new canon have been inferred from their filenames.
