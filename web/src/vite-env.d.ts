/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  /** Optional tip-jar link, e.g. https://ko-fi.com/yourname. Nothing tip-related is shown when unset. */
  readonly VITE_KOFI_URL?: string;
}
