/** Estado global: perfil, lista de interesse, comparação e consultor de orientação. */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { avaliarTudo, perfilTemNotas, type Avaliacao } from "../core/avaliacao";
import { Motor } from "../core/probabilidade";
import type { Base, Perfil } from "../core/tipos";

export interface ItemLista {
  id: string; // id da oferta
  interesse: number; // 1..5
  mod: string | null; // código da modalidade escolhida; null = melhor modalidade do perfil
}


export interface Estado {
  perfil: Perfil;
  lista: ItemLista[];
  comparar: string[];
}

export const MAX_COMPARAR = 3;
const CHAVE = "bussola-sisu:v1";

export function perfilVazio(anoAlvo: number): Perfil {
  const zero = { red: 0, lc: 0, mt: 0, ch: 0, cn: 0 };
  return {
    nome: "",
    edicoes: [anoAlvo - 1, anoAlvo - 2, anoAlvo - 3].map((ano) => ({ ano, notas: { ...zero } })),
    escolaPublica: false, rendaBaixa: false, raca: "nao", quilombola: false, pcd: false,
    cursos: [], areas: [], ufs: [], turnos: [], graus: [],
  };
}

function ler(anoAlvo: number): Estado {
  const padrao: Estado = {
    perfil: perfilVazio(anoAlvo),
    lista: [],
    comparar: [],
  };
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (!bruto) return padrao;
    const salvo = JSON.parse(bruto) as Partial<Estado>;
    return {
      perfil: { ...padrao.perfil, ...salvo.perfil },
      lista: salvo.lista ?? [],
      comparar: salvo.comparar ?? [],
    };
  } catch {
    return padrao; // armazenamento indisponível ou corrompido: segue só em memória
  }
}

interface Contexto {
  base: Base;
  motor: Motor;
  estado: Estado;
  temNotas: boolean;
  avaliacoes: Avaliacao[];
  porOferta: Map<string, Avaliacao>;
  setPerfil: (p: Perfil) => void;
  alternarLista: (id: string) => void;
  atualizarItem: (id: string, parcial: Partial<ItemLista>) => void;
  alternarComparar: (id: string) => void;
  detalhe: string | null;
  abrirDetalhe: (id: string | null) => void;
  limparTudo: () => void;
}

const Ctx = createContext<Contexto | null>(null);

export function Provedor({ base, children }: { base: Base; children: ReactNode }) {
  const [estado, setEstado] = useState<Estado>(() => ler(base.anoAlvo));
  const [detalhe, abrirDetalhe] = useState<string | null>(null);
  const motor = useMemo(() => new Motor(base.modelo), [base]);

  useEffect(() => {
    try {
      localStorage.setItem(CHAVE, JSON.stringify(estado));
    } catch {
      /* sem armazenamento: nada a fazer */
    }
  }, [estado]);

  const avaliacoes = useMemo(() => avaliarTudo(base, motor, estado.perfil), [base, motor, estado.perfil]);
  const porOferta = useMemo(() => new Map(avaliacoes.map((a) => [a.oferta.id, a])), [avaliacoes]);

  const setPerfil = useCallback((perfil: Perfil) => setEstado((e) => ({ ...e, perfil })), []);
  const alternarLista = useCallback((id: string) => setEstado((e) => ({
    ...e,
    lista: e.lista.some((x) => x.id === id) ? e.lista.filter((x) => x.id !== id) : [...e.lista, { id, interesse: 3, mod: null }],
  })), []);
  const atualizarItem = useCallback((id: string, parcial: Partial<ItemLista>) => setEstado((e) => ({
    ...e, lista: e.lista.map((x) => (x.id === id ? { ...x, ...parcial } : x)),
  })), []);
  const alternarComparar = useCallback((id: string) => setEstado((e) => ({
    ...e,
    comparar: e.comparar.includes(id) ? e.comparar.filter((x) => x !== id) : [...e.comparar, id].slice(-MAX_COMPARAR),
  })), []);
  const limparTudo = useCallback(() => setEstado((e) => ({ ...e, perfil: perfilVazio(base.anoAlvo), lista: [], comparar: [] })), [base]);

  const valor: Contexto = {
    base, motor, estado, temNotas: perfilTemNotas(estado.perfil), avaliacoes, porOferta,
    setPerfil, alternarLista, atualizarItem, alternarComparar, detalhe, abrirDetalhe, limparTudo,
  };
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useApp(): Contexto {
  const c = useContext(Ctx);
  if (!c) throw new Error("useApp fora do Provedor");
  return c;
}

/** Rota simples por hash: funciona em hospedagem estática sem configuração de servidor. */
export type Rota = "painel" | "perfil" | "explorar" | "comparar" | "estrategia" | "espera" | "consultor" | "metodo";
const ROTAS: Rota[] = ["painel", "perfil", "explorar", "comparar", "estrategia", "espera", "consultor", "metodo"];

export function useRota(): [Rota, (r: Rota) => void] {
  const lerHash = (): Rota => {
    const h = window.location.hash.replace(/^#\/?/, "") as Rota;
    return ROTAS.includes(h) ? h : "painel";
  };
  const [rota, setRota] = useState<Rota>(lerHash);
  useEffect(() => {
    const f = () => { setRota(lerHash()); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  return [rota, (r) => { window.location.hash = `/${r}`; }];
}
