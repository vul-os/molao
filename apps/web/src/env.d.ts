/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** '1' when the build bundles the demo corpus and serves the API from it. */
  readonly VITE_DEMO: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
