/**
 * Motor de probabilidade — espelho, em TypeScript, do que o pipeline calibra em Python
 * (pipeline/modelo.py). A nota de corte da próxima edição é tratada como:
 *
 *     corte = centro + choque da edição (cenário k) + escala × z
 *
 * `centro` e `escala` vêm por série; os cenários de choque e a distribuição empírica de z
 * são globais. P(corte ≤ x) é a média, sobre os cenários, da CDF de z.
 */
import type { ParametrosModelo, Serie } from "./tipos";

/** Interpolação linear em tabela ordenada, com saturação nas pontas. */
export function interp(x: number, xs: number[], ys: number[]): number {
  const n = xs.length;
  if (x <= xs[0]) return ys[0];
  if (x >= xs[n - 1]) return ys[n - 1];
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= x) lo = mid;
    else hi = mid;
  }
  const t = (x - xs[lo]) / (xs[hi] - xs[lo] || 1);
  return ys[lo] + t * (ys[hi] - ys[lo]);
}

export interface Cenario {
  /** Choque fixo em pontos (simulação "e se?"). null = mistura de todos os cenários históricos. */
  choque: number | null;
}

export const CENARIO_PADRAO: Cenario = { choque: null };

export class Motor {
  private zq: number[];
  private zp: number[];
  private centros: number[];
  private cenarios: number[][];

  constructor(m: ParametrosModelo) {
    this.zq = m.z.valores;
    this.zp = m.z.probs;
    this.centros = m.cenarios.centros;
    this.cenarios = m.cenarios.valores;
  }

  get nCenarios(): number {
    return this.cenarios.length;
  }

  /** CDF empírica do erro padronizado: 0 abaixo da menor observação, 1 acima da maior. */
  private cdfZ(z: number): number {
    if (z < this.zq[0]) return 0;
    if (z > this.zq[this.zq.length - 1]) return 1;
    return interp(z, this.zq, this.zp);
  }

  /** Choques (em pontos) que valem para uma série, um por cenário. */
  choques(serie: Serie, cen: Cenario = CENARIO_PADRAO): number[] {
    if (cen.choque != null) return [cen.choque];
    const p = serie.centro ?? 0;
    return this.cenarios.map((linha) => interp(p, this.centros, linha));
  }

  /** P(corte ≤ x) em cada cenário. Vazio se a série não tem previsão. */
  cdfPorCenario(serie: Serie, x: number, cen: Cenario = CENARIO_PADRAO): number[] {
    if (serie.centro == null || serie.escala == null) return [];
    const p = serie.centro;
    const s = serie.escala;
    return this.choques(serie, cen).map((g) => this.cdfZ((x - p - g) / s));
  }

  /** P(corte ≤ x): probabilidade de a nota x alcançar a nota de corte da série. */
  cdf(serie: Serie, x: number, cen: Cenario = CENARIO_PADRAO): number | null {
    const v = this.cdfPorCenario(serie, x, cen);
    return v.length ? media(v) : null;
  }

  /** Quantil q da nota de corte prevista (bisseção sobre a CDF de mistura). */
  quantil(serie: Serie, q: number, cen: Cenario = CENARIO_PADRAO): number | null {
    if (serie.centro == null) return null;
    let lo = serie.centro - 400;
    let hi = serie.centro + 400;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if ((this.cdf(serie, mid, cen) ?? 0) < q) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  }
}

export function media(v: number[]): number {
  let s = 0;
  for (const x of v) s += x;
  return v.length ? s / v.length : 0;
}

/** Faixas de chance usadas em toda a interface (sempre com rótulo e ícone, nunca só cor). */
export type Faixa = "alta" | "moderada" | "baixa" | "remota" | "indefinida";

export function faixaDe(p: number | null): Faixa {
  if (p == null) return "indefinida";
  if (p >= 0.8) return "alta";
  if (p >= 0.5) return "moderada";
  if (p >= 0.2) return "baixa";
  return "remota";
}

export const ROTULO_FAIXA: Record<Faixa, string> = {
  alta: "Chance alta",
  moderada: "Chance moderada",
  baixa: "Chance baixa",
  remota: "Chance remota",
  indefinida: "Sem referência",
};
