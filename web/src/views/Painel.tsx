import { useMemo, useState } from "react";
import type { Avaliacao } from "../core/avaliacao";
import { mediaSimples, edicaoPreenchida } from "../core/notas";
import { ROTULO_FAIXA, faixaDe, type Faixa } from "../core/probabilidade";
import { fmt, plural } from "../core/texto";
import { useApp, type Rota } from "../state/store";
import { BuscaMulti, CamposNotas } from "../ui/Campos";
import { COR_FAIXA, Glifo } from "../ui/Chance";
import { GraficoHistorico } from "../ui/Grafico";
import { ListaOfertas } from "../ui/ListaOfertas";
import { LegendaRegua } from "../ui/Regua";
import { definirFiltroInicial } from "./Explorar";
import { EXEMPLO } from "./Perfil";

const FAIXAS: Faixa[] = ["alta", "moderada", "baixa", "remota"];
const DESC: Record<string, string> = { alta: "80% ou mais", moderada: "de 50% a 79%", baixa: "de 20% a 49%", remota: "menos de 20%" };
const CORES = ["var(--s1)", "var(--s2)", "var(--s3)"];

function Entrada({ ir }: { ir: (r: Rota) => void }) {
  const { base, estado, setPerfil } = useApp();
  const p = estado.perfil;
  // rascunho local: o painel só aparece quando a pessoa confirma, não no meio da digitação
  const [ed, setEd] = useState(p.edicoes[0]);
  const [cursos, setCursos] = useState(p.cursos);
  const pronto = edicaoPreenchida(ed);
  const confirmar = () => setPerfil({ ...p, cursos, edicoes: p.edicoes.map((e, i) => (i === 0 ? ed : e)) });
  return (
    <div className="heroi">
      <div>
        <h1>Para onde a sua nota do Enem aponta?</h1>
        <p className="sub">
          Digite suas notas e veja, curso a curso, a chance de entrar pelo SISU {base.anoAlvo} — calculada com os resultados oficiais do MEC de {base.anos[0]} a {base.anoBase} e com a margem de erro à mostra.
        </p>
        <ul>
          <li>{fmt.int(base.contagens.ofertas)} cursos de {base.contagens.ies} instituições públicas, em {base.contagens.municipios} municípios</li>
          <li>Previsão da nota de corte com intervalo, não um número solto</li>
          <li>A melhor ordem para as suas duas opções, contando a lista de espera</li>
        </ul>
      </div>
      <form className="painel" style={{ boxShadow: "var(--sombra)" }} onSubmit={(e) => { e.preventDefault(); if (pronto) confirmar(); }}>
        <div className="linha-flex" style={{ marginBottom: 12 }}>
          <h2>Suas notas no Enem {ed.ano}</h2>
          <button type="button" className="bt mini fantasma empurra" onClick={() => setEd({ ...ed, notas: EXEMPLO })}>Usar um exemplo</button>
        </div>
        <CamposNotas edicao={ed} onChange={(notas) => setEd({ ...ed, notas })} />
        <div className="campo" style={{ marginTop: 14 }}>
          <span>Cursos que você quer (opcional)</span>
          <BuscaMulti opcoes={base.cursos} valor={cursos} onChange={setCursos} placeholder="Digite um curso: Medicina, Pedagogia…" />
        </div>
        <div className="linha-flex" style={{ marginTop: 16 }}>
          <button type="submit" className="bt pri" disabled={!pronto}>Ver minhas chances</button>
          <button type="button" className="bt fantasma" onClick={() => ir("explorar")}>Só quero ver as notas de corte</button>
        </div>
        <p className="pequeno mudo" style={{ marginTop: 14 }}>
          Ainda sem o resultado? Use uma estimativa. Cotas, outras edições do Enem e estados ficam em <a href="#/perfil" onClick={(e) => { e.preventDefault(); ir("perfil"); }}>Perfil</a>. Seus dados não saem deste navegador.
        </p>
      </form>
    </div>
  );
}

