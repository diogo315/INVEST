/**
 * Resolvedor para correr los módulos de la app con node a secas.
 *
 * TypeScript deja dos cosas implícitas que node no sabe: el alias `@/` de
 * tsconfig y la extensión del archivo. Sin esto, cualquier módulo que
 * importe a otro queda fuera del alcance de las pruebas sueltas, y la
 * alternativa —duplicar las fórmulas para que el archivo no importe
 * nada— es peor que el problema.
 */
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXTENSIONES = [".ts", ".tsx", ".mjs", ".js", "/index.ts"];

/** ¿Existe y es un archivo? Una carpeta no sirve como módulo. */
function esArchivo(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

/**
 * Le pega la extensión que falte.
 *
 * Ojo con las carpetas: `@/lib/indicators` existe como directorio, así que
 * comprobar solo que exista lo daría por bueno y node fallaría con
 * ERR_UNSUPPORTED_DIR_IMPORT. Tiene que ser un archivo.
 */
function completar(url) {
  const p = fileURLToPath(url);
  if (esArchivo(p)) return url;
  for (const ext of EXTENSIONES) {
    if (esArchivo(p + ext)) return pathToFileURL(p + ext).href;
  }
  return url;
}

/**
 * Resuelve y, si resultó ser un JSON, le pone el atributo que node exige.
 *
 * Un bundler importa `datos.json` sin ceremonia; node pide
 * `with { type: "json" }` en el código. Como el código es de la app y no
 * de las pruebas, el atributo se agrega acá.
 */
async function resolverCon(destino, contexto, siguiente) {
  const r = await siguiente(destino, contexto);
  return r.url.endsWith(".json")
    ? { ...r, importAttributes: { type: "json" } }
    : r;
}

export async function resolve(especificador, contexto, siguiente) {
  if (especificador.startsWith("@/")) {
    const destino = pathToFileURL(
      path.join(RAIZ, "src", especificador.slice(2)),
    ).href;
    return resolverCon(completar(destino), contexto, siguiente);
  }
  if (especificador.startsWith(".") && contexto.parentURL?.startsWith("file:")) {
    const destino = new URL(especificador, contexto.parentURL).href;
    return resolverCon(completar(destino), contexto, siguiente);
  }
  return resolverCon(especificador, contexto, siguiente);
}
