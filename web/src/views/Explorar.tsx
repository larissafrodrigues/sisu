import { useEffect, useMemo, useState } from "react";
import type { Avaliacao } from "../core/avaliacao";
import { ROTULO_FAIXA, faixaDe, type Faixa } from "../core/probabilidade";
import { fmt, semAcento } from "../core/texto";
import { useApp } from "../state/store";
import { ListaOfertas } from "../ui/ListaOfertas";
import { LegendaRegua } from "../ui/Regua";

interface Filtros {
  q: string;
  uf: string;
  area: string;
  turno: string;
  grau: string;
  faixa: Faixa | "";
  ordem: "relevancia" | "chance" | "corte" | "vagas" | "margem";
  soPreferidos: boolean;
}

const PADRAO: Filtros = { q: "", uf: "", area: "", turno: "", grau: "", faixa: "", ordem: "relevancia", soPreferidos: false };
let inicial: Partial<Filtros> | null = null;
/** Permite que outra tela (o Painel) abra o Explorar já filtrado. */
export function definirFiltroInicial(f: Partial<Filtros>) { inicial = f; }

const PAGINA = 40;

export function Explorar() {
  const { base, estado, avaliacoes, temNotas } = useApp();
  const temPref = estado.perfil.cursos.length > 0 || estado.perfil.areas.length > 0;
  const [f, setF] = useState<Filtros>(() => {
    const ini = { ...PADRAO, soPreferidos: !!inicial && temPref, ...inicial };
    inicial = null;
    return ini;
  });
  const [limite, setLimite] = useState(PAGINA);
  useEffect(() => setLimite(PAGINA), [f]);
  const set = (p: Partial<Filtros>) => setF((x) => ({ ...x, ...p }));

  const lista = useMemo(() => {
    const termos = semAcento(f.q).split(/\s+/).filter(Boolean);
    const r = avaliacoes.filter((a) => {
      const o = a.oferta;
      if (f.uf && o.uf !== f.uf) return false;
      if (f.area && o.area !== f.area) return false;
      if (f.turno && o.turno !== f.turno) return false;
      if (f.grau && o.grau !== f.grau) return false;
      if (f.soPreferidos && !(a.cursoPreferido || estado.perfil.areas.includes(o.area))) return false;
      if (f.soPreferidos && estado.perfil.ufs.length && !estado.perfil.ufs.includes(o.uf)) return false;
      if (f.faixa && (!a.nota.elegivel || faixaDe(a.prob) !== f.faixa)) return false;
      return termos.every((t) => o.busca.includes(t));
    });
    const corte = (a: Avaliacao) => a.serie?.q50 ?? a.serie?.corte ?? 0;
    const ordens: Record<Filtros["ordem"], (x: Avaliacao, y: Avaliacao) => number> = {
      relevancia: (x, y) => y.afinidade - x.afinidade || (temNotas ? (y.prob ?? -1) - (x.prob ?? -1) || corte(y) - corte(x) : corte(y) - corte(x)),
      chance: (x, y) => (y.prob ?? -1) - (x.prob ?? -1) || corte(y) - corte(x),
      corte: (x, y) => corte(y) - corte(x),
      vagas: (x, y) => y.oferta.vagas - x.oferta.vagas,
      margem: (x, y) => Math.abs(x.margem ?? 1e9) - Math.abs(y.margem ?? 1e9),
    };
    return r.sort(ordens[f.ordem]);
  }, [avaliacoes, f, estado.perfil, temNotas]);

  const sel = (rot: string, chave: keyof Filtros, opcoes: string[], todos: string) => (
    <label className="campo" style={{ flex: "1 1 130px" }}>
      <span>{rot}</span>
      <select value={f[chave] as string} onChange={(e) => set({ [chave]: e.target.value } as Partial<Filtros>)}>
        <option value="">{todos}</option>
        {opcoes.map((o) => <option key={o}>{o}</option>)}
      </select>
    </label>
  );

  return (
    <>
      <div className="cab">
        <div>
          <h1>Explorar cursos</h1>
          <p>Todas as ofertas do SISU {base.anoBase}, com a previsão para {base.anoAlvo}. Clique em uma linha para ver histórico, modalidades e pesos.</p>
        </div>
      </div>

      <div className="painel">
        <div className="linha-flex" style={{ alignItems: "flex-end", gap: 12 }}>
          <label className="campo" style={{ flex: "3 1 260px" }}>
            <span>Buscar</span>
            <input type="search" value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder="Curso, instituição ou cidade — ex.: enfermagem ufba" />
          </label>
          {sel("Estado", "uf", base.ufs, "Todos")}
          {sel("Área", "area", base.areas, "Todas")}
          {sel("Turno", "turno", base.turnos, "Todos")}
          {sel("Grau", "grau", base.graus, "Todos")}
          <label className="campo" style={{ flex: "1 1 150px" }}>
            <span>Ordenar por</span>
            <select value={f.ordem} onChange={(e) => set({ ordem: e.target.value as Filtros["ordem"] })}>
              <option value="relevancia">Minhas preferências</option>
              {temNotas && <option value="chance">Maior chance</option>}
              {temNotas && <option value="margem">Mais perto do corte</option>}
              <option value="corte">Maior nota de corte</option>
              <option value="vagas">Mais vagas</option>
            </select>
          </label>
        </div>
        <div className="linha-flex" style={{ marginTop: 12 }}>
          {temNotas && (
            <div className="chips" role="group" aria-label="Faixa de chance">
              {(["alta", "moderada", "baixa", "remota"] as Faixa[]).map((x) => (
                <button key={x} className="chip" aria-pressed={f.faixa === x} onClick={() => set({ faixa: f.faixa === x ? "" : x })}>{ROTULO_FAIXA[x]}</button>
              ))}
            </div>
          )}
          {temPref && (
            <label className="marca-caixa pequeno">
              <input type="checkbox" checked={f.soPreferidos} onChange={(e) => set({ soPreferidos: e.target.checked })} />
              <span>Só meus cursos, áreas e estados</span>
            </label>
          )}
          <span className="pequeno mudo empurra">{fmt.int(lista.length)} ofertas</span>
          {JSON.stringify(f) !== JSON.stringify(PADRAO) && <button className="bt mini fantasma" onClick={() => setF(PADRAO)}>Limpar filtros</button>}
        </div>
      </div>

      {!temNotas && <p className="aviso" style={{ marginTop: 14 }}>Você ainda não informou suas notas. A lista mostra cortes e previsões; para ver chances, <a href="#/perfil">preencha o perfil</a>.</p>}

      <div style={{ margin: "14px 0 10px" }}><LegendaRegua anoBase={base.anoBase} anoAlvo={base.anoAlvo} /></div>
      <ListaOfertas itens={lista.slice(0, limite)} />
      {lista.length > limite && (
        <div style={{ textAlign: "center", marginTop: 14 }}>
          <button className="bt" onClick={() => setLimite((l) => l + PAGINA * 2)}>Mostrar mais ({fmt.int(lista.length - limite)} restantes)</button>
        </div>
      )}
    </>
  );
}
