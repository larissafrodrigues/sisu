import { useEffect, useState } from "react";
import { notaEfetiva } from "../core/avaliacao";
import { carregarHistorico } from "../core/dados";
import { fmt } from "../core/texto";
import { AREAS, NOME_AREA, type Historico } from "../core/tipos";
import { MAX_COMPARAR, useApp, type Rota } from "../state/store";
import { Chance } from "../ui/Chance";
import { GraficoHistorico } from "../ui/Grafico";
import { Ic } from "../ui/Icones";

const CORES = ["var(--s1)", "var(--s2)", "var(--s3)"];
const CONF = ["baixa", "média", "alta"];

export function Comparar({ ir }: { ir: (r: Rota) => void }) {
  const { base, estado, porOferta, temNotas, alternarComparar, abrirDetalhe, alternarLista } = useApp();
  const itens = estado.comparar.map((id) => porOferta.get(id)).filter((a): a is NonNullable<typeof a> => !!a);
  const [hists, setHists] = useState<Record<string, Historico>>({});
  const ufs = [...new Set(itens.map((a) => a.oferta.uf))].join(",");

  useEffect(() => {
    let vivo = true;
    for (const uf of ufs.split(",").filter(Boolean)) {
      carregarHistorico(uf).then((h) => vivo && setHists((x) => ({ ...x, [uf]: h }))).catch(() => undefined);
    }
    return () => { vivo = false; };
  }, [ufs]);

  if (!itens.length) {
    return (
      <>
        <div className="cab"><div><h1>Comparar cursos</h1><p>Coloque até {MAX_COMPARAR} ofertas lado a lado: histórico, previsão, pesos e sua chance em cada uma.</p></div></div>
        <div className="painel sem">
          <h3>Nada para comparar ainda</h3>
          <p>Em Explorar, use o botão {Ic.comparar()} de cada linha para escolher as ofertas.</p>
          <button className="bt pri" style={{ marginTop: 14 }} onClick={() => ir("explorar")}>Ir para Explorar</button>
        </div>
      </>
    );
  }

  const prontos = itens.every((a) => hists[a.oferta.uf]);
  const rot = (a: (typeof itens)[number]) => `${a.oferta.curso} · ${a.oferta.ies.sigla}${itens.filter((x) => x.oferta.curso === a.oferta.curso && x.oferta.ies.sigla === a.oferta.ies.sigla).length > 1 ? ` (${a.oferta.turno})` : ""}`;
  const anos = prontos ? hists[itens[0].oferta.uf].anos : base.anos;
  const linha = (titulo: string, f: (a: (typeof itens)[number]) => React.ReactNode) => (
    <tr><th scope="row">{titulo}</th>{itens.map((a) => <td key={a.oferta.id}>{f(a)}</td>)}</tr>
  );

  return (
    <>
      <div className="cab">
        <div><h1>Comparar cursos</h1><p>Cada coluna usa a modalidade em que o seu perfil tem mais chance. Passe o mouse no gráfico para ler os valores de cada edição.</p></div>
        <button className="bt" onClick={() => ir("explorar")}>Adicionar outro</button>
      </div>

      <section className="painel">
        <h2 style={{ marginBottom: 10 }}>Nota de corte ao longo das edições</h2>
        {prontos ? (
          <GraficoHistorico anos={anos} anoAlvo={base.anoAlvo} altura={290} descricao="Comparação do histórico das notas de corte"
            series={itens.map((a, i) => ({
              nome: rot(a), cor: CORES[i],
              valores: a.serie ? hists[a.oferta.uf].cortes.get(a.serie.idx) ?? [] : [],
              previsao: a.serie?.q50 != null ? { q10: a.serie.q10!, q50: a.serie.q50, q90: a.serie.q90! } : null,
            }))} />
        ) : <p className="mudo">Carregando históricos…</p>}
      </section>

      <section className="painel">
        <div className="tab-wrap">
          <table>
            <thead>
              <tr><th />{itens.map((a, i) => (
                <th key={a.oferta.id} style={{ minWidth: 190, whiteSpace: "normal" }}>
                  <span style={{ display: "inline-block", width: 14, height: 3, background: CORES[i], borderRadius: 2, verticalAlign: 4, marginRight: 6 }} />
                  <button className="bt fantasma" style={{ padding: 0, color: "var(--tinta)", fontSize: "0.95rem", whiteSpace: "normal", textAlign: "left" }} onClick={() => abrirDetalhe(a.oferta.id)}>{a.oferta.curso}</button>
                  <div style={{ fontWeight: 400 }}>{a.oferta.ies.sigla} · {a.oferta.municipio}/{a.oferta.uf}</div>
                </th>
              ))}</tr>
            </thead>
            <tbody>
              {temNotas && linha("Sua chance (chamada regular)", (a) => (a.nota.elegivel ? <Chance p={a.prob} rotulo /> : <span className="mudo">não cumpre a mínima</span>))}
              {temNotas && linha("Sua nota no curso", (a) => (a.nota.elegivel && a.serie ? <><strong>{fmt.nota(notaEfetiva(a.nota.nota, a.serie))}</strong> <span className="mudo pequeno">Enem {a.nota.ano}</span></> : "—"))}
              {linha("Modalidade considerada", (a) => a.serie?.mod.rotulo ?? "—")}
              {linha(`Corte em ${base.anoBase}`, (a) => fmt.nota(a.serie?.corte))}
              {linha(`Previsão ${base.anoAlvo}`, (a) => (a.serie?.q50 != null ? <><strong>{fmt.nota1(a.serie.q50)}</strong> <span className="mudo pequeno">80%: {fmt.nota1(a.serie.q10)}–{fmt.nota1(a.serie.q90)}</span></> : "—"))}
              {temNotas && linha("Folga sobre a previsão", (a) => (a.margem != null ? `${fmt.delta(a.margem)} pontos` : "—"))}
              {linha("Confiança da previsão", (a) => (a.serie?.q50 != null ? CONF[a.serie.confianca] : "—"))}
              {linha("Vagas na modalidade", (a) => fmt.int(a.serie?.vagas))}
              {linha("Inscritos por vaga", (a) => (a.serie?.vagas && a.serie.inscritos != null ? fmt.nota1(a.serie.inscritos / a.serie.vagas) : "—"))}
              {linha("Turno e grau", (a) => `${a.oferta.turno} · ${a.oferta.grau}`)}
              {linha("Duração", (a) => (a.oferta.semestres ? `${a.oferta.semestres} semestres` : "—"))}
              {linha("Pesos (Red · Ling · Mat · Hum · Nat)", (a) => AREAS.map((k) => fmt.nota1(a.oferta.pesos[k]).replace(",0", "")).join(" · "))}
              {linha("Notas mínimas", (a) => AREAS.filter((k) => a.oferta.minimas[k] > 0.01).map((k) => `${NOME_AREA[k]} ${a.oferta.minimas[k]}`).join(", ") || "sem mínima")}
              {linha("", (a) => {
                const naLista = estado.lista.some((x) => x.id === a.oferta.id);
                return (
                  <div className="linha-flex">
                    <button className="bt mini" aria-pressed={naLista} onClick={() => alternarLista(a.oferta.id)}>{naLista ? "Na lista" : "Adicionar à lista"}</button>
                    <button className="bt mini fantasma" onClick={() => alternarComparar(a.oferta.id)}>Remover</button>
                  </div>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
