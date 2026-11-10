import { useEffect, useRef, useState } from "react";
import { analisar } from "../llm/analise";
import { PROMPT_SISTEMA, montarContexto } from "../llm/contexto";
import { responderOffline } from "../llm/offline";
import { PROVEDORES, type EstadoLLM, type IdProvedor, type Mensagem } from "../llm/provedores";
import { useApp } from "../state/store";
import { Ic } from "../ui/Icones";
import { Markdown } from "../ui/Markdown";

interface Msg {
  role: "user" | "assistant";
  content: string;
  origem?: string;
  contexto?: string;
}

const origem = () => (typeof location !== "undefined" && location.protocol.startsWith("http") ? location.origin : "https://seu-usuario.github.io");

/** "Qwen/Qwen2.5-7B-Instruct-AWQ" → "Qwen2.5-7B-Instruct-AWQ" */
const nomeCurto = (m: string) => m.split("/").pop() ?? m;

const AJUDA_VLLM = `# Requer placa de vídeo NVIDIA (CUDA). Num ambiente Python separado:
conda create -n vllm python=3.12 -y && conda activate vllm
pip install vllm

# Modelo de 7B quantizado: cabe em GPU de 8 GB
vllm serve Qwen/Qwen2.5-7B-Instruct-AWQ \\
  --host 127.0.0.1 --port 8000 \\
  --max-model-len 8192 --gpu-memory-utilization 0.85

# Com 16 GB de VRAM ou mais: vllm serve Qwen/Qwen2.5-7B-Instruct --max-model-len 8192
# Espere "Application startup complete" no terminal e clique em "Testar conexão".
# O vLLM já aceita requisições de qualquer origem (--allowed-origins), inclusive do GitHub Pages.
# Se usar --api-key SEGREDO, preencha o campo "Chave de API".`;

const AJUDA_OLLAMA = (o: string) => `# 1. Instale: https://ollama.com/download
# 2. Baixe um modelo que fale bem português (4–8 GB de RAM):
ollama pull qwen2.5:7b        # ou llama3.1:8b, gemma2:9b
# 3. Rodando este site em 127.0.0.1, basta o Ollama estar aberto.
# 4. Usando a versão publicada (GitHub Pages), libere a origem do site e reinicie o Ollama:
OLLAMA_ORIGINS="${o}" ollama serve`;

// a conversa sobrevive à troca de tela, mas não é gravada em disco
let memoria: Msg[] = [];

