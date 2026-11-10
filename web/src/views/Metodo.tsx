import { useEffect, useState } from "react";
import { carregarRelatorio } from "../core/dados";
import { ROTULO_FAIXA, type Faixa } from "../core/probabilidade";
import { fmt } from "../core/texto";
import { REGRAS } from "../llm/regras";
import { useApp } from "../state/store";
import { Glifo } from "../ui/Chance";

const FAIXAS: [Faixa, string][] = [["alta", "80% ou mais"], ["moderada", "de 50% a 79%"], ["baixa", "de 20% a 49%"], ["remota", "menos de 20%"]];
const NOME_GRUPO: Record<string, string> = { AC: "Ampla concorrência", EP: "Escola pública", PPI: "Pretos, pardos e indígenas", PCD: "Pessoas com deficiência", Q: "Quilombolas" };

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
          <p>O essencial, sem termos técnicos. Dados atualizados em {new Date(base.geradoEm + "T12:00:00").toLocaleDateString("pt-BR")}.</p>
        </div>
      </div>

      <section className="painel">
        <h2>Em poucas palavras</h2>
        <div className="prosa" style={{ marginTop: 10 }}>
          <p>
            Comparamos a sua nota com a nota de corte que esperamos para {alvo} em cada curso. Essa expectativa vem do histórico oficial do SISU, de {r.primeiro_ano} a {r.ano_base}.
          </p>
          <p>
            Como a nota de corte muda de um ano para o outro, não mostramos um número só: mostramos uma <strong>faixa provável</strong> e a <strong>chance</strong> de a sua nota ser suficiente.
          </p>
        </div>
      </section>

      <div className="grade3" style={{ marginTop: 18 }}>
        <section className="painel passo">
          <span className="n">1</span>
          <h3>Sua nota no curso</h3>
          <p>Cada curso dá pesos diferentes às provas do Enem. Calculamos a sua média com os pesos daquele curso e conferimos as notas mínimas exigidas.</p>
        </section>
        <section className="painel passo">
          <span className="n">2</span>
          <h3>A nota de corte esperada</h3>
          <p>Olhamos o histórico do curso: a última nota de corte, se ela vinha subindo ou caindo, quantas vagas e quantos inscritos teve. Com isso estimamos a de {alvo}.</p>
        </section>
        <section className="painel passo">
          <span className="n">3</span>
          <h3>A sua chance</h3>
          <p>Ninguém sabe se a próxima edição será mais ou menos disputada. Por isso testamos vários cenários, baseados no que já aconteceu em anos anteriores. A chance é a parte dos cenários em que a sua nota alcança o corte.</p>
        </section>
      </div>

      <section className="painel">
        <h2>Como ler a chance</h2>
        <div className="prosa" style={{ marginTop: 10 }}>
          <p>Chance de 70% quer dizer: em 10 situações parecidas, a nota foi suficiente em 7. <strong>Não é garantia de vaga.</strong></p>
        </div>
        <ul className="legenda-faixas">
          {FAIXAS.map(([f, d]) => <li key={f}><Glifo faixa={f} /> <strong>{ROTULO_FAIXA[f]}</strong> <span className="mudo">{d}</span></li>)}
        </ul>
        <div className="prosa">
          <p>Cada previsão traz também um selo de <strong>confiança</strong> (alta, média ou baixa). Ele diz o quanto o histórico daquele curso ajuda a prever. Cursos com uma ou duas vagas e cotas criadas há pouco tempo costumam ter confiança baixa.</p>
        </div>
      </section>

      <section className="painel">
        <h2>Dá para confiar?</h2>
        <p className="mudo" style={{ margin: "6px 0 14px", maxWidth: "70ch" }}>
          Testamos o método no passado: com os dados até um ano, previmos o ano seguinte e comparamos com o que aconteceu de verdade ({anos[0]} a {anos[anos.length - 1]}).
        </p>
        <div className="numeros">
          <div><span className="n">{fmt.int(modelo.mediana_abs)} pontos</span><span className="d">Metade das previsões errou menos do que isso.</span></div>
          <div><span className="n">{emDez} em cada 10</span><span className="d">Vezes em que a nota de corte real ficou dentro da faixa prevista.</span></div>
          <div><span className="n">{fmt.int(modelo.p90_abs)} pontos</span><span className="d">Uma em cada 10 previsões errou mais do que isso.</span></div>
        </div>
        <div className="prosa" style={{ marginTop: 14 }}>
          <p>
            Em anos fora do comum o erro é maior. Em 2026, quando o SISU passou a aceitar três edições do Enem, as notas de corte subiram mais do que o previsto em quase todos os cursos.
            Por isso vale ter sempre uma segunda opção mais segura.
          </p>
        </div>
      </section>

      <div className="grade2" style={{ marginTop: 18 }}>
        <section className="painel">
          <h2>O que a plataforma não sabe</h2>
          <ul className="prosa" style={{ margin: "10px 0 0", paddingLeft: 18 }}>
            <li><strong>As regras, vagas e pesos de {alvo}.</strong> Até o MEC publicar, usamos os das edições anteriores.</li>
            <li><strong>A lista de espera.</strong> O MEC não divulga essas notas. A estimativa usa só dados da UFMG e é uma referência fraca para outras instituições.</li>
            <li><strong>O que acontece durante a inscrição.</strong> A nota de corte parcial do próprio SISU, que muda todo dia, é informação melhor do que qualquer previsão. Acompanhe.</li>
          </ul>
        </section>
        <section className="painel">
          <h2>De onde vêm os dados</h2>
          <div className="prosa" style={{ marginTop: 10 }}>
            <p>Dos relatórios públicos do MEC com as notas de corte, vagas e inscritos do SISU. Para a lista de espera, dos relatórios da UFMG. Não usamos dados inventados.</p>
            <p><strong>O consultor</strong> não faz contas: ele recebe os números calculados aqui e os explica em texto. Em cada resposta você pode abrir os dados que ele usou.</p>
          </div>
        </section>
      </div>

      <h2 style={{ margin: "28px 0 4px" }}>Quer os detalhes?</h2>
      <p className="mudo" style={{ marginBottom: 12 }}>Para quem quiser conferir. Não é preciso ler para usar a plataforma.</p>

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
        <summary>Lista de espera na UFMG</summary>
        <p className="mudo pequeno" style={{ margin: "10px 0", maxWidth: "80ch" }}>
          Quanto a nota mínima caiu entre a chamada regular e a última chamada, de {base.espera.anos[0]} a {base.espera.anos[1]} ({fmt.int(base.espera.n)} casos).
        </p>
        <div className="tab-wrap">
          <table>
            <thead><tr><th>Grupo</th><th className="num">Não caiu</th><th className="num">Queda típica, em pontos</th></tr></thead>
            <tbody>{Object.entries(base.espera.grupos).map(([g, v]) => (
              <tr key={g}><td>{NOME_GRUPO[g] ?? g}</td><td className="num">{Math.round(v.sem_queda * 100)}%</td><td className="num">{fmt.nota1(v.mediana)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </details>

      <details className="painel mais">
        <summary>Regras do SISU consideradas</summary>
        <ul className="prosa" style={{ margin: "12px 0 0", paddingLeft: 18 }}>{REGRAS.map((x) => <li key={x.id}>{x.texto} <span className="pequeno mudo">[{x.fonte}]</span></li>)}</ul>
      </details>

      <p className="pequeno mudo" style={{ marginTop: 16 }}>A descrição técnica completa do modelo está em <code>docs/MODELO.md</code>, no repositório.</p>
    </>
  );
}
