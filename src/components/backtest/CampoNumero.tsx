"use client";

import { useState } from "react";

interface Props {
  /** El valor canónico, ya redondeado como lo guarda la aplicación. */
  valor: number | null;
  /** Se avisa en cada tecla que produzca un número válido. */
  onCambiar: (v: number | null) => void;
  /** Cómo se escribe el valor canónico cuando el campo NO está en foco. */
  formatear?: (v: number) => string;
  paso?: number;
  min?: number;
  className?: string;
  "aria-label"?: string;
  id?: string;
}

/**
 * Un campo numérico que respeta lo que el usuario está escribiendo.
 *
 * El problema que resuelve, en vivo: el campo del monto era controlado y
 * su contenido se RECALCULABA a partir del valor convertido en cada
 * tecla. Escribir «1» en dólares daba 1 → 0,00001 BTC → de vuelta a
 * dólares 0,89, así que la pantalla mostraba «0,89» antes de poder
 * teclear el segundo dígito. Escribir «100» era imposible, y borrar
 * tampoco: el campo se repintaba solo con el valor derivado.
 *
 * La regla, que vale para cualquier campo con conversión o redondeo:
 *
 *   MIENTRAS SE ESCRIBE, MANDA EL TEXTO. Al salir del campo, manda el
 *   modelo.
 *
 * Por eso hay un borrador de texto que solo existe mientras el campo
 * tiene el foco. Estados intermedios que no son un número —vacío, «0,»,
 * «-», «1.»— se dejan pasar tal cual: son parte de escribir, y
 * rechazarlos es lo que hacía imposible borrar.
 *
 * Se acepta la coma como separador decimal, porque es la que sale del
 * teclado de Diego.
 */
export function CampoNumero({
  valor,
  onCambiar,
  formatear = (v) => String(v),
  paso,
  min,
  className,
  id,
  "aria-label": ariaLabel,
}: Props) {
  /** Lo que se está tecleando. `null` = no se está editando. */
  const [borrador, setBorrador] = useState<string | null>(null);

  const mostrado =
    borrador !== null ? borrador : valor === null ? "" : formatear(valor);

  return (
    <input
      // `text` y no `number` a propósito: con `number`, el navegador
      // devuelve cadena vacía para cualquier cosa que él considere
      // inválida —incluido «1,» mientras se escribe el decimal—, así que
      // no hay forma de distinguir «borró todo» de «está a mitad de
      // escribir un número». Con `text` el borrador es fiel.
      type="text"
      inputMode="decimal"
      id={id}
      aria-label={ariaLabel}
      value={mostrado}
      step={paso}
      onFocus={(e) => {
        setBorrador(e.target.value);
        e.target.select();
      }}
      onChange={(e) => {
        const txt = e.target.value;
        setBorrador(txt);
        if (txt.trim() === "") {
          onCambiar(null);
          return;
        }
        const n = Number(txt.replace(",", "."));
        if (!Number.isFinite(n)) return;      // «1.» o «-»: se deja escribir
        if (min !== undefined && n < min) return;
        onCambiar(n);
      }}
      onBlur={() => setBorrador(null)}
      onKeyDown={(e) => {
        // Enter confirma: suelta el borrador y deja ver el valor ya
        // redondeado, que es la forma de comprobar qué quedó guardado.
        if (e.key === "Enter") {
          setBorrador(null);
          (e.target as HTMLInputElement).blur();
        }
        if (e.key === "Escape") {
          setBorrador(null);
          (e.target as HTMLInputElement).blur();
        }
      }}
      className={className}
    />
  );
}
