import { useMemo, useState } from "react";
import { avaliarPar, chaveCandidato, mesmoPar, recomendar, vetores, type Candidato, type ResultadoPar } from "../core/estrategia";
import { paraCandidatos, resolverLista } from "../core/lista";
import { media } from "../core/probabilidade";
import { fmt } from "../core/texto";
import { useApp, type Rota } from "../state/store";
import { Chance } from "../ui/Chance";
import { Desfechos } from "../ui/Desfechos";
import { Ic } from "../ui/Icones";

function Estrelas({ valor, onChange }: { valor: number; onChange: (v: number) => void }) {
  return (
    <span className="estrelas" role="group" aria-label={`Interesse: ${valor} de 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} className={n <= valor ? "on" : ""} onClick={() => onChange(n)} title={`Interesse ${n} de 5`}>
          {Ic.estrela(n <= valor, 17)}<span className="sr">{n}</span>
        </button>
      ))}
    </span>
  );
}

function Opcao({ ord, c }: { ord: string; c: Candidato | null }) {
  return (
    <div className="opcao">
      <span className="ord">{ord}</span>
      {c ? <span className="n1">{c.oferta.curso}</span> : <span className="n1 mudo">Sem 2ª opção</span>}
      {c && <span className="n2">{c.oferta.ies.sigla} · {c.oferta.municipio}/{c.oferta.uf} · {c.oferta.turno}{c.serie.mod.codigo !== "AC" ? ` · ${c.serie.mod.codigo}` : ""}</span>}
    </div>
  );
}

export function Estrategia({ ir }: { ir: (r: Rota) => void }) {
  const { base, motor, estado, porOferta, avaliacoes, temNotas, alternarLista, atualizarItem, abrirDetalhe } = useApp();
  const [delta, setDelta] = useState(0); // ajuste hipotético na nota do estudante
  const [fixarChoque, setFixarChoque] = useState(false);
  const [choque, setChoque] = useState(0);
  const [comEspera, setComEspera] = useState(true);
  const [manual, setManual] = useState<{ a: string; b: string }>({ a: "", b: "" });

  const itens = useMemo(() => resolverLista(estado.lista, porOferta), [estado.lista, porOferta]);
  const cen = useMemo(() => ({ choque: fixarChoque ? choque : null }), [fixarChoque, choque]);
  const cands = useMemo(() => paraCandidatos(itens, delta), [itens, delta]);
  const vets = useMemo(() => new Map(cands.map((c) => [chaveCandidato(c), vetores(motor, base.espera, c, cen)])), [cands, motor, base, cen]);
  const planos = useMemo(() => recomendar(motor, base.espera, cands, cen, comEspera), [motor, base, cands, cen, comEspera]);

  const sugestoes = useMemo(() => {
    if (!temNotas) return [];
    const ja = new Set(estado.lista.map((x) => x.id));
    return avaliacoes
      .filter((a) => a.nota.elegivel && a.prob != null && a.prob >= 0.15 && !ja.has(a.oferta.id) && a.afinidade >= 0.6)
      .sort((x, y) => y.afinidade - x.afinidade || (y.serie?.q50 ?? 0) - (x.serie?.q50 ?? 0))
      .slice(0, 5);
  }, [avaliacoes, estado.lista, temNotas]);

  const porChave = new Map(cands.map((c) => [chaveCandidato(c), c]));
  const cA = porChave.get(manual.a) ?? planos[0]?.resultado.a ?? null;
  const cB = manual.b === "nenhuma" ? null : porChave.get(manual.b) ?? (manual.a ? null : planos[0]?.resultado.b ?? null);
  const sim: ResultadoPar | null = cA ? avaliarPar(cA, vets.get(chaveCandidato(cA))!, cB && cB !== cA ? cB : null, cB && cB !== cA ? vets.get(chaveCandidato(cB))! : null, comEspera) : null;
  const invertido: ResultadoPar | null = sim && sim.b ? avaliarPar(sim.b, vets.get(chaveCandidato(sim.b))!, sim.a, vets.get(chaveCandidato(sim.a))!, comEspera) : null;

  if (!temNotas) {
    return (
      <>
        <div className="cab"><div><h1>Estratégia</h1><p>A ordem das duas opções muda o resultado. Aqui ela é calculada.</p></div></div>
        <div className="painel sem"><h3>Primeiro, suas notas</h3><p>Sem notas não há chance para calcular.</p><button className="bt pri" style={{ marginTop: 14 }} onClick={() => ir("perfil")}>Preencher perfil</button></div>
      </>
    );
  }

  return (
    <>
      <div className="cab">
        <div>
          <h1>Estratégia para as duas opções</h1>
          <p>
            Quem é selecionado em qualquer opção fica fora da lista de espera. Por isso uma 2ª opção “garantida” protege você, mas custa a chance de ser chamado depois na 1ª. Dê uma nota de interesse a cada curso e compare os planos.
          </p>
        </div>
      </div>

      <section className="painel">
        <div className="linha-flex" style={{ marginBottom: 10 }}>
          <h2>Minha lista</h2>
          <button className="bt mini empurra" onClick={() => ir("explorar")}>Buscar mais cursos</button>
        </div>
        {itens.length === 0 ? (
          <p className="mudo">Sua lista está vazia. Adicione cursos pelo botão {Ic.marcador(false)} em qualquer lista{sugestoes.length ? ", ou comece por estas sugestões:" : "."}</p>
        ) : (
          <div className="tab-wrap">
            <table>
              <thead><tr><th>Curso</th><th>Quanto você quer</th><th>Modalidade</th><th className="num">Sua nota</th><th className="num">Previsão (80%)</th><th className="num">Chance</th><th /></tr></thead>
              <tbody>
                {itens.map((it) => {
                  const o = it.aval.oferta;
                  const c = cands.find((x) => x.oferta.id === o.id);
                  const p = c ? media(vets.get(chaveCandidato(c))!.regular) : null;
                  return (
                    <tr key={o.id}>
                      <td><button className="bt fantasma" style={{ padding: 0, color: "var(--tinta)", whiteSpace: "normal", textAlign: "left" }} onClick={() => abrirDetalhe(o.id)}>{o.curso}</button>
                        <div className="pequeno mudo">{o.ies.sigla} · {o.municipio}/{o.uf} · {o.turno}</div></td>
                      <td><Estrelas valor={it.interesse} onChange={(v) => atualizarItem(o.id, { interesse: v })} /></td>
                      <td className="pequeno">{it.serie?.mod.tipo === "V" ? "Ação afirmativa própria" : it.serie?.mod.rotulo ?? "—"}</td>
                      <td className="num">{it.aval.nota.elegivel ? fmt.nota(it.aval.nota.nota + delta) : <span className="mudo" title={it.aval.nota.motivo ?? ""}>não cumpre a mínima</span>}</td>
                      <td className="num">{it.serie?.q50 != null ? `${fmt.nota1(it.serie.q50)} (${fmt.nota1(it.serie.q10)}–${fmt.nota1(it.serie.q90)})` : "sem referência"}</td>
                      <td className="num"><Chance p={p} /></td>
                      <td><button className="icone-bt" title="Tirar da lista" onClick={() => alternarLista(o.id)}>{Ic.fechar()}<span className="sr">Tirar da lista</span></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {sugestoes.length > 0 && itens.length < 4 && (
          <div className="chips" style={{ marginTop: 12 }}>
            {sugestoes.map((a) => (
              <button key={a.oferta.id} className="chip" onClick={() => alternarLista(a.oferta.id)}>+ {a.oferta.curso} · {a.oferta.ies.sigla} ({fmt.pct(a.prob)})</button>
            ))}
          </div>
        )}
      </section>

      {cands.length >= 1 && (
        <>
          <section className="secao">
            <h2>Três planos, três apetites de risco</h2>
            <div className="grade3">
              {planos.map((pl) => {
                const igual = planos.find((x) => x !== pl && planos.indexOf(x) < planos.indexOf(pl) && mesmoPar(x.resultado, pl.resultado));
                const ativo = sim != null && mesmoPar(sim, pl.resultado);
                return (
                  <div key={pl.perfil} className={`painel plano${ativo ? " ativo" : ""}`}>
                    <h3>{pl.titulo}</h3>
                    <div style={{ display: "grid", gap: 8 }}>
                      <Opcao ord="1ª" c={pl.resultado.a} />
                      <Opcao ord="2ª" c={pl.resultado.b} />
                    </div>
                    <Desfechos r={pl.resultado} compacto />
                    <p className="pequeno mudo">{igual ? `Mesma combinação do plano ${igual.titulo.toLowerCase()}: com esta lista, os dois critérios apontam para o mesmo lugar.` : pl.porque}</p>
                    <button className="bt mini" style={{ alignSelf: "flex-start", marginTop: "auto" }} disabled={ativo}
                      onClick={() => setManual({ a: chaveCandidato(pl.resultado.a), b: pl.resultado.b ? chaveCandidato(pl.resultado.b) : "nenhuma" })}>
                      {ativo ? "No simulador abaixo" : "Abrir no simulador"}
                    </button>
                  </div>
                );
              })}
            </div>
            {cands.length < 2 && <p className="aviso" style={{ marginTop: 12 }}>Com um curso só não há ordem a decidir. Adicione pelo menos mais um para comparar combinações.</p>}
          </section>

          <section className="painel">
            <h2>Simulador</h2>
            <p className="mudo" style={{ margin: "6px 0 14px" }}>Monte a sua própria combinação e teste hipóteses: e se eu tirar 20 pontos a menos? E se as notas de corte subirem?</p>
            <div className="grade2">
              <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
                <label className="campo"><span>1ª opção</span>
                  <select value={cA ? chaveCandidato(cA) : ""} onChange={(e) => setManual((m) => ({ a: e.target.value, b: m.b || (cB ? chaveCandidato(cB) : "nenhuma") }))}>
                    {cands.map((c) => <option key={chaveCandidato(c)} value={chaveCandidato(c)}>{c.oferta.curso} · {c.oferta.ies.sigla} · {c.oferta.turno}</option>)}
                  </select>
                </label>
                <label className="campo"><span>2ª opção</span>
                  <select value={cB && cB !== cA ? chaveCandidato(cB) : "nenhuma"} onChange={(e) => setManual((m) => ({ a: m.a || (cA ? chaveCandidato(cA) : ""), b: e.target.value }))}>
                    <option value="nenhuma">Nenhuma</option>
                    {cands.filter((c) => c !== cA).map((c) => <option key={chaveCandidato(c)} value={chaveCandidato(c)}>{c.oferta.curso} · {c.oferta.ies.sigla} · {c.oferta.turno}</option>)}
                  </select>
                </label>
                <div className="campo">
                  <span>E se a minha nota for diferente? ({delta > 0 ? "+" : delta < 0 ? "−" : ""}{Math.abs(delta)} pontos)</span>
                  <div className="deslizante"><input type="range" min={-40} max={40} step={1} value={delta} onChange={(e) => setDelta(Number(e.target.value))} aria-label="Ajuste na nota" /><button className="bt mini fantasma" onClick={() => setDelta(0)}>zerar</button></div>
                </div>
                <div className="campo">
                  <label className="marca-caixa"><input type="checkbox" checked={fixarChoque} onChange={(e) => setFixarChoque(e.target.checked)} />
                    <span>Fixar um cenário para a edição<br /><span className="pequeno mudo">Desmarcado, usamos a mistura de {motor.nCenarios} cenários históricos.</span></span></label>
                  {fixarChoque && (
                    <div className="deslizante"><input type="range" min={-35} max={35} step={1} value={choque} onChange={(e) => setChoque(Number(e.target.value))} aria-label="Choque da edição" />
                      <span className="pequeno" style={{ fontWeight: 650 }}>{choque > 0 ? "+" : choque < 0 ? "−" : ""}{Math.abs(choque)}</span></div>
                  )}
                  {fixarChoque && <span className="pequeno mudo">{choque > 0 ? "Notas de corte sobem em relação ao previsto (cenário pior para você)." : choque < 0 ? "Notas de corte caem em relação ao previsto." : "Edição sem surpresa: cortes como o modelo prevê."} Em 2026 as mais baixas subiram cerca de 36 pontos; em 2021 caíram 23.</span>}
                </div>
                <label className="marca-caixa"><input type="checkbox" checked={comEspera} onChange={(e) => setComEspera(e.target.checked)} />
                  <span>Contar com a lista de espera<br /><span className="pequeno mudo">Estimativa fraca, baseada só na UFMG. Desmarque para ver o cenário sem ela.</span></span></label>
              </div>
              <div>
                {sim && (
                  <>
                    <div style={{ display: "grid", gap: 8, marginBottom: 14 }}><Opcao ord="1ª" c={sim.a} /><Opcao ord="2ª" c={sim.b} /></div>
                    <Desfechos r={sim} />
                    <div style={{ display: "grid", gap: 8, marginTop: 16 }}>
                      {sim.b && sim.custoDaSegunda > 0.01 && (
                        <p className="aviso">Com esta 2ª opção você abre mão de <strong>{fmt.pct(sim.custoDaSegunda)}</strong> de chance de ser chamado depois na 1ª, porque quem é selecionado na 2ª não entra na lista de espera. Em troca, a chance de ficar sem vaga é de {fmt.pct(sim.pSemVaga)}.</p>
                      )}
                      {invertido && Math.abs(invertido.utilidade - sim.utilidade) > 0.005 && (
                        <p className="pequeno mudo">Invertendo a ordem: {fmt.pct(invertido.p1)} na 1ª, {fmt.pct(invertido.p2)} na 2ª, {fmt.pct(invertido.pSemVaga)} sem vaga. {invertido.utilidade > sim.utilidade ? "Pelo seu interesse declarado, a ordem invertida rende mais." : "Pelo seu interesse declarado, a ordem atual rende mais."}</p>
                      )}
                      {sim.b && sim.p1 > 0.9 && <p className="pequeno mudo">Sua chance na 1ª opção já é muito alta; a 2ª quase não entra em jogo. Você pode usar a 1ª opção para algo mais ambicioso.</p>}
                    </div>
                  </>
                )}
              </div>
            </div>
          </section>

          <p className="pequeno mudo" style={{ marginTop: 14, maxWidth: "80ch" }}>
            Como é calculado: para cada cenário de edição, a chance de alcançar o corte da 1ª opção; se não, o da 2ª; se nenhuma, a chance de a lista de espera descer até a sua nota.
            As duas opções compartilham o mesmo cenário (se a edição sobe, sobe para as duas). Regras: Edital SISU 2026, itens 3.5, 6.2 e 6.3; o edital de {base.anoAlvo} pode mudar algo.
          </p>
        </>
      )}
    </>
  );
}
