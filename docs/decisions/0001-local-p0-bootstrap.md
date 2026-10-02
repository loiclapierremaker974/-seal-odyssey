# ADR 0001: Local P0 bootstrap

Status: accepted for the local recovery workspace  
Date: 2026-10-02

## Context

The dossier describes a web beta and a GitHub repository, but neither source nor archive is available locally and the named repository cannot be accessed publicly. Waiting would leave the workspace without executable project material.

## Decision

Create a local, dependency-light Web/PWA foundation using Vite, Three.js, native ES modules, and JSON data. Keep gameplay domains independent from rendering. Label all procedural Luma geometry as a proxy. Implement the smallest playable Aelys loop that validates architecture and mobile controls: movement, water states, three Echoes, Ancient Site activation, care/trust, versioned save data, and an update-aware service worker.

## Boundaries

- Do not claim parity with the missing Ultimate Beta.
- Do not publish or push without an authenticated, confirmed target repository.
- Do not turn legacy lineage names into current canon.
- Do not integrate supplied concept PNGs as production assets without provenance and a deliberate art decision.
- If the original beta is recovered, compare it in a separate branch or directory before merging behavior.
