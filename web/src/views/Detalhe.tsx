import { useEffect, useMemo, useState } from "react";
import { modalidadesElegiveis, notaEfetiva, probAprovacao, serieAC } from "../core/avaliacao";
import { carregarDescricoes, carregarHistorico } from "../core/dados";
import { grupoEspera } from "../core/estrategia";
import { mediaPonderada, motivoInelegivel, edicaoPreenchida } from "../core/notas";
import { ROTULO_FAIXA, faixaDe } from "../core/probabilidade";
import { fmt } from "../core/texto";
import { AREAS, NOME_AREA, type Historico, type Serie } from "../core/tipos";
import { useApp, type Rota } from "../state/store";
import { Chance } from "../ui/Chance";
import { GraficoHistorico, type SerieGrafico } from "../ui/Grafico";
import { Ic } from "../ui/Icones";

const CONF = ["baixa", "média", "alta"];
const EXPLICA_CONF = [
  "série curta, poucas vagas ou histórico instável",
  "histórico razoável, mas com oscilações",
  "série longa e estável",
];

export function Detalhe({ id, ir }: { id: string; ir: (r: Rota) => void }) {
  const { base, motor, estado, porOferta, temNotas, abrirDetalhe, alternarLista, alternarComparar, atualizarItem } = useApp();
  const aval = porOferta.get(id);
  const [hist, setHist] = useState<Historico | null>(null);
  const [descs, setDescs] = useState<string[] | null>(null);
  const [selIdx, setSelIdx] = useState<number | null>(null);
  const o = aval?.oferta;

  useEffect(() => {
    setHist(null); setSelIdx(null);
    if (!o) return;
    let vivo = true;
    carregarHistorico(o.uf).then((h) => vivo && setHist(h)).catch(() => undefined);
    if (o.series.some((s) => s.desc >= 0)) carregarDescricoes().then((d) => vivo && setDescs(d)).catch(() => undefined);
    return () => { vivo = false; };
  }, [o]);

  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === "Escape" && abrirDetalhe(null);
    window.addEventListener("keydown", f);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", f); document.body.style.overflow = ""; };
  }, [abrirDetalhe]);

  const elegiveis = useMemo(() => modalidadesElegiveis(estado.perfil), [estado.perfil]);
  if (!aval || !o) return null;

  const item = estado.lista.find((x) => x.id === id);
  const ac = serieAC(o);
  const serie: Serie | null = (selIdx != null ? o.series.find((s) => s.idx === selIdx) : null) ?? aval.serie;
  const nota = aval.nota.elegivel ? aval.nota.nota : null;
  const notaS = nota != null && serie ? notaEfetiva(nota, serie) : null;
  const prob = nota != null && serie ? probAprovacao(motor, o, serie, nota) : null;
  const naLista = !!item;
  const noComp = estado.comparar.includes(id);

  const seriesGraf: SerieGrafico[] = [];
  if (hist && serie) {
    const prev = (s: Serie) => (s.q50 != null ? { q10: s.q10!, q50: s.q50, q90: s.q90! } : null);
    seriesGraf.push({ nome: serie.mod.codigo === "AC" ? "Ampla concorrência" : serie.mod.rotulo, cor: "var(--s1)", valores: hist.cortes.get(serie.idx) ?? [], previsao: prev(serie) });
    if (ac && ac.idx !== serie.idx) seriesGraf.push({ nome: "Ampla concorrência", cor: "var(--s2)", valores: hist.cortes.get(ac.idx) ?? [], previsao: prev(ac) });
  }
  const espera = serie ? base.espera.grupos[grupoEspera(serie.mod.codigo)] : null;
  const vi = hist && serie ? { v: hist.vagas.get(serie.idx) ?? [], i: hist.inscritos.get(serie.idx) ?? [] } : null;

  return (
    <>
      <div className="fundo-gaveta" onClick={() => abrirDetalhe(null)} />
      <aside className="gaveta" role="dialog" aria-modal="true" aria-label={`${o.curso} — ${o.ies.sigla}`}>
        <div className="topo">
          <div style={{ minWidth: 0 }}>
            <h2 style={{ fontSize: "1.55rem" }}>{o.curso}</h2>
            <p style={{ color: "var(--tinta2)", marginTop: 6 }}>{o.ies.nome} ({o.ies.sigla})</p>
            <p className="pequeno mudo">{o.campus} · {o.municipio}/{o.uf} · {o.turno} · {o.grau}{o.semestres ? ` · ${o.semestres} semestres` : ""} · {fmt.int(o.vagas)} vagas no SISU {base.anoBase}</p>
          </div>
          <button className="icone-bt empurra" onClick={() => abrirDetalhe(null)} title="Fechar">{Ic.fechar()}<span className="sr">Fechar</span></button>
        </div>
        <div className="linha-flex" style={{ marginBottom: 16 }}>
          <button className="bt" aria-pressed={naLista} onClick={() => alternarLista(id)}>{Ic.marcador(naLista)}{naLista ? "Na minha lista" : "Adicionar à lista"}</button>
          <button className="bt" aria-pressed={noComp} onClick={() => alternarComparar(id)}>{Ic.comparar()}{noComp ? "Na comparação" : "Comparar"}</button>
          {noComp && estado.comparar.length > 1 && <button className="bt fantasma" onClick={() => { abrirDetalhe(null); ir("comparar"); }}>Ver comparação</button>}
        </div>

        <section className="painel">
          {!temNotas ? (
            <p>Para ver sua chance neste curso, <a href="#/perfil" onClick={() => abrirDetalhe(null)}>informe suas notas</a>.</p>
          ) : !aval.nota.elegivel ? (
            <p><strong>Você não cumpre as exigências deste curso:</strong> {aval.nota.motivo}.</p>
          ) : serie && serie.q50 != null ? (
            <div className="veredito">
              <Chance p={prob} grande />
              <div>
                <p><strong>{ROTULO_FAIXA[faixaDe(prob)]}</strong> de ser selecionado na chamada regular em <strong>{serie.mod.rotulo.toLowerCase()}</strong>.</p>
                <p style={{ color: "var(--tinta2)", marginTop: 6 }}>
                  Sua nota neste curso é <strong>{fmt.nota(notaS)}</strong> (Enem {aval.nota.ano}{serie.bonus > 0 ? `, com bônus de ${serie.bonus}%` : ""}).
                  A previsão do corte é <strong>{fmt.nota1(serie.q50)}</strong>; em 80% dos cenários ele fica entre {fmt.nota1(serie.q10)} e {fmt.nota1(serie.q90)}.
                  Em {base.anoBase} foi {fmt.nota(serie.corte)}.
                </p>
                <p className="pequeno mudo" style={{ marginTop: 6 }}>Confiança da previsão: {CONF[serie.confianca]} — {EXPLICA_CONF[serie.confianca]} ({serie.nHist} {serie.nHist === 1 ? "edição" : "edições"} de histórico).</p>
              </div>
            </div>
          ) : (
            <p>Não houve nota de corte nesta modalidade em {base.anoBase} (ninguém foi selecionado na chamada regular), então não há previsão. Veja as outras modalidades abaixo.</p>
          )}
          {serie?.mod.tipo === "L" && prob != null && (
            <p className="aviso" style={{ marginTop: 14 }}>Como cotista você disputa primeiro a ampla concorrência e depois a vaga reservada. A chance mostrada já considera os dois caminhos.</p>
          )}
        </section>

        <section className="painel">
          <h3>Histórico da nota de corte</h3>
          <p className="pequeno mudo" style={{ margin: "4px 0 10px" }}>Chamada regular, 1ª edição de cada ano. O ponto vazado é a previsão para {base.anoAlvo}; a barra, o intervalo de 80%.</p>
          {hist && seriesGraf.length ? (
            <GraficoHistorico anos={hist.anos} anoAlvo={base.anoAlvo} series={seriesGraf} nota={notaS} descricao={`Histórico da nota de corte de ${o.curso} na ${o.ies.sigla}`} />
          ) : <p className="mudo">Carregando histórico…</p>}
          {vi && vi.i.some((x) => x != null) && (
            <p className="pequeno mudo" style={{ marginTop: 10 }}>
              Inscritos por vaga nesta modalidade: {hist!.anosVI.map((a, k) => (vi.v[k] && vi.i[k] != null ? `${a}: ${fmt.nota1(vi.i[k]! / vi.v[k]!)}` : null)).filter(Boolean).slice(-4).join(" · ")}
            </p>
          )}
        </section>

        <section className="painel">
          <h3>Modalidades de concorrência</h3>
          <p className="pequeno mudo" style={{ margin: "4px 0 10px" }}>Clique em uma linha para analisá-la. As que o seu perfil não habilita aparecem esmaecidas.</p>
          <div className="tab-wrap">
            <table>
              <thead><tr><th>Modalidade</th><th className="num">Vagas</th><th className="num">Inscritos</th><th className="num">Corte {base.anoBase}</th><th className="num">Previsão {base.anoAlvo} (80%)</th>{temNotas && <th className="num">Chance</th>}</tr></thead>
              <tbody>
                {o.series.map((s) => {
                  const hab = elegiveis.has(s.mod.codigo);
                  const p = nota != null ? probAprovacao(motor, o, s, nota) : null;
                  const desc = s.desc >= 0 ? descs?.[s.desc] : null;
                  return (
                    <tr key={s.idx} className={`${s.idx === serie?.idx ? "destaque" : ""} ${!hab && s.mod.tipo === "L" ? "apagada" : ""}`} style={{ cursor: "pointer" }}
                      onClick={() => { setSelIdx(s.idx); if (item) atualizarItem(id, { mod: String(s.idx) }); }}>
                      <td style={{ maxWidth: 300 }}>
                        <strong style={{ fontWeight: 600 }}>{s.mod.tipo === "L" || s.mod.tipo === "A" ? s.mod.rotulo : desc ? desc.slice(0, 150) + (desc.length > 150 ? "…" : "") : s.mod.rotulo}</strong>
                        {s.mod.tipo === "L" && <span className="tagm">{s.mod.codigo}</span>}
                        {s.mod.tipo === "V" && <div className="pequeno mudo">Ação afirmativa própria: confira os requisitos no edital da instituição.</div>}
                        {s.bonus > 0 && <div className="pequeno mudo">Bônus de {s.bonus}% na nota para quem cumpre o critério.</div>}
                      </td>
                      <td className="num">{fmt.int(s.vagas)}</td>
                      <td className="num">{fmt.int(s.inscritos)}</td>
                      <td className="num">{fmt.nota(s.corte)}</td>
                      <td className="num">{s.q50 != null ? `${fmt.nota1(s.q50)} (${fmt.nota1(s.q10)}–${fmt.nota1(s.q90)})` : "—"}</td>
                      {temNotas && <td className="num">{aval.nota.elegivel ? <Chance p={p} /> : "—"}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="painel">
          <h3>Pesos, notas mínimas e a sua nota</h3>
          <p className="pequeno mudo" style={{ margin: "4px 0 10px" }}>
            {o.pesosFonte === "termo" ? `Termo de adesão de ${o.pesosAno} (o mais recente publicado pelo MEC). Confirme no SISU ${base.anoAlvo}: as instituições podem mudar os pesos.`
              : o.pesosFonte === "mesmo curso na IES" ? "Curso novo no SISU: pesos herdados do mesmo curso em outro campus/turno da instituição. Confirme na oferta oficial."
              : "O MEC ainda não publicou o termo de adesão deste curso. Usamos média simples até os pesos saírem."}
          </p>
          <div className="tab-wrap">
            <table>
              <thead><tr><th>Prova</th><th className="num">Peso</th><th className="num">Mínima</th>{estado.perfil.edicoes.filter(edicaoPreenchida).map((e) => <th key={e.ano} className="num">Enem {e.ano}</th>)}</tr></thead>
              <tbody>
                {AREAS.map((a) => (
                  <tr key={a}><td>{NOME_AREA[a]}</td><td className="num">{fmt.nota1(o.pesos[a])}</td><td className="num">{o.minimas[a] > 0.01 ? fmt.int(o.minimas[a]) : "—"}</td>
                    {estado.perfil.edicoes.filter(edicaoPreenchida).map((e) => <td key={e.ano} className="num">{fmt.nota1(e.notas[a])}</td>)}</tr>
                ))}
                <tr className="destaque"><td><strong>Média ponderada</strong></td><td /><td className="num">{o.minimas.media > 0.01 ? `média ${fmt.int(o.minimas.media)}` : ""}</td>
                  {estado.perfil.edicoes.filter(edicaoPreenchida).map((e) => {
                    const mot = motivoInelegivel(e.notas, o);
                    return <td key={e.ano} className="num" title={mot ?? ""}><strong>{fmt.nota(mediaPonderada(e.notas, o.pesos))}</strong>{mot ? " *" : e.ano === aval.nota.ano ? " ✓" : ""}</td>;
                  })}</tr>
              </tbody>
            </table>
          </div>
          {estado.perfil.edicoes.filter(edicaoPreenchida).length > 1 && <p className="pequeno mudo" style={{ marginTop: 8 }}>✓ edição usada pelo SISU neste curso (melhor média ponderada). * não cumpre alguma nota mínima.</p>}
        </section>

        {espera && serie?.corte != null && (
          <section className="painel">
            <h3>E a lista de espera?</h3>
            <p style={{ color: "var(--tinta2)", marginTop: 6 }}>
              O MEC só publica o corte da chamada regular. Na UFMG, única série pública por chamada que encontramos ({base.espera.anos[0]}–{base.espera.anos[1]}),
              a nota mínima deste tipo de modalidade caiu em mediana <strong>{fmt.nota1(espera.mediana)} pontos</strong> até a última chamada
              (metade dos casos entre {fmt.nota1(espera.quantis[4])} e {fmt.nota1(espera.quantis[14])}){espera.sem_queda > 0.3 ? `; em ${Math.round(espera.sem_queda * 100)}% não houve queda` : ""}.
              Tome como referência fraca: cada instituição chama em ritmo próprio.
            </p>
          </section>
        )}

        <p className="pequeno mudo" style={{ marginTop: 16 }}>
          Fonte: relatórios “Inscrições e notas de corte” e “Vagas ofertadas” do SISU/MEC (código e-MEC do curso: {o.id.split("|")[0]}). <a href="#/metodo" onClick={() => abrirDetalhe(null)}>Fontes e método</a>
        </p>
      </aside>
    </>
  );
}
