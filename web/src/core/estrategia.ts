/**
 * Estratégia para as duas opções do SISU.
 *
 * Regras modeladas (Edital SISU 2026, itens 1.5, 3.5, 6.2 e 6.3):
 *   1. até duas opções, em ordem de preferência;
 *   2. quem alcança o corte da 1ª opção é selecionado nela; senão, tenta a 2ª;
 *   3. quem é selecionado em QUALQUER opção não pode entrar na lista de espera;
 *   4. quem não foi selecionado escolhe UMA das duas opções para a lista de espera.
 *
 * A regra 3 cria o dilema central: uma 2ª opção "garantida" protege contra ficar sem vaga,
 * mas elimina a chance de ser chamado depois na 1ª. Aqui isso é calculado, não opinado.
 */
import { vetoresEspera } from "./espera";
import { CENARIO_PADRAO, media, type Cenario, type Motor } from "./probabilidade";
import type { EvidenciaEspera, Oferta, Serie } from "./tipos";

export interface Candidato {
  oferta: Oferta;
  serie: Serie;
  nota: number;
  /** Interesse declarado, de 1 (aceitaria) a 5 (sonho). */
  interesse: number;
}

export { grupoEspera } from "./espera";

export interface Vetores {
  /** P(selecionado na chamada regular) em cada cenário. */
  regular: number[];
  /** P(NÃO selecionado na regular E alcançado depois pela lista de espera) em cada cenário. */
  espera: number[];
}

export function vetores(motor: Motor, espera: EvidenciaEspera, c: Candidato, cen: Cenario = CENARIO_PADRAO): Vetores {
  return vetoresEspera(motor, espera, c.oferta, c.serie, c.nota, cen);
}

export interface ResultadoPar {
  a: Candidato;
  b: Candidato | null;
  p1: number; // selecionado na 1ª opção (chamada regular)
  p2: number; // selecionado na 2ª opção (chamada regular)
  esperaEm: "a" | "b" | null; // melhor escolha de lista de espera
  pEspera: number; // vaga pela lista de espera escolhida
  pEsperaA: number;
  pEsperaB: number;
  pSemVaga: number;
  /** Chance de lista de espera na 1ª opção que a 2ª opção "consome" por selecionar antes. */
  custoDaSegunda: number;
  utilidade: number; // valor esperado, 0..1, ponderado pelo interesse
}

const u = (c: Candidato) => c.interesse / 5;

export function avaliarPar(a: Candidato, va: Vetores, b: Candidato | null, vb: Vetores | null, comEspera = true): ResultadoPar {
  const K = va.regular.length;
  if (!K) return { a, b, p1: 0, p2: 0, esperaEm: null, pEspera: 0, pEsperaA: 0, pEsperaB: 0, pSemVaga: 1, custoDaSegunda: 0, utilidade: 0 };
  let p1 = 0, p2 = 0, eA = 0, eB = 0, eAsozinha = 0;
  for (let k = 0; k < K; k++) {
    const A = va.regular[k];
    const B = vb?.regular[k] ?? 0;
    p1 += A;
    p2 += (1 - A) * B;
    eA += (1 - B) * va.espera[k]; // só entra na espera de A quem também não passou em B
    eB += vb ? (1 - A) * vb.espera[k] : 0;
    eAsozinha += va.espera[k];
  }
  p1 /= K; p2 /= K; eA /= K; eB /= K; eAsozinha /= K;
  let esperaEm: "a" | "b" | null = null;
  let pEspera = 0;
  if (comEspera) {
    const valA = eA * u(a);
    const valB = b ? eB * u(b) : -1;
    esperaEm = valA >= valB ? "a" : "b";
    pEspera = esperaEm === "a" ? eA : eB;
  }
  const utilidade = p1 * u(a) + (b ? p2 * u(b) : 0) + (esperaEm === "a" ? eA * u(a) : esperaEm === "b" && b ? eB * u(b) : 0);
  return {
    a, b, p1, p2, esperaEm, pEspera, pEsperaA: eA, pEsperaB: eB,
    pSemVaga: Math.max(0, 1 - p1 - p2 - pEspera),
    custoDaSegunda: Math.max(0, eAsozinha - eA),
    utilidade,
  };
}