export function Consultor() {
  const { base, motor, estado, avaliacoes, porOferta, temNotas, setLLM } = useApp();
  const [msgs, setMsgs] = useState<Msg[]>(memoria);
  const [texto, setTexto] = useState("");
  const [servidor, setServidor] = useState<EstadoLLM | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [config, setConfig] = useState(false);
  const fim = useRef<HTMLDivElement>(null);
  const abortar = useRef<AbortController | null>(null);
  const { provedor, url, chave, modelo, ativo } = estado.llm;
  const prov = PROVEDORES[provedor];
  const cfg = { provedor, url, chave };

  function testar() {
    setServidor(null);
    return prov.verificar(cfg);
  }
  function trocarProvedor(id: IdProvedor) {
    // ao trocar de servidor, volta para o endereço padrão dele e deixa a detecção escolher o modelo
    setLLM({ provedor: id, url: PROVEDORES[id].urlPadrao, modelo: "" });
  }

  useEffect(() => { memoria = msgs; fim.current?.scrollIntoView({ block: "end" }); }, [msgs]);
  useEffect(() => {
    let vivo = true;
    testar().then((r) => {
      if (!vivo) return;
      setServidor(r);
      if (r.ok && !r.modelos.includes(modelo)) setLLM({ modelo: r.modelos[0] });
    });
    return () => { vivo = false; };
  }, [provedor, url, chave]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => abortar.current?.abort(), []);

  const usaLLM = !!(ativo && servidor?.ok && modelo);

  async function enviar(pergunta: string) {
    const q = pergunta.trim();
    if (!q || ocupado) return;
    setTexto("");
    const an = analisar(base, motor, estado, avaliacoes, porOferta, q);
    const contexto = montarContexto(base, estado, an, temNotas);
    const anteriores = msgs;
    setMsgs([...anteriores, { role: "user", content: q }]);
    const offline = (nota?: string) => {
      const r = responderOffline(base, estado, an, temNotas, q);
      setMsgs((m) => [...m.filter((x) => x.content !== "" || x.role === "user"), { role: "assistant", content: r, origem: nota ?? "Modo offline · resposta montada direto dos dados", contexto }]);
    };
    if (!usaLLM) return offline();

    setOcupado(true);
    const ctl = new AbortController();
    abortar.current = ctl;
    const historico: Mensagem[] = anteriores.slice(-6).map((m) => ({ role: m.role, content: m.content }));
    const envio: Mensagem[] = [{ role: "system", content: `${PROMPT_SISTEMA}\n\n${contexto}` }, ...historico, { role: "user", content: q }];
    setMsgs((m) => [...m, { role: "assistant", content: "", origem: `${modelo} via ${prov.nome}`, contexto }]);
    try {
      await prov.conversar(cfg, modelo, envio, (parcial) => setMsgs((m) => [...m.slice(0, -1), { ...m[m.length - 1], content: parcial }]), ctl.signal);
    } catch (e) {
      if (!ctl.signal.aborted) offline(`O ${prov.nome} falhou (${(e as Error).message}). Resposta do modo offline.`);
    } finally {
      setOcupado(false);
    }
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
          <p>Pergunte em português. Ele enxerga seu perfil, sua lista e as análises desta plataforma, e só cita números que estão nelas.</p>
        </div>
        <div className="linha-flex">
          <span className={`estado-llm${usaLLM ? " ok" : ""}`}><i />{servidor == null ? `Procurando o ${prov.nome}…` : usaLLM ? `IA: ${nomeCurto(modelo)}` : "Modo offline"}</span>
          <button className="bt" aria-expanded={config} onClick={() => setConfig((c) => !c)}>{Ic.ajuste()}Configurar IA</button>
        </div>
      </div>

      {config && (
        <section className="painel" style={{ marginBottom: 18 }}>
          <h3>Modelo de linguagem</h3>
          <p className="mudo pequeno" style={{ margin: "6px 0 14px", maxWidth: "80ch" }}>
            O consultor conversa com um modelo servido por você: pelo <a href="https://docs.vllm.ai" target="_blank" rel="noreferrer">vLLM</a> (padrão)
            ou pelo <a href="https://ollama.com" target="_blank" rel="noreferrer">Ollama</a>. O navegador fala direto com esse servidor; nenhuma pergunta passa por terceiros.
            Sem servidor, ele continua funcionando no modo offline, com respostas montadas diretamente dos dados.
          </p>
          <div className="linha-flex" style={{ alignItems: "flex-end" }}>
            <label className="campo" style={{ flex: "0 1 140px" }}><span>Servidor</span>
              <select value={provedor} onChange={(e) => trocarProvedor(e.target.value as IdProvedor)}>
                {(Object.keys(PROVEDORES) as IdProvedor[]).map((id) => <option key={id} value={id}>{PROVEDORES[id].nome}</option>)}
              </select></label>
            <label className="campo" style={{ flex: "2 1 220px" }}><span>Endereço</span>
              <input value={url} onChange={(e) => setLLM({ url: e.target.value })} spellCheck={false} placeholder={prov.urlPadrao} /></label>
            {prov.usaChave && (
              <label className="campo" style={{ flex: "1 1 150px" }}><span>Chave de API (opcional)</span>
                <input type="password" value={chave} onChange={(e) => setLLM({ chave: e.target.value })} spellCheck={false} autoComplete="off" placeholder="só se usou --api-key" /></label>
            )}
            <label className="campo" style={{ flex: "2 1 220px" }}><span>Modelo</span>
              <select value={modelo} onChange={(e) => setLLM({ modelo: e.target.value })} disabled={!servidor?.ok}>
                {(servidor?.modelos ?? []).map((m) => <option key={m}>{m}</option>)}
                {!servidor?.ok && <option value="">nenhum encontrado</option>}
              </select></label>
            <button className="bt" onClick={() => testar().then(setServidor)}>Testar conexão</button>
          </div>
          <label className="marca-caixa" style={{ marginTop: 12 }}><input type="checkbox" checked={ativo} onChange={(e) => setLLM({ ativo: e.target.checked })} /><span>Usar a IA quando disponível</span></label>
          {servidor && !servidor.ok && <p className="aviso" style={{ marginTop: 12 }}>{servidor.erro}</p>}
          <details className="ctx" style={{ marginTop: 12 }}>
            <summary>Como ligar o {prov.nome}</summary>
            <pre>{provedor === "vllm" ? AJUDA_VLLM : AJUDA_OLLAMA(origem())}</pre>
          </details>
        </section>
      )}

      <section className="painel chat">
        <div className="msgs" aria-live="polite">
          {msgs.length === 0 && (
            <div className="sem" style={{ margin: "auto" }}>
              <h3>Por onde começamos?</h3>
              <p style={{ maxWidth: "52ch", margin: "0 auto 14px" }}>{temNotas ? "Já tenho suas notas. Escolha uma pergunta ou escreva a sua." : "Você ainda não informou suas notas; posso explicar regras, e falar de chances depois que preencher o perfil."}</p>
              <div className="chips" style={{ justifyContent: "center" }}>
                {sugestoes.map((s) => <button key={s} className="chip" onClick={() => enviar(s)}>{s}</button>)}
              </div>
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={`msg ${m.role === "user" ? "eu" : "ia"}`}>
              {m.role === "user" ? m.content : m.content ? <Markdown texto={m.content} /> : <span className="mudo">Pensando…</span>}
              {m.role === "assistant" && m.origem && (
                <span className="origem">
                  {m.origem}
                  {m.contexto && (
                    <details className="ctx" style={{ marginTop: 4 }}>
                      <summary>Ver os dados usados nesta resposta</summary>
                      <pre>{m.contexto}</pre>
                    </details>
                  )}
                </span>
              )}
            </div>
          ))}
          <div ref={fim} />
        </div>
        <form className="compor" onSubmit={(e) => { e.preventDefault(); enviar(texto); }}>
          <textarea value={texto} rows={1} placeholder="Escreva sua pergunta…" aria-label="Sua pergunta"
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(texto); } }} />
          {ocupado
            ? <button type="button" className="bt" onClick={() => abortar.current?.abort()}>Parar</button>
            : <button type="submit" className="bt pri" disabled={!texto.trim()}>{Ic.enviar()}Enviar</button>}
        </form>
      </section>
      <div className="linha-flex" style={{ marginTop: 10 }}>
        <p className="pequeno mudo">Orientação, não garantia. Confirme regras e datas no edital do MEC.</p>
        {msgs.length > 0 && <button className="bt mini fantasma empurra" onClick={() => setMsgs([])}>Limpar conversa</button>}
      </div>
    </>
  );
}
