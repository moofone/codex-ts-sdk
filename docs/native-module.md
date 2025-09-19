# Native Module

The SDK relies on the `codex-napi` native addon. During development you can
build it locally:

```bash
npm run build:native
```

Prebuilt artefacts should be placed under `native/codex-napi/prebuilt/<platform>-<arch>/`.
Pass `nativeModulePath` to the client configuration to override the discovery
logic.
