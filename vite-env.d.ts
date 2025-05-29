/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_MAPS_API_KEY: string;
  // Ajoutez ici d'autres variables d'environnement VITE_ que vous pourriez utiliser
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
