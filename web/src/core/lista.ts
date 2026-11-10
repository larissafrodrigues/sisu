/** Converte a lista de interesse em candidatos para o módulo de estratégia. */
import { notaEfetiva, type Avaliacao } from "./avaliacao";
import type { Candidato } from "./estrategia";
import type { Serie } from "./tipos";

export interface ItemResolvido {
  aval: Avaliacao;
  serie: Serie | null;
  interesse: number;
  mod: string | null;
}

export function resolverLista(lista: { id: string; interesse: number; mod: string | null }[], porOferta: Map<string, Avaliacao>): ItemResolvido[] {
  const saida: ItemResolvido[] = [];
  for (const item of lista) {
    const aval = porOferta.get(item.id);
    if (!aval) continue; // oferta deixou de existir no catálogo
    const escolhida = item.mod ? aval.oferta.series.find((s) => String(s.idx) === item.mod || s.mod.codigo === item.mod) : null;
    saida.push({ aval, serie: escolhida ?? aval.serie, interesse: item.interesse, mod: item.mod });
  }
  return saida;
}

export function paraCandidatos(itens: ItemResolvido[], deltaNota = 0): Candidato[] {
  return itens
    .filter((i) => i.serie && i.aval.nota.elegivel)
    .map((i) => ({ oferta: i.aval.oferta, serie: i.serie!, nota: i.aval.nota.nota + deltaNota, interesse: i.interesse }));
}

export { notaEfetiva };
