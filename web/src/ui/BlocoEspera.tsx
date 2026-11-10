/** Estimativa e histórico da lista de espera de um curso/modalidade. Usado no Detalhe e na tela Lista de espera. */
import type { ChanceEspera } from "../core/espera";
import { distribuicaoQueda, quantilQueda, quedaObservada } from "../core/espera";
import { fmt } from "../core/texto";
import type { Base, Oferta, Serie } from "../core/tipos";

export function SeloBase({ ce }: { ce: Pick<ChanceEspera, "dist"> }) {
  return ce.dist.base === "propria"
    ? <span className="selo-esp propria" title={`Histórico de lista de espera do próprio curso (${ce.dist.ies}, ${ce.dist.hist.length} edições)`}>histórico do curso</span>
    : <span className="selo-esp" title="Sem dados próprios: padrão de cursos parecidos da UFV e da UFMG">padrão geral</span>;
}

export function BlocoEspera({ base, oferta, serie, ce, compacto = false }: { base: Base; oferta: Oferta; serie: Serie; ce: ChanceEspera | null; compacto?: boolean }) {
  const e = base.espera;
  const dist = ce?.dist ?? distribuicaoQueda(e, oferta, serie);
  const med = ce?.quedaMediana ?? quantilQueda(dist, 0.5);
  const p25 = ce?.quedaP25 ?? quantilQueda(dist, 0.25);
  const p75 = ce?.quedaP75 ?? quantilQueda(dist, 0.75);
  const nomeGrupo = (e.nome_grupo[dist.grupo] ?? dist.grupo).toLowerCase();
  const faixa = e.rotulos_faixa[dist.faixa];
  const info = dist.ies ? e.ies[dist.ies] : null;
  const temContagem = dist.hist.some((h) => h.convocados != null);
  const zerou = dist.hist.filter((h) => h.esgotou).length;

  return (
    <div className="bloco-esp">
      {ce && (
        <div className="esp-numeros">
          <div><span className="n">{fmt.pct(ce.regular)}</span><span className="d">na chamada regular</span></div>
          <div><span className="n">{ce.seNaoPassar == null ? "—" : fmt.pct(ce.seNaoPassar)}</span><span className="d">{ce.seNaoPassar == null ? "a regular já é quase certa" : "de ser chamado depois, se não passar na regular"}</span></div>
          <div><span className="n">{fmt.pct(ce.total)}</span><span className="d">de vaga ao todo, contando a lista</span></div>
        </div>
      )}
      <p className="prosa-esp">
        {dist.base === "propria" ? (
          <>Na {dist.ies}, de {dist.hist[0].ano} a {dist.hist[dist.hist.length - 1].ano}, a lista de espera desta modalidade desceu <strong>{fmt.nota1(median(dist.hist.map(quedaObservada)))} pontos</strong> em
            mediana abaixo do corte da chamada regular. Misturando esse histórico com o padrão de cursos parecidos, esperamos uma queda de cerca de <strong>{fmt.nota1(med)} pontos</strong> (metade dos cenários entre {fmt.nota1(p25)} e {fmt.nota1(p75)})</>
        ) : (
          <>A {oferta.ies.sigla} não publica as notas da lista de espera em um formato que a plataforma consiga ler. Usamos o padrão da UFV e da UFMG para {nomeGrupo} com nota de corte {faixa}:
            queda típica de <strong>{fmt.nota1(med)} pontos</strong> (metade dos casos entre {fmt.nota1(p25)} e {fmt.nota1(p75)}). É uma estimativa mais fraca: cada instituição chama em ritmo próprio</>
        )}
        {ce?.alcanceTipico != null && <>. Com o corte previsto de {fmt.nota1(serie.q50)}, a lista chegaria a cerca de <strong>{fmt.nota1(ce.alcanceTipico)}</strong></>}.
      </p>

      {!compacto && dist.base === "propria" && (
        <>
          <div className="tab-wrap" style={{ marginTop: 10 }}>
            <table>
              <thead>
                <tr><th>Edição</th><th className="num">Corte da regular</th><th className="num">Menor convocado da lista</th><th className="num">Desceu</th>
                  {temContagem && <th className="num">Na lista</th>}{temContagem && <th className="num">Chamados por esta modalidade</th>}{temContagem && <th>Lista zerou?</th>}</tr>
              </thead>
              <tbody>
                {dist.hist.map((h) => (
                  <tr key={h.ano}>
                    <td>{h.ano}</td>
                    <td className="num">{fmt.nota(h.regular)}</td>
                    <td className="num">{h.final == null ? "ninguém" : fmt.nota(h.final)}</td>
                    <td className="num">{fmt.nota1(quedaObservada(h))}</td>
                    {temContagem && <td className="num">{fmt.int(h.lista)}</td>}{temContagem && <td className="num">{fmt.int(h.convocados)}</td>}
                    {temContagem && <td>{h.esgotou ? "sim" : "não"}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="pequeno mudo" style={{ marginTop: 8 }}>
            {zerou > 0 && `Em ${zerou} ${zerou === 1 ? "edição" : "edições"} a lista zerou: todos os inscritos nela foram chamados, então a queda poderia ter sido maior. `}
            {temContagem && "Os chamados podem passar dos que estavam na lista, porque vagas não preenchidas de uma modalidade são remanejadas para outras. "}
            {info && <>Fonte: <a href={info.origem} target="_blank" rel="noreferrer">{info.titulo}</a>.</>}
          </p>
        </>
      )}
    </div>
  );
}

function median(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