export function Painel({ ir }: { ir: (r: Rota) => void }) {
  const { base, estado, temNotas, avaliacoes } = useApp();
  const p = estado.perfil;
  const temPref = p.cursos.length > 0 || p.areas.length > 0;

  const d = useMemo(() => {
    const elegiveis = avaliacoes.filter((a) => a.nota.elegivel && a.prob != null);
    const local = (a: Avaliacao) => !p.ufs.length || p.ufs.includes(a.oferta.uf);
    const universo = elegiveis.filter((a) => local(a) && (!temPref || a.cursoPreferido || p.areas.includes(a.oferta.area)));
    const cont = Object.fromEntries(FAIXAS.map((f) => [f, 0])) as Record<Faixa, number>;
    for (const a of universo) cont[faixaDe(a.prob)]++;
    const ord = (x: Avaliacao, y: Avaliacao) => y.afinidade - x.afinidade || (y.serie?.q50 ?? 0) - (x.serie?.q50 ?? 0);
    const seguras = universo.filter((a) => a.prob! >= 0.8).sort(ord).slice(0, 6);
    const apostas = universo.filter((a) => a.prob! >= 0.2 && a.prob! < 0.8).sort((x, y) => y.afinidade - x.afinidade || y.prob! - x.prob!).slice(0, 6);
    // descobertas: cursos da mesma área que a pessoa não listou, onde a chance é alta
    const areasDeInteresse = new Set([...p.areas, ...avaliacoes.filter((a) => a.cursoPreferido).map((a) => a.oferta.area)]);
    const vistos = new Set<string>();
    const descobertas = p.cursos.length
      ? elegiveis
        .filter((a) => !a.cursoPreferido && areasDeInteresse.has(a.oferta.area) && local(a) && a.prob! >= 0.7)
        .sort((x, y) => (y.serie?.q50 ?? 0) - (x.serie?.q50 ?? 0))
        .filter((a) => (vistos.has(a.oferta.curso) ? false : (vistos.add(a.oferta.curso), true)))
        .slice(0, 5)
      : [];
    return { universo, cont, seguras, apostas, descobertas };
  }, [avaliacoes, p, temPref]);

  if (!temNotas) return <Entrada ir={ir} />;

  const melhor = Math.max(...p.edicoes.filter(edicaoPreenchida).map((e) => mediaSimples(e.notas)));
  const total = d.universo.length;
  const cursosTend = (p.cursos.length ? p.cursos : ["Medicina", "Direito", "Pedagogia"]).filter((c) => base.tendencias.has(c)).slice(0, 3);
  const escopo = temPref ? "nos cursos e áreas que você escolheu" : "em todo o SISU";

  return (
    <>
      <div className="cab">
        <div>
          <h1>{d.cont.alta > 0 ? `Sua nota alcança ${plural(d.cont.alta, "curso", "cursos")} com folga` : "Nenhum curso com folga — ainda"}</h1>
          <p>
            Média simples de {fmt.nota1(melhor)}. Olhamos {plural(total, "oferta", "ofertas")} {escopo}{p.ufs.length ? ` em ${p.ufs.join(", ")}` : ""} em que você cumpre as notas mínimas.
            {!temPref && " Diga quais cursos você quer para afinar a busca."}
          </p>
        </div>
        <div className="linha-flex">
          <button className="bt" onClick={() => ir("perfil")}>Ajustar perfil</button>
          <button className="bt pri" onClick={() => ir("explorar")}>Explorar tudo</button>
        </div>
      </div>

      <div className="faixas">
        {FAIXAS.map((f) => (
          <button key={f} onClick={() => { definirFiltroInicial({ faixa: f }); ir("explorar"); }} title="Ver essas ofertas">
            <span className="linha-flex" style={{ gap: 7, fontWeight: 600 }}><Glifo faixa={f} />{ROTULO_FAIXA[f]}</span>
            <span className="n">{fmt.int(d.cont[f])}</span>
            <span className="d">{DESC[f]}</span>
          </button>
        ))}
      </div>
      {total > 0 && (
        <div className="distrib" role="img" aria-label={FAIXAS.map((f) => `${ROTULO_FAIXA[f]}: ${d.cont[f]}`).join("; ")}>
          {FAIXAS.map((f) => d.cont[f] > 0 && <span key={f} style={{ flex: d.cont[f], background: COR_FAIXA[f] }} />)}
        </div>
      )}

      <section className="secao" style={{ marginTop: 28 }}>
        <div className="linha-flex" style={{ marginBottom: 10 }}>
          <h2>Os mais disputados que você alcança</h2>
        </div>
        <p className="mudo" style={{ marginBottom: 12 }}>Chance alta, ordenados pela nota de corte prevista. <LegendaInline /></p>
        <ListaOfertas itens={d.seguras} vazio="Com este perfil, nenhuma oferta chega a 80% de chance. Amplie estados ou turnos em Perfil, ou veja as apostas abaixo." />
      </section>

      <section className="secao">
        <h2>Vale a tentativa</h2>
        <p className="mudo">Chance entre 20% e 80%: boas para a 1ª opção, desde que a 2ª proteja você.</p>
        <ListaOfertas itens={d.apostas} vazio="Nada nessa faixa agora." />
      </section>

      {d.descobertas.length > 0 && (
        <section className="secao">
          <h2>Cursos vizinhos que talvez você não tenha olhado</h2>
          <p className="mudo">Mesma área dos seus cursos, com chance de 70% ou mais.</p>
          <ListaOfertas itens={d.descobertas} />
        </section>
      )}

      <div className="painel" style={{ marginTop: 18 }}><LegendaRegua anoBase={base.anoBase} anoAlvo={base.anoAlvo} /></div>

      {cursosTend.length > 0 && (
        <section className="painel">
          <h2>Como a nota de corte desses cursos se moveu no país</h2>
          <p className="mudo" style={{ margin: "6px 0 12px" }}>Mediana nacional da ampla concorrência, por edição. Mostra o quanto uma edição inteira pode subir ou descer.</p>
          <GraficoHistorico anos={base.anos} descricao="Mediana nacional da nota de corte por curso e edição"
            series={cursosTend.map((c, i) => ({ nome: c, cor: CORES[i], valores: base.tendencias.get(c)! }))} />
        </section>
      )}

      <div className="grade3" style={{ marginTop: 18 }}>
        <section className="painel">
          <h3>Monte a estratégia das duas opções</h3>
          <p className="mudo" style={{ margin: "6px 0 12px" }}>Guarde cursos na sua lista e veja qual ordem dá mais chance de vaga, com e sem lista de espera.</p>
          <button className="bt" onClick={() => ir("estrategia")}>Abrir estratégia{estado.lista.length ? ` (${estado.lista.length} na lista)` : ""}</button>
        </section>
        <section className="painel">
          <h3>E se eu não passar na regular?</h3>
          <p className="mudo" style={{ margin: "6px 0 12px" }}>Veja a chance de ser chamado pela lista de espera, com o histórico de cada curso da UFV e da UFMG.</p>
          <button className="bt" onClick={() => ir("espera")}>Abrir lista de espera</button>
        </section>
        <section className="painel">
          <h3>Pergunte ao consultor</h3>
          <p className="mudo" style={{ margin: "6px 0 12px" }}>“Tenho mais chance em Direito na UFC ou na UFPE?” Ele responde com os números daqui.</p>
          <button className="bt" onClick={() => ir("consultor")}>Abrir consultor</button>
        </section>
      </div>
    </>
  );
}

function LegendaInline() {
  return <span>O losango é a sua nota; a faixa é onde o corte deve cair.</span>;
}
