/**
 * Chequeo de la matemática de opciones contra valores de referencia
 * calculados con scipy (scipy.stats.norm). Correr con:
 *
 *   node --experimental-strip-types scripts/verificar-bs.mjs
 *
 * Si algún día se toca `src/lib/options/black-scholes.ts`, esto dice en un
 * segundo si se rompió algo.
 */
import { griegasBS, volImplicita } from "../src/lib/options/black-scholes.ts";

const CASOS = [
  { S: 100, K: 100, T: 1.000000000000, r: 0.05, q: 0, sigma: 0.2, tipo: "call", esperado: { precio: 10.4505835722, delta: 0.6368306512, gamma: 0.0187620173, theta: -0.0175726782, vega: 0.3752403469, rho: 0.5323248155 } },
  { S: 100, K: 100, T: 1.000000000000, r: 0.05, q: 0, sigma: 0.2, tipo: "put", esperado: { precio: 5.5735260223, delta: -0.3631693488, gamma: 0.0187620173, theta: -0.0045421381, vega: 0.3752403469, rho: -0.4189046090 } },
  { S: 250.5, K: 255, T: 0.082191780822, r: 0.0425, q: 0.006, sigma: 0.284, tipo: "call", esperado: { precio: 6.4589183495, delta: 0.4436688870, gamma: 0.0193566946, theta: -0.1445643002, vega: 0.2835263248, rho: 0.0860384695 } },
  { S: 250.5, K: 255, T: 0.082191780822, r: 0.0425, q: 0.006, sigma: 0.284, tipo: "put", esperado: { precio: 10.1932226739, delta: -0.5558380839, gamma: 0.0193566946, theta: -0.1190918343, vega: 0.2835263248, rho: -0.1228197228 } },
  { S: 42.1, K: 35, T: 0.019178082192, r: 0.045, q: 0, sigma: 0.65, tipo: "call", esperado: { precio: 7.1550070393, delta: 0.9824180839, gamma: 0.0114494825, theta: -0.0159620533, vega: 0.0025296974, rho: 0.0065598236 } },
  { S: 42.1, K: 55, T: 0.019178082192, r: 0.045, q: 0, sigma: 0.65, tipo: "put", esperado: { precio: 12.8544590819, delta: -0.9982200815, gamma: 0.0015048416, theta: 0.0052222833, vega: 0.0003324861, rho: -0.0105248403 } },
  { S: 600, K: 600, T: 0.005479452055, r: 0.04, q: 0.012, sigma: 0.15, tipo: "call", esperado: { precio: 2.7036751839, delta: 0.5076934200, gamma: 0.0598672027, theta: -0.6873514340, vega: 0.1771413121, rho: 0.0165431439 } },
  { S: 18.4, K: 20, T: 1.000000000000, r: 0.0425, q: 0.03, sigma: 0.42, tipo: "put", esperado: { precio: 3.7780346615, delta: -0.4692633716, gamma: 0.0500547055, theta: -0.0033594140, vega: 0.0711753885, rho: -0.1241248070 } }
];

const TOL = 1e-8;
let fallas = 0;

for (const c of CASOS) {
  const g = griegasBS(c);
  for (const campo of ["precio", "delta", "gamma", "theta", "vega", "rho"]) {
    const dif = Math.abs(g[campo] - c.esperado[campo]);
    if (dif > TOL) {
      fallas++;
      console.log(
        `FALLA ${c.tipo} S=${c.S} K=${c.K} ${campo}: ${g[campo]} vs ${c.esperado[campo]} (dif ${dif})`,
      );
    }
  }
  const iv = volImplicita(c.esperado.precio, c);
  if (iv === null || Math.abs(iv - c.sigma) > 1e-6) {
    fallas++;
    console.log(`FALLA vol implicita ${c.tipo} S=${c.S}: ${iv} vs ${c.sigma}`);
  }
}

console.log(
  fallas === 0
    ? `OK - ${CASOS.length} casos x 6 griegas + vol implicita, todo dentro de ${TOL}`
    : `${fallas} fallas`,
);
process.exit(fallas === 0 ? 0 : 1);
