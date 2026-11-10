import { useEffect, useRef, useState } from "react";
import { analisar } from "../consultoria/analise";
import { montarContexto } from "../consultoria/contexto";
import { responderOffline } from "../consultoria/offline";
import { useApp } from "../state/store";
import { Ic } from "../ui/Icones";
import { Markdown } from "../ui/Markdown";

interface Msg {
  role: "user" | "assistant";
  content: string;
  contexto?: string;
}

// Mensagens mantidas apenas enquanto o site estiver aberto.
let memoria: Msg[] = [];

export function Consultor() {
  const { base, motor, estado, avaliacoes, porOferta, temNotas } = useApp();
  const [msgs, setMsgs] = useState<Msg[]>(memoria);
  const [texto, setTexto] = useState("");
  const fim = useRef<HTMLDivElement>(null);

  useEffect(() => {
    memoria = msgs;
    fim.current?.scrollIntoView({ block: "end" });
  }, [msgs]);

  function enviar(pergunta: string) {
    const q = pergunta.trim();
    if (!q) return;
    setTexto("");
    const analise = analisar(base, motor, estado, avaliacoes, porOferta, q);
    const resposta = responderOffline(base, estado, analise, temNotas, q);
    const contexto = montarContexto(base, estado, analise, temNotas);
    setMsgs((anteriores) => [...anteriores,
      { role: "user", content: q },
      { role: "assistant", content: resposta, contexto },
    ]);
  }

  const p = estado.perfil;
  const curso = p.cursos[0];
  const sugestoes = [
    temNotas ? "Onde tenho mais chance com as minhas notas?" : "Como funciona a lista de espera?",
    curso ? `Quais minhas chances em ${curso}?` : "Quais minhas chances em Direito na UFMG?",
    estado.lista.length >= 2 ? "Qual a melhor ordem para as minhas duas opções?" : "Como escolher a 1ª e a 2ª opção?",
    p.escolaPublica ? "Vale mais a pena concorrer por cota ou ampla concorrência?" : "Como funcionam as cotas no SISU?",
    "Dá para confiar nessas previsões?",
  ];

  return (
    <>
      <div className="cab">
        <div>
          <h1>Consultor</h1>
          <p>Escolha uma pergunta ou escreva sobre notas, cursos, cotas e inscrições. As orientações usam os dados desta plataforma.</p>
        </div>
      </div>

      <section className="painel chat">
        <div className="msgs" aria-live="polite">
          {msgs.length === 0 && (
            <div className="sem" style={{ margin: "auto" }}>
              <h3>O que você quer saber?</h3>
              <p style={{ maxWidth: "56ch", margin: "0 auto 14px" }}>
                {temNotas
                  ? "Já temos suas notas. Comece por uma destas perguntas ou escreva a sua."
                  : "Você ainda não informou suas notas. Posso explicar as regras; para analisar suas chances, preencha o Perfil."}
              </p>
              <div className="chips" style={{ justifyContent: "center" }}>
                {sugestoes.map((s) => <button key={s} className="chip" onClick={() => enviar(s)}>{s}</button>)}
              </div>
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={`msg ${m.role === "user" ? "eu" : "ia"}`}>
              {m.role === "user" ? m.content : <Markdown texto={m.content} />}
              {m.role === "assistant" && m.contexto && (
                <details className="ctx" style={{ marginTop: 8 }}>
                  <summary>Ver dados considerados na resposta</summary>
                  <pre>{m.contexto}</pre>
                </details>
              )}
            </div>
          ))}
          <div ref={fim} />
        </div>
        <form className="compor" onSubmit={(e) => { e.preventDefault(); enviar(texto); }}>
          <textarea value={texto} rows={1} placeholder="Escreva sua pergunta…" aria-label="Sua pergunta"
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(texto); } }} />
          <button type="submit" className="bt pri" disabled={!texto.trim()}>{Ic.enviar()}Enviar</button>
        </form>
      </section>
      <div className="linha-flex" style={{ marginTop: 10 }}>
        <p className="pequeno mudo">As respostas cobrem perguntas comuns e podem não compreender todos os pedidos. Confira regras e datas no edital do MEC.</p>
        {msgs.length > 0 && <button className="bt mini fantasma empurra" onClick={() => setMsgs([])}>Limpar conversa</button>}
      </div>
    </>
  );
}
