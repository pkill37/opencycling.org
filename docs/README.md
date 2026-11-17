# Documentation

[Project overview and quick start](../README.md)

Run all commands from the repository root. The README covers setup, controls and game modes; the guides below cover development and operation.

| Topic | Guide |
| --- | --- |
| Trainer support, resistance control and physical-device checks | [Trainer compatibility](trainer-compatibility.md) |
| Runtime boundaries, physics, Bluetooth and game modes | [Architecture](development/architecture.md) |
| Local checks, CI, browser tests and diagnostics | [Testing](development/testing.md) |
| Road geometry, scenery audits and visual inspection | [World validation](development/world-validation.md) |
| GPX imports, route packages, accuracy limits and release gates | [Route pipeline](routes/pipeline.md) |
| Original downloads, provenance and unresolved reuse terms | [Route sources](routes/sources.md) |
| Terrain generation, elevation credits and worker behavior | [Terrain](routes/terrain.md) |
| Static hosting, metadata, indexing and performance | [Hosting and deployment](deployment/hosting.md) |

## Documentation conventions

- Describe current behavior; keep future work and unverified claims clearly labeled.
- Keep command lists in the README and testing guide rather than repeating setup instructions in every topic.
- Record route provenance and accuracy limits with route documentation. Preserve source URLs, attribution and unresolved reuse terms.
- Generated screenshots and reports belong in ignored `test-results/`, not in these guides.

Original project code and content use the [MIT license](../LICENSE). [NOTICE.md](../NOTICE.md) explains third-party exclusions.
