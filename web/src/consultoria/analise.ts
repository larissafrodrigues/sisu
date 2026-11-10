/**
 * Recuperação de contexto: transforma a pergunta + o estado do app em fatos estruturados.
 * Os dados exibidos nas respostas são recuperados dos cálculos da plataforma.
 */
import type { Avaliacao } from "../core/avaliacao";
import { chanceEspera, type ChanceEspera } from "../core/espera";
import { recomendar, type Plano } from "../core/estrategia";
import { paraCandidatos, resolverLista, type ItemResolvido } from "../core/lista";
import { mediaSimples } from "../core/notas";
import { faixaDe, type Faixa, type Motor } from "../core/probabilidade";
import { semAcento } from "../core/texto";
import type { Base } from "../core/tipos";
import type { Estado } from "../state/store";

const ESTADOS: Record<string, string> = {
  acre: "AC", alagoas: "AL", amapa: "AP", amazonas: "AM", bahia: "BA", ceara: "CE", "distrito federal": "DF", brasilia: "DF",
  "espirito santo": "ES", goias: "GO", maranhao: "MA", "mato grosso do sul": "MS", "mato grosso": "MT", "minas gerais": "MG",
  para: "PA", paraiba: "PB", parana: "PR", pernambuco: "PE", piaui: "PI", "rio de janeiro": "RJ", "rio grande do norte": "RN",
  "rio grande do sul": "RS", rondonia: "RO", roraima: "RR", "santa catarina": "SC", "sao paulo": "SP", sergipe: "SE", tocantins: "TO",
};

export interface Entidades {
  cursos: string[];
  siglas: string[];
  ufs: string[];
  municipios: string[];
}

export interface Analise {
  entidades: Entidades;
  encontradas: Avaliacao[]; // ofertas ligadas à pergunta
  lista: ItemResolvido[];
  planos: Plano[];
  resumo: { faixa: Faixa; n: number }[]; // contagem por faixa nos cursos preferidos (ou no catálogo)
  universo: string;
  melhores: Avaliacao[]; // boas oportunidades dentro das preferências
  mediaSimples: number | null;
  /** Lista de espera das ofertas citadas, da lista e das melhores (id da oferta → estimativa). */
  espera: Map<string, ChanceEspera>;
  /** A pergunta é sobre lista de espera / ser chamado depois. */
  sobreEspera: boolean;
}

let indice: { cursos: [string, string][]; siglas: Map<string, string>; municipios: Map<string, string> } | null = null;

function indexar(base: Base) {
  if (indice) return indice;
  const cursos = base.cursos.map((c) => [semAcento(c), c] as [string, string]).sort((a, b) => b[0].length - a[0].length);
  const siglas = new Map(base.ies.map((i) => [semAcento(i.sigla), i.sigla]));
  const municipios = new Map(base.ofertas.map((o) => [semAcento(o.municipio), o.municipio]));
  indice = { cursos, siglas, municipios };
  return indice;
}

const limite = (s: string) => new RegExp(`(^|[^a-z0-9])${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9])`);

export function extrairEntidades(base: Base, pergunta: string): Entidades {
  const ix = indexar(base);
  let q = ` ${semAcento(pergunta)} `;
  const cursos: string[] = [];
  for (const [norm, nome] of ix.cursos) {
    if (norm.length >= 4 && limite(norm).test(q)) {
      cursos.push(nome);
      q = q.replace(norm, " "); // evita que "medicina veterinária" também case "medicina"
    }
  }
  if (!cursos.length) {
    // sem nome exato: palavras longas que aparecem em nomes de curso ("computação", "engenharia")
    const palavras = q.split(/[^a-z0-9]+/).filter((w) => w.length >= 6);
    for (const w of palavras) {
      const achados = ix.cursos.filter(([n]) => n.split(" ").includes(w)).map(([, nome]) => nome);
      if (achados.length && achados.length <= 40) cursos.push(...achados);
    }
  }
  const tokens = q.split(/[^a-z0-9]+/).filter(Boolean);
  const siglas = [...new Set(tokens.map((t) => ix.siglas.get(t)).filter((s): s is string => !!s && s.length >= 3))];
  const ufs = new Set<string>();
  for (const [nome, uf] of Object.entries(ESTADOS)) if (limite(nome).test(q)) ufs.add(uf);
  for (const m of pergunta.match(/\b[A-Z]{2}\b/g) ?? []) if (base.ufs.includes(m)) ufs.add(m);
  const municipios = [...ix.municipios].filter(([n]) => n.length >= 5 && limite(n).test(q)).map(([, nome]) => nome);
  return { cursos: [...new Set(cursos)], siglas, ufs: [...ufs], municipios };
}

