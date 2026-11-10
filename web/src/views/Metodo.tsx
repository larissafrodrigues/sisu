import { useEffect, useState } from "react";
import { carregarRelatorio } from "../core/dados";
import { ROTULO_FAIXA, type Faixa } from "../core/probabilidade";
import { fmt } from "../core/texto";
import { REGRAS } from "../consultoria/regras";
import { useApp } from "../state/store";
import { Glifo } from "../ui/Chance";

const FAIXAS: [Faixa, string][] = [["alta", "80% ou mais"], ["moderada", "de 50% a 79%"], ["baixa", "de 20% a 49%"], ["remota", "menos de 20%"]];

export function Metodo() {
  const { base } = useApp();
  const [r, setR] = useState<any>(null);
  useEffect(() => { carregarRelatorio().then(setR).catch(() => undefined); }, []);
  if (!r) return <div className="carregando">Carregando…</div>;

  const comp: any[] = r.backtest.comparacao;
  const modelo = comp[0];
  const maxMae = Math.max(...comp.map((c) => c.mae));
  const cal: any[] = r.calibracao;
  const mediaCal = cal[cal.length - 1];
  const emDez = Math.round(mediaCal.cob80 / 10);
  const anos = r.backtest.anos as number[];
  const alvo = r.ano_alvo;

  return (
    <>
      <div className="cab">
        <div>
          <h1>Como calculamos</h1>
          <p>Entenda de onde vêm as estimativas. Dados atualizados em {new Date(base.geradoEm + "T12:00:00").toLocaleDateString("pt-BR")}.</p>
        </div>
      </div>

      <section className="painel">
        <h2>Como funciona?</h2>
        <div className="prosa" style={{ marginTop: 10 }}>
          <p>Você informa suas notas do Enem e escolhe os cursos que gostaria de fazer. A Bússola SISU usa os resultados de anos anteriores para ajudar você a entender onde sua nota pode ser suficiente.</p>
          <p><strong>Importante:</strong> ninguém sabe com antecedência qual será a nota de corte de {alvo}. Por isso, mostramos uma estimativa, e não uma promessa de aprovação.</p>
        </div>
      </section>

      <div className="grade3" style={{ marginTop: 18 }}>
        <section className="painel passo">
          <span className="n">1</span>
          <h3>Calculamos sua nota</h3>
          <p>Um curso pode dar mais importância à Matemática, outro à Redação. Aplicamos os pesos e verificamos as notas mínimas exigidas.</p>
        </section>
        <section className="painel passo">
          <span className="n">2</span>
          <h3>Olhamos os anos anteriores</h3>
          <p>Comparamos as notas de corte dos anos de {r.primeiro_ano} a {r.ano_base}, as vagas e a procura dos estudantes. A <strong>nota de corte</strong> é a nota do último selecionado na chamada regular.</p>
        </section>
        <section className="painel passo">
          <span className="n">3</span>
          <h3>Estimamos suas chances</h3>
          <p>Consideramos possibilidades em que a nota de corte sobe ou desce. Assim, mostramos sua chance estimada e uma faixa em que o corte pode ficar.</p>
        </section>
      </div>

      <section className="painel">
        <h2>O que significa ter 70% de chance?</h2>
        <div className="prosa" style={{ marginTop: 10 }}>
          <p>Imagine 10 situações possíveis parecidas com os anos anteriores. Em cerca de 7 delas, sua nota seria suficiente. <strong>Isso não quer dizer que 7 de cada 10 pessoas serão aprovadas.</strong> É uma estimativa sobre a sua nota e a disputa pelo curso.</p>
        </div>
        <ul className="legenda-faixas">
          {FAIXAS.map(([f, d]) => <li key={f}><Glifo faixa={f} /> <strong>{ROTULO_FAIXA[f]}</strong> <span className="mudo">{d}</span></li>)}
        </ul>
        <p className="mudo" style={{ marginTop: 10 }}>Você também verá se temos muitos ou poucos dados sobre o curso. Quanto menos histórico, maior a dúvida.</p>
      </section>

      <section className="painel">
        <h2>Como usar a Bússola SISU?</h2>
        <div className="prosa" style={{ marginTop: 10 }}>
          <p>Confira cursos em <strong>Explorar</strong>, coloque os favoritos na sua lista e abra <strong>Estratégia</strong> para comparar suas duas opções de inscrição. A seção <strong>Lista de espera</strong> ajuda a entender a possibilidade de ser chamado depois.</p>
          <p>Os dados vêm de relatórios públicos do MEC e de listas de espera publicadas pela UFV e pela UFMG. Para outras instituições, a estimativa da lista de espera é menos segura.</p>
        </div>
      </section>

      <section className="painel">
        <h2>O que pode mudar?</h2>
        <div className="prosa" style={{ marginTop: 10 }}>
          <p>O número de candidatos, as vagas, os pesos e as regras do SISU podem mudar. Enquanto o edital de {alvo} não estiver disponível, usamos as informações mais recentes que temos.</p>
          <p><strong>Durante as inscrições, acompanhe as notas de corte parciais no SISU oficial.</strong> Elas refletem a disputa daquele momento e ajudam a revisar sua escolha.</p>
        </div>
      </section>

      <details className="painel mais">
        <summary>Como verificamos se as estimativas funcionam?</summary>
        <p className="mudo" style={{ margin: "12px 0", maxWidth: "75ch" }}>Usamos dados de anos anteriores para fazer previsões de anos que já aconteceram ({anos[0]} a {anos[anos.length - 1]}). Depois, comparamos com os resultados reais.</p>
        <div className="numeros">
          <div><span className="n">{fmt.int(modelo.mediana_abs)} pontos</span><span className="d">Metade das previsões errou menos do que isso.</span></div>
          <div><span className="n">{emDez} em cada 10</span><span className="d">Vezes em que a nota de corte real ficou na faixa prevista.</span></div>
          <div><span className="n">{fmt.int(modelo.p90_abs)} pontos</span><span className="d">Uma em cada 10 previsões errou mais do que isso.</span></div>
        </div>
        <p className="mudo" style={{ marginTop: 12 }}>Em anos de mudanças importantes, o erro pode ser maior. Em 2026, o SISU passou a aceitar três edições do Enem e as notas de corte subiram mais do que o esperado em muitos cursos.</p>
      </details>

      <h2 style={{ margin: "28px 0 4px" }}>Quer os detalhes?</h2>
      <p className="mudo" style={{ marginBottom: 12 }}>Fontes, testes e regras estão disponíveis para quem quiser conferir.</p>

      <details className="painel mais">
        <summary>Lista de arquivos usados</summary>
        <p className="mudo pequeno" style={{ margin: "10px 0", maxWidth: "80ch" }}>
          O portal do MEC não permite download automático, então usamos cópias guardadas em repositórios públicos. Cada linha aponta para a fonte oficial e para a cópia.
        </p>
        <div className="tab-wrap">
          <table>
            <thead><tr><th>Relatório</th><th>Publicado por</th><th>Cópia usada</th></tr></thead>
            <tbody>
              {r.fontes.map((f: any) => (
                <tr key={f.titulo}>
                  <td>{f.titulo}</td>
                  <td><a href={f.origem} target="_blank" rel="noreferrer">{f.tipo === "ufmg_chamadas" ? "UFMG" : "MEC / SISU"}</a></td>
                  <td><a href={f.espelho} target="_blank" rel="noreferrer">abrir</a> <span className="mudo">({fmt.nota1(f.bytes / 1e6)} MB)</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <details className="painel mais">
        <summary>Resultado dos testes</summary>
        <h3 style={{ marginTop: 14 }}>Erro médio, em pontos</h3>
        <p className="mudo pequeno" style={{ margin: "4px 0 10px" }}>Nosso método comparado com formas simples de prever. Menor é melhor. {fmt.int(r.backtest.n)} previsões testadas.</p>
        {comp.map((c, i) => (
          <div key={c.modelo} className={`barra-h${i === 0 ? " dest" : ""}`}>
            <span>{i === 0 ? "Bússola SISU" : c.modelo}</span>
            <span className="b" style={{ width: `${(c.mae / maxMae) * 100}%` }} title={`${c.modelo}: ${fmt.nota1(c.mae)}`} />
            <span style={{ textAlign: "right" }}>{fmt.nota1(c.mae)}</span>
          </div>
        ))}
        <h3 style={{ marginTop: 20 }}>A faixa prevista acertou quantas vezes?</h3>
        <p className="mudo pequeno" style={{ margin: "4px 0 10px" }}>A faixa mostrada na plataforma deveria conter a nota de corte real em 80% dos casos.</p>
        <div className="tab-wrap">
          <table>
            <thead><tr><th>Edição</th><th className="num">Acertos da faixa</th><th className="num">A edição ficou, em pontos</th></tr></thead>
            <tbody>
              {cal.map((c) => (
                <tr key={c.ano} className={c.ano === "média" ? "destaque" : ""}>
                  <td>{c.ano === "média" ? "Média" : c.ano}</td>
                  <td className="num">{fmt.nota1(c.cob80)}%</td>
                  <td className="num">{c.choque_observado == null ? "" : `${fmt.nota1(Math.abs(c.choque_observado))} ${c.choque_observado > 0 ? "acima" : "abaixo"} do previsto`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <details className="painel mais">
        <summary>Lista de espera na UFV e na UFMG</summary>
        <p className="mudo pequeno" style={{ margin: "10px 0", maxWidth: "80ch" }}>
          Quanto a lista de espera desceu abaixo do corte da chamada regular, de {base.espera.anos[0]} a {base.espera.anos[1]} ({fmt.int(base.espera.n)} casos de curso, modalidade e ano).
          Para cursos dessas duas universidades usamos o histórico do próprio curso misturado a este padrão; para as demais, só o padrão.
          {" "}Fontes: {Object.entries(base.espera.ies).map(([s, i], k) => <span key={s}>{k > 0 && ", "}<a href={i.origem} target="_blank" rel="noreferrer">{i.titulo}</a></span>)}.
        </p>
        <div className="tab-wrap">
          <table>
            <thead><tr><th>Grupo</th><th className="num">Não caiu</th><th className="num">Queda típica, em pontos</th></tr></thead>
            <tbody>{Object.entries(base.espera.grupos).map(([g, v]) => (
              <tr key={g}><td>{base.espera.nome_grupo[g] ?? g}</td><td className="num">{Math.round(v.sem_queda * 100)}%</td><td className="num">{fmt.nota1(v.mediana)}</td></tr>
            ))}</tbody>
          </table>
        </div>
        <h3 style={{ marginTop: 18 }}>A estimativa acerta?</h3>
        <ul className="prosa" style={{ margin: "8px 0 0", paddingLeft: 18 }}>
          {base.espera.validacao.troca_de_universidade.map((t: any) => (
            <li key={t.prevista}>Prevendo a {t.prevista} só com o padrão da {t.com_dados_de}, a faixa de 80% acertou <strong>{fmt.nota1(t.cobertura80)}%</strong> dos casos.</li>
          ))}
          {(() => {
            const v = base.espera.validacao.ano_deixado_de_fora;
            const m = v.metodos.find((x: any) => x.peso_perfil === base.espera.peso_perfil);
            return m ? <li>Para cursos com histórico próprio, prevendo um ano deixado de fora, a faixa de 80% acertou <strong>{fmt.nota1(m.cobertura80)}%</strong> dos casos ({fmt.int(v.n)} testes).</li> : null;
          })()}
        </ul>
      </details>

      <details className="painel mais">
        <summary>Regras do SISU consideradas</summary>
        <ul className="prosa" style={{ margin: "12px 0 0", paddingLeft: 18 }}>{REGRAS.map((x) => <li key={x.id}>{x.texto} <span className="pequeno mudo">[{x.fonte}]</span></li>)}</ul>
      </details>

      <p className="pequeno mudo" style={{ marginTop: 16 }}>A descrição técnica completa do modelo está em <code>docs/MODELO.md</code>, no repositório.</p>
    </>
  );
}
