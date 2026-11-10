import { useEffect, useState } from "react";
import { carregarBase } from "./core/dados";
import type { Base } from "./core/tipos";
import { Provedor, useApp, useRota, type Rota } from "./state/store";
import { useTema, type Preferencia } from "./tema/tema";
import { Ic, Logo } from "./ui/Icones";
import { SeletorTema } from "./ui/SeletorTema";
import { Comparar } from "./views/Comparar";
import { Consultor } from "./views/Consultor";
import { Detalhe } from "./views/Detalhe";
import { Estrategia } from "./views/Estrategia";
import { Explorar } from "./views/Explorar";
import { ListaEspera } from "./views/ListaEspera";
import { Metodo } from "./views/Metodo";
import { Painel } from "./views/Painel";
import { PaginaPerfil } from "./views/Perfil";

const ITENS: { rota: Rota; nome: string; curto?: string; icone: () => JSX.Element; soDesktop?: boolean }[] = [
  { rota: "painel", nome: "Painel", icone: Ic.painel },
  { rota: "explorar", nome: "Explorar", icone: Ic.busca },
  { rota: "comparar", nome: "Comparar", icone: Ic.comparar },
  { rota: "estrategia", nome: "Estratégia", icone: Ic.rota },
  { rota: "espera", nome: "Lista de espera", curto: "Espera", icone: Ic.fila },
  { rota: "consultor", nome: "Consultor", icone: Ic.conversa },
  { rota: "perfil", nome: "Perfil", icone: Ic.pessoa },
  { rota: "metodo", nome: "Metodologia", icone: Ic.livro, soDesktop: true },
];

function Casca({ tema, setTema }: { tema: Preferencia; setTema: (p: Preferencia) => void }) {
  const { base, estado, detalhe } = useApp();
  const [rota, ir] = useRota();
  const conta: Partial<Record<Rota, number>> = { comparar: estado.comparar.length, estrategia: estado.lista.length };
  return (
    <div className="casca">
      <div className="barra-topo">
        <a className="logo" href="#/painel"><Logo />Bússola SISU</a>
        <div className="direita">
          <a className="link" href="#/metodo">Metodologia</a>
          <SeletorTema valor={tema} aoMudar={setTema} compacto />
        </div>
      </div>
      <aside className="trilho">
        <a className="logo" href="#/painel"><Logo />Bússola SISU</a>
        <nav className="nav" aria-label="Seções">
          {ITENS.map((i) => (
            <a key={i.rota} href={`#/${i.rota}`} aria-current={rota === i.rota ? "page" : undefined} className={i.soDesktop ? "so-desktop" : undefined}>
              {i.icone()}<span className={i.curto ? "nome-longo" : undefined}>{i.nome}</span>{i.curto && <span className="nome-curto">{i.curto}</span>}
              {!!conta[i.rota] && <span className="conta">{conta[i.rota]}</span>}
            </a>
          ))}
        </nav>
        <SeletorTema valor={tema} aoMudar={setTema} />
        <p className="rodape">
          Dados do MEC até o SISU {base.anoBase}. Previsões para {base.anoAlvo} são estimativas, não garantia de vaga. <a href="#/metodo">Como calculamos</a>
        </p>
      </aside>
      <main className="conteudo">
        {rota === "painel" && <Painel ir={ir} />}
        {rota === "perfil" && <PaginaPerfil ir={ir} />}
        {rota === "explorar" && <Explorar />}
        {rota === "comparar" && <Comparar ir={ir} />}
        {rota === "estrategia" && <Estrategia ir={ir} />}
        {rota === "espera" && <ListaEspera ir={ir} />}
        {rota === "consultor" && <Consultor />}
        {rota === "metodo" && <Metodo />}
         <footer className="rodape-site">
         © {new Date().getFullYear()} <a href="https://larissafrodrigues.github.io" target="_blank" rel="noreferrer">Larissa Rodrigues</a> · Bússola SISU
        </footer>
      </main>
      {detalhe && <Detalhe id={detalhe} ir={ir} />}
    </div>
  );
}

export function App() {
  const [tema, setTema] = useTema(); // aqui em cima para valer também nas telas de carregamento e de erro
  const [base, setBase] = useState<Base | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    carregarBase().then(setBase).catch((e: Error) => setErro(e.message));
  }, []);
  if (erro) {
    return (
      <div className="carregando">
        <div>
          <h2>Não deu para carregar os dados</h2>
          <p style={{ marginTop: 8 }}>{erro}</p>
          <p className="pequeno" style={{ marginTop: 8 }}>Se você está rodando localmente, gere os dados com <code>python -m pipeline.run_all</code> e recarregue.</p>
        </div>
      </div>
    );
  }
  if (!base) return <div className="carregando"><div><Logo /><p>Carregando o catálogo do SISU…</p></div></div>;
  return <Provedor base={base}><Casca tema={tema} setTema={setTema} /></Provedor>;
}