export function analisar(base: Base, motor: Motor, estado: Estado, avaliacoes: Avaliacao[], porOferta: Map<string, Avaliacao>, pergunta: string): Analise {
  const e = extrairEntidades(base, pergunta);
  const temFiltro = e.cursos.length || e.siglas.length || e.municipios.length || e.ufs.length;
  let encontradas: Avaliacao[] = [];
  if (temFiltro) {
    encontradas = avaliacoes.filter((a) => {
      const o = a.oferta;
      if (e.cursos.length && !e.cursos.includes(o.curso)) return false;
      if (e.siglas.length && !e.siglas.includes(o.ies.sigla)) return false;
      if (e.municipios.length && !e.municipios.includes(o.municipio)) {
        if (!e.ufs.includes(o.uf)) return false;
      } else if (!e.municipios.length && e.ufs.length && !e.ufs.includes(o.uf)) return false;
      return true;
    });
    const local = !!(e.siglas.length || e.municipios.length || e.ufs.length);
    // se a pergunta não diz onde, valem os estados/turnos preferidos do perfil; depois, a chance
    encontradas.sort((x, y) => (local && e.cursos.length ? 0 : y.afinidade - x.afinidade) || (y.prob ?? -1) - (x.prob ?? -1));
    encontradas = encontradas.slice(0, 12);
  }

  const lista = resolverLista(estado.lista, porOferta);
  const planos = lista.length ? recomendar(motor, base.espera, paraCandidatos(lista)) : [];

  const p = estado.perfil;
  const temPref = p.cursos.length > 0 || p.areas.length > 0;
  const universoAv = avaliacoes.filter((a) => a.nota.elegivel && (!temPref || a.cursoPreferido || p.areas.includes(a.oferta.area)) && (!p.ufs.length || p.ufs.includes(a.oferta.uf)));
  const faixas: Faixa[] = ["alta", "moderada", "baixa", "remota"];
  const resumo = faixas.map((f) => ({ faixa: f, n: universoAv.filter((a) => faixaDe(a.prob) === f).length }));
  const melhores = universoAv
    .filter((a) => a.prob != null && a.prob >= 0.5)
    .sort((x, y) => y.afinidade - x.afinidade || (y.serie?.q50 ?? 0) - (x.serie?.q50 ?? 0))
    .slice(0, 8);

  const comNota = p.edicoes.filter((ed) => ed.notas.red > 0 && ed.notas.mt > 0);
  const espera = new Map<string, ChanceEspera>();
  for (const a of [...encontradas, ...melhores, ...lista.map((i) => ({ ...i.aval, serie: i.serie }))]) {
    if (espera.has(a.oferta.id) || !a.nota.elegivel || !a.serie) continue;
    const ce = chanceEspera(motor, base.espera, a.oferta, a.serie, a.nota.nota);
    if (ce) espera.set(a.oferta.id, ce);
  }
  const qn = semAcento(pergunta);
  const sobreEspera = /lista de espera|\bespera\b|ser chamad|for chamad|proximas chamadas|outras chamadas|segunda chamada|depois da (chamada )?regular/.test(qn);
  return {
    entidades: e, encontradas, lista, planos, resumo, melhores, espera, sobreEspera,
    universo: temPref ? "ofertas dos seus cursos e áreas de interesse" + (p.ufs.length ? ` em ${p.ufs.join(", ")}` : "") : "todas as ofertas do SISU" + (p.ufs.length ? ` em ${p.ufs.join(", ")}` : ""),
    mediaSimples: comNota.length ? Math.max(...comNota.map((ed) => mediaSimples(ed.notas))) : null,
  };
}
