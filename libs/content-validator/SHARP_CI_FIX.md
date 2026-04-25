# Sharp Native Bindings

`@dcl/content-validator` depends on [`sharp`](https://sharp.pixelplumbing.com/) for image processing. `sharp` ships native bindings that link against `libvips`, which means CI runners and any environment that builds sharp from source need `libvips` available.

## How it's wired in this monorepo

1. `libvips` is installed on Linux runners by the `Install libvips` step in `.github/workflows/ci.yml` and `.github/workflows/publish.yml`.
2. The root `package.json` allowlists `sharp` in `pnpm.onlyBuiltDependencies`, so pnpm runs sharp's install scripts (which download or build the native binary) instead of skipping them.
3. Local development on macOS (Apple Silicon and Intel) and on common Linux distros works without any extra steps because sharp 0.32 ships prebuilt binaries for those targets.

## When sharp fails to load

Symptoms look like:

```
Could not load the "sharp" module using the <platform> runtime
ERR_DLOPEN_FAILED: libvips-cpp.so.8.x.x: cannot open shared object file
```

Resolutions:

- **Linux contributors:** install libvips system-wide (`sudo apt-get install -y libvips-dev` on Debian/Ubuntu).
- **After cloning or after a Node version change:** run `pnpm rebuild sharp` to regenerate the native binding for the current platform.
- **If pnpm warns "Ignored build scripts: sharp":** confirm the `pnpm.onlyBuiltDependencies` entry in the root `package.json` still lists `sharp`, then run `pnpm rebuild sharp`.

## References

- [Sharp installation documentation](https://sharp.pixelplumbing.com/install)
- [pnpm `onlyBuiltDependencies`](https://pnpm.io/package_json#pnpmonlybuildtdependencies)
