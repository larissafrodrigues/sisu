/** Tipos de domínio compartilhados por todo o app. */

export type Area = "red" | "lc" | "mt" | "ch" | "cn";
export const AREAS: Area[] = ["red", "lc", "mt", "ch", "cn"];
export const NOME_AREA: Record<Area, string> = {
  red: "Redação",
  lc: "Linguagens",
  mt: "Matemática",
  ch: "Ciências Humanas",
  cn: "Ciências da Natureza",
};

export const NOME_CURTO: Record<Area, string> = { red: "Redação", lc: "Linguagens", mt: "Matemática", ch: "Humanas", cn: "Natureza" };

export type Notas = Record<Area, number>;

/** Notas de uma edição do Enem informadas pela pessoa. */
export interface EdicaoEnem {
  ano: number;
  notas: Notas;
}

export interface Perfil {
  nome: string;
  edicoes: EdicaoEnem[];
  /** Situação para a Lei de Cotas. */
  escolaPublica: boolean;
  rendaBaixa: boolean; // renda familiar per capita de até 1 salário mínimo
  raca: "nao" | "pp" | "indigena";
  quilombola: boolean;
  pcd: boolean;
  /** Preferências usadas para ordenar as oportunidades. */
  cursos: string[]; // nomes de curso
  areas: string[];
  ufs: string[];
  turnos: string[];
  graus: string[];
}

export interface Ies {
  sigla: string;
  nome: string;
  categoria: string;
  organizacao: string;
}

export interface Oferta {
  i: number; // índice no catálogo
  id: string; // chave estável (código e-MEC + turno)
  ies: Ies;
  campus: string;
  municipio: string;
  uf: string;
  regiao: string;
  curso: string;
  grau: string;
  turno: string;
  area: string;
  pesos: Notas;
  minimas: Notas & { media: number };
  pesosAno: number | null;
  pesosFonte: string;
  vagas: number;
  semestres: number | null;
  series: Serie[];
  busca: string; // texto normalizado para pesquisa
}

export type TipoModalidade = "A" | "L" | "V" | "B";

export interface Modalidade {
  codigo: string;
  rotulo: string;
  tipo: TipoModalidade;
}

/** Uma modalidade de concorrência dentro de uma oferta. */
export interface Serie {
  idx: number; // índice global (liga com o histórico)
  oferta: number;
  mod: Modalidade;
  vagas: number | null;
  inscritos: number | null;
  corte: number | null; // nota de corte da última edição
  corteAnterior: number | null;
  centro: number | null; // previsão central do modelo (antes dos cenários)
  escala: number | null; // tamanho típico do erro próprio da série
  q10: number | null;
  q50: number | null;
  q90: number | null;
  nHist: number;
  confianca: 0 | 1 | 2;
  bonus: number;
  desc: number; // índice em descricoes.json (-1 se não houver)
}

export interface ParametrosModelo {
  cenarios: { centros: number[]; valores: number[][]; inflacao: number };
  z: { probs: number[]; valores: number[] };
  choques: { anos: number[]; centros: number[]; valores: number[][] };
}

/** Um ano do histórico de lista de espera de um curso/modalidade (UFV ou UFMG). */
export interface HistEspera {
  ano: number;
  regular: number; // nota de corte da chamada regular
  final: number | null; // menor nota convocada na lista de espera (null: ninguém foi convocado)
  convocados: number | null; // só a UFV publica as contagens
  lista: number | null;
  esgotou: boolean | null; // todos os candidatos da lista foram convocados
}

export interface CelulaPerfil {
  n: number;
  base: string;
  n_base: number;
  sem_queda: number | null;
  mediana: number;
  quantis: number[];
}

export interface InfoIesEspera {
  titulo: string;
  origem: string;
  series: number;
  cursos: number;
  cursos_no_catalogo: number;
  queda_mediana: number;
  queda_p25: number;
  queda_p75: number;
  esgotou: number | null;
  anos: Record<string, { chamadas: number; convocados_regular: number | null; convocados_espera: number | null }>;
}

export interface EvidenciaEspera {
  fonte: string;
  anos: number[];
  probs: number[];
  limites: number[];
  rotulos_faixa: string[];
  peso_perfil: number;
  n: number;
  grupos: Record<string, { n: number; sem_queda: number; mediana: number; quantis: number[] }>;
  nome_grupo: Record<string, string>;
  /** grupo → uma célula por faixa de nota de corte */
  perfis: Record<string, CelulaPerfil[]>;
  ies: Record<string, InfoIesEspera>;
  /** chave `${idDaOferta}#${modalidade}` */
  series: Map<string, { ies: string; hist: HistEspera[] }>;
  validacao: any;
}

export interface Base {
  anoBase: number;
  anoAlvo: number;
  anos: number[];
  geradoEm: string;
  ofertas: Oferta[];
  series: Serie[];
  porId: Map<string, Oferta>;
  cursos: string[];
  areas: string[];
  ufs: string[];
  regioes: string[];
  turnos: string[];
  graus: string[];
  ies: Ies[];
  modalidades: Modalidade[];
  tendencias: Map<string, (number | null)[]>;
  modelo: ParametrosModelo;
  espera: EvidenciaEspera;
  contagens: Record<string, number>;
}

export interface Historico {
  anos: number[];
  anosVI: number[];
  cortes: Map<number, (number | null)[]>;
  vagas: Map<number, (number | null)[]>;
  inscritos: Map<number, (number | null)[]>;
}
