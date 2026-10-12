/** Engancha el resolvedor de `@/` y de extensiones. Ver alias-hooks.mjs. */
import { register } from "node:module";
register("./alias-hooks.mjs", import.meta.url);