export type PerfilRisco = "equilibrada" | "segura" | "ousada";

export interface Plano {
  perfil: PerfilRisco;
  titulo: string;
  resultado: ResultadoPar;
  porque: string;
}

export function chaveCandidato(c: Candidato): string {
  return `${c.oferta.id}#${c.serie.idx}`;
}

/**
 * Compara todos os pares ordenados da lista e devolve três planos:
 *  - equilibrada: maior valor esperado (interesse × probabilidade, incluindo lista de espera);
 *  - segura: maior chance de sair da chamada regular com vaga;
 *  - ousada: 1ª opção é a mais disputada entre as de maior interesse; a 2ª é a que mais
 *    agrega a partir dela.
 */
export function recomendar(motor: Motor, espera: EvidenciaEspera, candidatos: Candidato[], cen: Cenario = CENARIO_PADRAO, comEspera = true): Plano[] {
  const cs = candidatos.filter((c) => c.serie.centro != null);
  if (!cs.length) return [];
  const vs = cs.map((c) => vetores(motor, espera, c, cen));
  const pares: ResultadoPar[] = [];
  for (let i = 0; i < cs.length; i++) {
    if (cs.length === 1) pares.push(avaliarPar(cs[i], vs[i], null, null, comEspera));
    for (let j = 0; j < cs.length; j++) {
      if (i !== j && cs[i].oferta.id !== cs[j].oferta.id) pares.push(avaliarPar(cs[i], vs[i], cs[j], vs[j], comEspera));
    }
  }
  if (!pares.length) return [];
  const melhor = (f: (r: ResultadoPar) => number) => pares.reduce((m, r) => (f(r) > f(m) + 1e-12 ? r : m));
  const equilibrada = melhor((r) => r.utilidade);
  const segura = melhor((r) => r.p1 + r.p2 + r.utilidade * 1e-3);
  const maxInt = Math.max(...cs.map((c) => c.interesse));
  // entre os de maior interesse, o mais disputado que ainda tem alguma chance real
  const topo = cs.map((c, i) => ({ c, p: media(vs[i].regular) })).filter((x) => x.c.interesse === maxInt).sort((x, y) => x.p - y.p);
  const sonho = (topo.find((x) => x.p >= 0.03) ?? topo[topo.length - 1]).c;
  const ousada = pares.filter((r) => r.a === sonho).reduce((m, r) => (r.utilidade > m.utilidade ? r : m), pares.find((r) => r.a === sonho)!);

  const nome = (c: Candidato | null) => (c ? `${c.oferta.curso} (${c.oferta.ies.sigla})` : "—");
  const pc = (v: number) => `${Math.round(v * 100)}%`;
  const planos: Plano[] = [
    {
      perfil: "equilibrada", titulo: "Equilibrada", resultado: equilibrada,
      porque: `Maior valor esperado entre ${pares.length} combinações: pesa o quanto você quer cada curso pela chance de consegui-lo. ` +
        `${pc(equilibrada.p1 + equilibrada.p2)} de vaga na chamada regular.`,
    },
    {
      perfil: "segura", titulo: "Segura", resultado: segura,
      porque: `Maximiza a chance de sair da chamada regular com vaga (${pc(segura.p1 + segura.p2)}), ` +
        `mesmo que não seja no curso de maior interesse.`,
    },
    {
      perfil: "ousada", titulo: "Ousada", resultado: ousada,
      porque: `Coloca na 1ª opção ${nome(ousada.a)}, o mais disputado entre os que você mais quer (${pc(ousada.p1)} na regular), ` +
        `e usa a 2ª opção que mais protege a partir daí.`,
    },
  ];
  return planos;
}

export function mesmoPar(x: ResultadoPar, y: ResultadoPar): boolean {
  return x.a === y.a && x.b === y.b;
}
