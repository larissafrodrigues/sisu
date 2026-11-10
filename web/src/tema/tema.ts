/**
 * Tema claro/escuro.
 *
 * A preferência ("claro", "escuro" ou "sistema") fica no localStorage. O tema em uso vai no
 * atributo data-tema do <html>, que o CSS lê. Um script curto no index.html aplica o atributo
 * antes da primeira pintura, para a página não piscar no tema errado.
 */
import { useEffect, useState } from "react";

export type Preferencia = "claro" | "escuro" | "sistema";
export type Tema = "claro" | "escuro";

export const CHAVE_TEMA = "bussola-sisu:tema";
const CONSULTA = "(prefers-color-scheme: dark)";

export function lerPreferencia(): Preferencia {
  try {
    const v = localStorage.getItem(CHAVE_TEMA);
    return v === "claro" || v === "escuro" ? v : "sistema";
  } catch {
    return "sistema";
  }
}

export function resolver(p: Preferencia, sistemaEscuro: boolean): Tema {
  return p === "sistema" ? (sistemaEscuro ? "escuro" : "claro") : p;
}

function aplicar(p: Preferencia): void {
  const tema = resolver(p, window.matchMedia(CONSULTA).matches);
  document.documentElement.dataset.tema = tema;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", tema === "escuro" ? "#0b3540" : "#0e3f4a");
}

/** Preferência de tema, com função para trocá-la. Acompanha o sistema enquanto estiver em "sistema". */
export function useTema(): [Preferencia, (p: Preferencia) => void] {
  const [pref, setPref] = useState<Preferencia>(lerPreferencia);

  useEffect(() => {
    aplicar(pref);
    try {
      if (pref === "sistema") localStorage.removeItem(CHAVE_TEMA);
      else localStorage.setItem(CHAVE_TEMA, pref);
    } catch {
      /* sem armazenamento: o tema vale só nesta visita */
    }
    if (pref !== "sistema") return;
    const mq = window.matchMedia(CONSULTA);
    const f = () => aplicar("sistema");
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, [pref]);

  return [pref, setPref];
}
