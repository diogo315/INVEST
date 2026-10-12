/**
 * Resolvedor para correr los módulos de la app con node a secas.
 *
 * TypeScript deja dos cosas implícitas que node no sabe: el alias `@/` de
 * tsconfig y la extensión del archivo. Sin esto, cualquier módulo que
 * importe a otro queda fuera del alcance de las pruebas sueltas, y la
 * alternativa —duplicar las fórmulas para que el archivo no importe
 * nada— es peor que el problema.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXTENSIONES = [".ts", ".tsx", ".mjs", ".js", "/index.ts"];

/** Le pega la extensión que falte, si el archivo existe con alguna. */
function completar(url) {
  const p = fileURLToPath(url);
  if (existsSync(p) && !p.endsWith(path.sep)) return url;
  for (const ext of EXTENSIONES) {
    if (existsSync(p + ext)) return pathToFileURL(p + ext).href;
  }
  return url;
}

export async function resolve(especificador, contexto, siguiente) {
  if (especificador.startsWith("@/")) {
    const destino = pathToFileURL(
      path.join(RAIZ, "src", especificador.slice(2)),
    ).href;
    return siguiente(completar(destino), contexto);
  }
  if (especificador.startsWith(".") && contexto.parentURL?.startsWith("file:")) {
    const destino = new URL(especificador, contexto.parentURL).href;
    return siguiente(completar(destino), contexto);
  }
  return siguiente(especificador, contexto);
}
