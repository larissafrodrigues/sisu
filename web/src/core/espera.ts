/**
 * Chance de ser chamado pela lista de espera, depois da chamada regular.
 *
 * O MEC só publica a nota de corte da chamada regular. Para estimar até onde a lista "anda",
 * o pipeline (pipeline/espera.py) mede, em cada curso e modalidade da UFV e da UFMG,
 *
 *     queda = nota de corte da chamada regular − menor nota convocada na lista de espera
 *
 * e monta perfis por grupo de modalidade e faixa de nota de corte. Aqui:
 *
 *   1. a distribuição da queda de um curso é o histórico do próprio curso (se for da UFV ou
 *      da UFMG) misturado ao perfil de cursos parecidos, que entra com o peso de
 *      `peso_perfil` anos — a mesma conta de `_mistura` no Python;
 *   2. em cada cenário da edição, a chance de ser alcançado pela lista é a média, sobre as
 *      quedas possíveis, de P(corte da regular ≤ nota + queda);
 *   3. cotistas entram na lista da cota e na da ampla concorrência: vale a melhor das duas
 *      em cada cenário (hipótese conservadora, como em `aprovacaoPorCenario`).
 */
import { aprovacaoPorCenario, notaEfetiva, serieAC } from "./avaliacao";
import { CENARIO_PADRAO, media, type Cenario, type Motor } from "./probabilidade";
import type { EvidenciaEspera, HistEspera, Oferta, Serie } from "./tipos";

export function grupoEspera(codigo: string): string {
  if (codigo === "AC") return "AC";
  if (codigo.includes("PCD")) return "PCD";
  if (codigo.endsWith("_Q")) return "Q";
  if (codigo.includes("PPI") || codigo.endsWith("_PP") || codigo.endsWith("_I")) return "PPI";
  if (codigo.startsWith("L")) return "EP";
  return "AC";
}

/** Índice da faixa de nota de corte (mesma regra de `faixa` no Python: limite pertence à faixa de cima). */
export function faixaEspera(e: EvidenciaEspera, corte: number): number {
  let i = 0;
  while (i < e.limites.length && corte >= e.limites[i]) i++;
  return i;
}

export function quedaObservada(h: HistEspera): number {
  return h.final == null ? 0 : Math.max(0, h.regular - h.final);
}

export interface DistQueda {
  valores: number[];
  pesos: number[]; // somam 1
  /** "propria": há histórico do próprio curso (UFV/UFMG); "perfil": só o padrão de cursos parecidos. */
  base: "propria" | "perfil";
  ies: string | null;
  hist: HistEspera[];
  grupo: string;
  faixa: number;
}

export function serieEspera(e: EvidenciaEspera, oferta: Oferta, serie: Serie) {
  return e.series.get(`${oferta.id}#${serie.mod.codigo}`) ?? null;
}

export function distribuicaoQueda(e: EvidenciaEspera, oferta: Oferta, serie: Serie): DistQueda {
  const grupo = grupoEspera(serie.mod.codigo);
  const ref = serie.q50 ?? serie.corte ?? 600;
  const faixa = faixaEspera(e, ref);
  const perfil = e.perfis[grupo]?.[faixa]?.quantis ?? e.grupos[grupo]?.quantis ?? [0];
  const s = serieEspera(e, oferta, serie);
  const proprias = s ? s.hist.map(quedaObservada) : [];
  const n = proprias.length;
  const k = e.peso_perfil;
  if (!n) {
    return { valores: [...perfil], pesos: perfil.map(() => 1 / perfil.length), base: "perfil", ies: null, hist: [], grupo, faixa };
  }
  return {
    valores: [...proprias, ...perfil],
    pesos: [...proprias.map(() => 1 / (n + k)), ...perfil.map(() => k / (n + k) / perfil.length)],
    base: "propria",
    ies: s!.ies,
    hist: s!.hist,
    grupo,
    faixa,
  };
}

/** Quantil de uma distribuição discreta ponderada. */
export function quantilQueda(d: DistQueda, q: number): number {
  const ordem = d.valores.map((v, i) => [v, d.pesos[i]] as const).sort((a, b) => a[0] - b[0]);
  let acum = 0;
  for (const [v, w] of ordem) {
    acum += w;
    if (acum >= q - 1e-12) return v;
  }
  return ordem[ordem.length - 1][0];
}

/** P(alcançado até o fim da lista) por cenário, para uma série e sua distribuição de queda. */
function alcancePorCenario(motor: Motor, serie: Serie, nota: number, d: DistQueda, cen: Cenario): number[] {
  let soma: number[] | null = null;
  for (let j = 0; j < d.valores.length; j++) {
    const v = motor.cdfPorCenario(serie, nota + d.valores[j], cen);
    if (!v.length) return [];
    soma ??= new Array(v.length).fill(0);
    for (let c = 0; c < v.length; c++) soma[c] += d.pesos[j] * v[c];
  }
  return soma ?? [];
}

export interface VetoresEspera {
  /** P(selecionado na chamada regular) em cada cenário. */
  regular: number[];
  /** P(não selecionado na regular E alcançado depois pela lista de espera) em cada cenário. */
  espera: number[];
}

export function vetoresEspera(motor: Motor, e: EvidenciaEspera, oferta: Oferta, serie: Serie, nota: number, cen: Cenario = CENARIO_PADRAO): VetoresEspera {
  const regular = aprovacaoPorCenario(motor, oferta, serie, nota, cen);
  if (!regular.length) return { regular, espera: [] };
  const propria = alcancePorCenario(motor, serie, notaEfetiva(nota, serie), distribuicaoQueda(e, oferta, serie), cen);
  let viaAC: number[] = [];
  const ac = serie.mod.tipo === "L" ? serieAC(oferta) : undefined;
  if (ac && ac.centro != null) viaAC = alcancePorCenario(motor, ac, nota, distribuicaoQueda(e, oferta, ac), cen);
  const espera = regular.map((r, c) => {
    const alcance = Math.max(propria[c] ?? 0, viaAC[c] ?? 0, r);
    return Math.max(0, alcance - r);
  });
  return { regular, espera };
}

export interface ChanceEspera {
  regular: number;
  /** Vaga só pela lista de espera (sem ter passado na regular). */
  espera: number;
  total: number;
  /** Chance de ser chamado depois, para quem não passou na regular. null quando a regular já é quase certa. */
  seNaoPassar: number | null;
  dist: DistQueda;
  /** Nota até onde a lista costuma chegar: corte previsto menos a queda mediana. */
  alcanceTipico: number | null;
  quedaMediana: number;
  quedaP25: number;
  quedaP75: number;
}

export function chanceEspera(motor: Motor, e: EvidenciaEspera, oferta: Oferta, serie: Serie, nota: number, cen: Cenario = CENARIO_PADRAO): ChanceEspera | null {
  const v = vetoresEspera(motor, e, oferta, serie, nota, cen);
  if (!v.regular.length) return null;
  const regular = media(v.regular);
  const espera = media(v.espera);
  const dist = distribuicaoQueda(e, oferta, serie);
  const quedaMediana = quantilQueda(dist, 0.5);
  return {
    regular,
    espera,
    total: Math.min(1, regular + espera),
    seNaoPassar: regular < 0.95 ? Math.min(1, espera / (1 - regular)) : null,
    dist,
    alcanceTipico: serie.q50 != null ? serie.q50 - quedaMediana : null,
    quedaMediana,
    quedaP25: quantilQueda(dist, 0.25),
    quedaP75: quantilQueda(dist, 0.75),
  };
}
