import { Fragment, useEffect, useMemo, useState } from "react";
import { chanceEspera, type ChanceEspera } from "../core/espera";
import { fmt, semAcento } from "../core/texto";
import type { Avaliacao } from "../core/avaliacao";
import { useApp, type Rota } from "../state/store";
import { BlocoEspera, SeloBase } from "../ui/BlocoEspera";
import { BuscaMulti, Chips } from "../ui/Campos";
import { Chance } from "../ui/Chance";
import { Ic } from "../ui/Icones";

type Ordem = "depois" | "total" | "corte" | "nome";
interface Filtros { ies: string[]; ufs: string[]; q: string; ordem: Ordem; soComChance: boolean }

const PAGINA = 40;
// a tela abre com a UFV; a escolha vale enquanto o site está aberto
let lembrado: Filtros = { ies: ["UFV"], ufs: [], q: "", ordem: "depois", soComChance: true };

interface Linha { a: Avaliacao; ce: ChanceEspera }

export function ListaEspera({ ir }: { ir: (r: Rota) => void }) {
  const { base, motor, avaliacoes, temNotas, estado, abrirDetalhe, alternarLista } = useApp();
  const [f, setF] = useState<Filtros>(lembrado);
  const [aberto, setAberto] = useState<string | null>(null);
  const [limite, setLimite] = useState(PAGINA);
  useEffect(() => { lembrado = f; setLimite(PAGINA); }, [f]);
  const set = (p: Partial<Filtros>) => setF((x) => ({ ...x, ...p }));

  const siglas = useMemo(() => [...new Set(base.ies.map((i) => i.sigla))].sort(), [base]);
  const comDados = Object.keys(base.espera.ies).sort();

  const linhas = useMemo(() => {
    if (!temNotas) return [] as Linha[];
    const termos = semAcento(f.q).split(/\s+/).filter(Boolean);
    const out: Linha[] = [];
    for (const a of avaliacoes) {
      const o = a.oferta;
      if (f.ies.length && !f.ies.includes(o.ies.sigla)) continue;
      if (f.ufs.length && !f.ufs.includes(o.uf)) continue;
      if (!termos.every((t) => o.busca.includes(t))) continue;
      if (!a.nota.elegivel || !a.serie) continue;
      const ce = chanceEspera(motor, base.espera, o, a.serie, a.nota.nota);
      if (!ce) continue;
      if (f.soComChance && ce.total < 0.01) continue;
      out.push({ a, ce });
    }
    const corte = (l: Linha) => l.a.serie?.q50 ?? 0;
    const ordens: Record<Ordem, (x: Linha, y: Linha) => number> = {
      depois: (x, y) => (y.ce.seNaoPassar ?? -1) - (x.ce.seNaoPassar ?? -1) || y.ce.total - x.ce.total,
      total: (x, y) => y.ce.total - x.ce.total || corte(y) - corte(x),
      corte: (x, y) => corte(y) - corte(x),
      nome: (x, y) => x.a.oferta.curso.localeCompare(y.a.oferta.curso, "pt-BR") || x.a.oferta.ies.sigla.localeCompare(y.a.oferta.ies.sigla),
    };
    return out.sort(ordens[f.ordem]);
  }, [avaliacoes, f, motor, base, temNotas]);

  const semFiltro = !f.ies.length && !f.ufs.length && !f.q.trim();
  const iesSemDados = f.ies.filter((s) => !base.espera.ies[s]);

  return (
    <>
      <div className="cab">
        <div>
          <h1>Lista de espera</h1>
          <p>
            A chance de ser chamado <strong>depois</strong> da chamada regular, quando a instituição convoca a lista de espera. Para a UFV e a UFMG usamos o histórico de cada curso;
            para as demais, o padrão dessas duas em cursos com nota de corte parecida.
          </p>
        </div>
      </div>

      <div className="painel">
        <div className="grade-filtros-esp">
          <div className="campo">
            <span>Instituições</span>
            <div className="chips" style={{ marginBottom: 8 }}>
              {comDados.map((s) => (
                <button key={s} type="button" className="chip" aria-pressed={f.ies.includes(s)}
                  onClick={() => set({ ies: f.ies.includes(s) ? f.ies.filter((x) => x !== s) : [...f.ies, s] })}>
                  {s} <span className="pequeno" style={{ opacity: 0.75 }}>· dados próprios</span>
                </button>
              ))}
            </div>
            <BuscaMulti opcoes={siglas.filter((s) => !comDados.includes(s))} valor={f.ies.filter((s) => !comDados.includes(s))}
              onChange={(v) => set({ ies: [...f.ies.filter((s) => comDados.includes(s)), ...v] })} placeholder="Adicionar outra instituição: digite a sigla (ex.: UFJF, UFLA, UFOP)" />
          </div>
          <div className="campo">
            <span>Estados {f.ufs.length ? "" : <span className="mudo">(todos)</span>}</span>
            <Chips opcoes={base.ufs} valor={f.ufs} onChange={(ufs) => set({ ufs })} />
          </div>
        </div>
        <div className="linha-flex" style={{ alignItems: "flex-end", marginTop: 14 }}>
          <label className="campo" style={{ flex: "3 1 240px" }}>
            <span>Curso ou cidade</span>
            <input type="search" value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder="ex.: engenharia, viçosa, florestal" />
          </label>
          <label className="campo" style={{ flex: "1 1 200px" }}>
            <span>Ordenar por</span>
            <select value={f.ordem} onChange={(e) => set({ ordem: e.target.value as Ordem })}>
              <option value="depois">Maior chance depois da regular</option>
              <option value="total">Maior chance ao todo</option>
              <option value="corte">Maior nota de corte</option>
              <option value="nome">Nome do curso</option>
            </select>
          </label>
          <label className="marca-caixa pequeno" style={{ flex: "1 1 200px", marginBottom: 8 }}>
            <input type="checkbox" checked={f.soComChance} onChange={(e) => set({ soComChance: e.target.checked })} />
            <span>Esconder cursos em que a chance é menor que 1%</span>
          </label>
          {!semFiltro && <button className="bt mini fantasma" style={{ marginBottom: 6 }} onClick={() => set({ ies: [], ufs: [], q: "" })}>Limpar filtros</button>}
        </div>
      </div>

      {(f.ies.length > 0) && (
        <div className="cartoes-ies">
          {f.ies.filter((s) => base.espera.ies[s]).map((s) => {
            const i = base.espera.ies[s];
            const anos = Object.entries(i.anos);
            const chamadas = anos.map(([, v]) => v.chamadas).filter(Boolean);
            const conv = anos.map(([, v]) => v.convocados_espera).filter((v): v is number => v != null);
            const reg = anos.map(([, v]) => v.convocados_regular).filter((v): v is number => v != null);
            return (
              <section key={s} className="painel cartao-ies">
                <h3>{s} <span className="selo-esp propria">dados próprios</span></h3>
                <ul>
                  <li><strong>{fmt.int(i.cursos_no_catalogo)}</strong> cursos com histórico de {base.espera.anos[0]} a {base.espera.anos[1]}</li>
                  <li>de {Math.min(...chamadas)} a {Math.max(...chamadas)} chamadas por edição, contando a regular</li>
                  {conv.length > 0 && <li>a lista de espera convocou <strong>{fmt.int(sum(conv) / conv.length)}</strong> candidatos por ano, para {fmt.int(sum(reg) / reg.length)} na chamada regular</li>}
                  <li>a lista desceu, em mediana, <strong>{fmt.nota1(i.queda_mediana)} pontos</strong> abaixo do corte da regular{i.esgotou != null && <>; zerou em {Math.round(i.esgotou * 100)}% das modalidades</>}</li>
                </ul>
                <p className="pequeno mudo"><a href={i.origem} target="_blank" rel="noreferrer">Fonte oficial</a></p>
              </section>
            );
          })}
          {iesSemDados.length > 0 && (
            <section className="painel cartao-ies">
              <h3>{iesSemDados.join(", ")} <span className="selo-esp">padrão geral</span></h3>
              <p className="mudo" style={{ marginTop: 6 }}>
                {iesSemDados.length === 1 ? "Esta instituição não publica" : "Estas instituições não publicam"} as notas da lista de espera em um formato que a plataforma consiga ler.
                A estimativa usa o padrão da UFV e da UFMG para cursos com nota de corte parecida. Na validação, esse padrão acertou a faixa de 80% em 71% a 85% dos casos ao prever uma universidade com os dados da outra.
              </p>
            </section>
          )}
        </div>
      )}

      {!temNotas ? (
        <div className="painel sem" style={{ marginTop: 16 }}>
          <h3>Informe suas notas para ver as chances</h3>
          <p style={{ margin: "6px auto 14px", maxWidth: "52ch" }}>A chance pela lista de espera depende da sua nota em cada curso. Pode ser uma estimativa.</p>
          <button className="bt pri" onClick={() => ir("perfil")}>Preencher o perfil</button>
        </div>
      ) : (
        <>
          <p className="pequeno mudo" style={{ margin: "16px 2px 8px" }}>
            {fmt.int(linhas.length)} cursos{f.ies.length ? ` em ${f.ies.join(", ")}` : ""}{f.ufs.length ? ` (${f.ufs.join(", ")})` : ""}. Clique em uma linha para ver o histórico e a conta.
          </p>
          <div className="esp-lista">
            <div className="esp-cab">
              <span>Curso e instituição</span><span className="num">Sua nota</span><span className="num">Corte previsto · lista chega a</span>
              <span>Regular</span><span>Se não passar</span><span>Ao todo</span><span />
            </div>
            {!linhas.length && <div className="sem">{semFiltro ? "Escolha uma instituição ou um estado." : "Nenhum curso com esses filtros."}</div>}
            {linhas.slice(0, limite).map(({ a, ce }) => {
              const o = a.oferta, s = a.serie!;
              const k = o.id;
              const naLista = estado.lista.some((x) => x.id === o.id);
              return (
                <Fragment key={k}>
                  <div className="esp-lin" role="button" tabIndex={0} aria-expanded={aberto === k}
                    onClick={() => setAberto(aberto === k ? null : k)}
                    onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); setAberto(aberto === k ? null : k); } }}>
                    <div style={{ minWidth: 0 }}>
                      <div className="tit">{o.curso}{s.mod.codigo !== "AC" && <span className="tagm" title={s.mod.rotulo}>{s.mod.codigo.replace("_", " ")}</span>}</div>
                      <div className="meta">{o.ies.sigla} · {o.municipio}/{o.uf} · {o.turno} · <SeloBase ce={ce} /></div>
                    </div>
                    <div className="num"><span className="rot-m">Sua nota </span>{fmt.nota1(a.nota.nota)}</div>
                    <div className="num"><span className="rot-m">Corte previsto </span>{fmt.nota1(s.q50)} <span className="mudo">→ {fmt.nota1(ce.alcanceTipico)}</span></div>
                    <div><span className="rot-m">Regular </span><Chance p={ce.regular} /></div>
                    <div><span className="rot-m">Se não passar </span>{ce.seNaoPassar == null ? <span className="pequeno mudo">já passa</span> : <Chance p={ce.seNaoPassar} />}</div>
                    <div><span className="rot-m">Ao todo </span><Chance p={ce.total} /></div>
                    <div className="acoes" onClick={(ev) => ev.stopPropagation()}>
                      <button className="icone-bt" aria-pressed={naLista} title={naLista ? "Tirar da minha lista" : "Adicionar à minha lista"} onClick={() => alternarLista(o.id)}>
                        {Ic.marcador(naLista)}<span className="sr">{naLista ? "Tirar da minha lista" : "Adicionar à minha lista"}</span>
                      </button>
                    </div>
                  </div>
                  {aberto === k && (
                    <div className="esp-aberto">
                      <BlocoEspera base={base} oferta={o} serie={s} ce={ce} />
                      <div className="linha-flex" style={{ marginTop: 12 }}>
                        <button className="bt mini" onClick={() => abrirDetalhe(o.id)}>Ver o curso completo</button>
                        <button className="bt mini" onClick={() => ir("estrategia")}>Usar na estratégia das duas opções</button>
                      </div>
                    </div>
                  )}
                </Fragment>
              );
            })}
          </div>
          {linhas.length > limite && (
            <div style={{ textAlign: "center", marginTop: 14 }}>
              <button className="bt" onClick={() => setLimite((l) => l + PAGINA * 2)}>Mostrar mais ({fmt.int(linhas.length - limite)} restantes)</button>
            </div>
          )}
          <p className="pequeno mudo" style={{ marginTop: 16, maxWidth: "80ch" }}>
            Só entra na lista de espera quem não foi selecionado em nenhuma das duas opções, e apenas para uma delas [Edital SISU 2026, itens 6.2 e 6.3].
            “Se não passar” é a chance de ser chamado depois para quem ficou de fora da regular nesse curso. Cada instituição decide quantas chamadas faz; confira o edital dela.
          </p>
        </>
      )}
    </>
  );
}

function sum(v: number[]): number {
  return v.reduce((s, x) => s + x, 0);
}
