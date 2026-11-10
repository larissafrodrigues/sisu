/** Nota do candidato em uma oferta: média ponderada, notas mínimas e melhor edição do Enem. */
import { AREAS, type EdicaoEnem, type Notas, type Oferta, type Perfil } from "./tipos";

export function mediaPonderada(notas: Notas, pesos: Notas): number {
  let soma = 0;
  let total = 0;
  for (const a of AREAS) {
    soma += notas[a] * pesos[a];
    total += pesos[a];
  }
  return total > 0 ? soma / total : 0;
}

export function mediaSimples(notas: Notas): number {
  return AREAS.reduce((s, a) => s + notas[a], 0) / AREAS.length;
}

/** Devolve o motivo da inelegibilidade, ou null se a edição cumpre as mínimas da oferta. */
export function motivoInelegivel(notas: Notas, oferta: Oferta): string | null {
  if (!(notas.red > 0)) return "redação zerada (edição não é aceita pelo SISU)";
  for (const a of AREAS) {
    if (notas[a] < oferta.minimas[a]) return `nota mínima em ${a.toUpperCase()} é ${oferta.minimas[a]}`;
  }
  if (mediaSimples(notas) < oferta.minimas.media) return `média mínima do Enem é ${oferta.minimas.media}`;
  return null;
}

export function edicaoPreenchida(e: EdicaoEnem): boolean {
  return AREAS.every((a) => Number.isFinite(e.notas[a]) && e.notas[a] > 0);
}

export interface NotaNaOferta {
  nota: number; // melhor média ponderada entre as edições válidas (0 se nenhuma)
  ano: number | null; // edição do Enem que gerou essa nota
  elegivel: boolean;
  motivo: string | null; // por que nenhuma edição serve
}

/**
 * Regra do SISU desde 2026: valem as três últimas edições do Enem e, para cada opção de
 * curso, o sistema usa a edição com a melhor média ponderada (Edital nº 29/2025, item 1.4.3).
 */
export function notaNaOferta(perfil: Pick<Perfil, "edicoes">, oferta: Oferta): NotaNaOferta {
  let melhor: NotaNaOferta = { nota: 0, ano: null, elegivel: false, motivo: "informe suas notas" };
  for (const e of perfil.edicoes) {
    if (!edicaoPreenchida(e)) continue;
    const motivo = motivoInelegivel(e.notas, oferta);
    if (motivo) {
      if (!melhor.elegivel) melhor = { nota: mediaPonderada(e.notas, oferta.pesos), ano: e.ano, elegivel: false, motivo };
      continue;
    }
    const nota = mediaPonderada(e.notas, oferta.pesos);
    if (!melhor.elegivel || nota > melhor.nota) melhor = { nota, ano: e.ano, elegivel: true, motivo: null };
  }
  return melhor;
}
