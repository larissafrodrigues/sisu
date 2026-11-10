import type { Avaliacao } from "../core/avaliacao";
import { notaEfetiva } from "../core/avaliacao";
import { useApp, MAX_COMPARAR } from "../state/store";
import { Chance } from "./Chance";
import { Ic } from "./Icones";
import { EixoRegua, Regua, dominioDe } from "./Regua";

export function ListaOfertas({ itens, vazio }: { itens: Avaliacao[]; vazio?: string }) {
  const { base, estado, abrirDetalhe, alternarLista, alternarComparar, temNotas } = useApp();
  if (!itens.length) return <div className="ofertas"><div className="sem">{vazio ?? "Nenhuma oferta encontrada com esses filtros."}</div></div>;
  const dom = dominioDe(itens.map((a) => ({ serie: a.serie, nota: a.nota.elegivel && a.serie ? notaEfetiva(a.nota.nota, a.serie) : null })));
  return (
    <div className="ofertas">
      <div className="of-cab">
        <span className="rot">Curso e instituição</span>
        <EixoRegua dominio={dom} />
        <span className="rot">{temNotas ? "Chance na chamada regular" : `Corte de ${base.anoBase}`}</span>
        <span />
      </div>
      {itens.map((a) => {
        const o = a.oferta;
        const naLista = estado.lista.some((x) => x.id === o.id);
        const noComp = estado.comparar.includes(o.id);
        return (
          <div key={o.id} className="of" role="button" tabIndex={0} onClick={() => abrirDetalhe(o.id)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); abrirDetalhe(o.id); } }}>
            <div style={{ minWidth: 0 }}>
              <div className="tit">{o.curso}{a.serie && a.serie.mod.codigo !== "AC" && <span className="tagm" title={a.serie.mod.rotulo}>{a.serie.mod.codigo.replace("_", " ")}</span>}</div>
              <div className="meta">{o.ies.sigla} · {o.municipio}/{o.uf} · {o.turno} · {o.grau}</div>
            </div>
            <Regua serie={a.serie} nota={a.nota.elegivel && a.serie ? notaEfetiva(a.nota.nota, a.serie) : null} dominio={dom} anoBase={base.anoBase} />
            <div>
              {!temNotas ? <span style={{ fontWeight: 650 }}>{a.serie?.corte?.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) ?? "—"}</span>
                : a.nota.elegivel ? <Chance p={a.prob} />
                : <span className="pequeno mudo" title={a.nota.motivo ?? ""}>Não cumpre a nota mínima</span>}
            </div>
            <div className="acoes" onClick={(e) => e.stopPropagation()}>
              <button className="icone-bt" aria-pressed={naLista} title={naLista ? "Tirar da minha lista" : "Adicionar à minha lista"} onClick={() => alternarLista(o.id)}>
                {Ic.marcador(naLista)}<span className="sr">{naLista ? "Tirar da minha lista" : "Adicionar à minha lista"}</span>
              </button>
              <button className="icone-bt" aria-pressed={noComp} title={noComp ? "Tirar da comparação" : `Comparar (até ${MAX_COMPARAR})`} onClick={() => alternarComparar(o.id)}>
                {Ic.comparar()}<span className="sr">Comparar</span>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
