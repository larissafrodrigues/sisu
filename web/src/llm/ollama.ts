/**
 * Cliente mínimo da API HTTP do Ollama (https://github.com/ollama/ollama/blob/main/docs/api.md).
 * Roda no navegador e fala direto com o Ollama da própria máquina — nenhuma conversa passa
 * por servidor de terceiros.
 */
import type { EstadoLLM, Mensagem } from "./tipos";

function limpa(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export async function verificar(url: string, tempoMs = 2500): Promise<EstadoLLM> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), tempoMs);
  try {
    const r = await fetch(`${limpa(url)}/api/tags`, { signal: ctl.signal });
    if (!r.ok) return { ok: false, modelos: [], erro: `O Ollama respondeu HTTP ${r.status}.` };
    const j = (await r.json()) as { models?: { name: string }[] };
    const modelos = (j.models ?? []).map((m) => m.name).sort();
    return modelos.length
      ? { ok: true, modelos }
      : { ok: false, modelos, erro: "O Ollama está rodando, mas não há modelos instalados. Rode, por exemplo: ollama pull qwen2.5:7b" };
  } catch {
    return {
      ok: false, modelos: [],
      erro: "Sem resposta do Ollama neste endereço. Confira se ele está aberto e, se este site não estiver em 127.0.0.1, se OLLAMA_ORIGINS libera esta origem.",
    };
  } finally {
    clearTimeout(t);
  }
}

/** Conversa com streaming: chama `aoReceber` a cada pedaço e devolve o texto completo. */
export async function conversar(url: string, modelo: string, mensagens: Mensagem[], aoReceber: (parcial: string) => void, sinal?: AbortSignal): Promise<string> {
  const r = await fetch(`${limpa(url)}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: modelo, messages: mensagens, stream: true, options: { temperature: 0.3, num_ctx: 8192 } }),
    signal: sinal,
  });
  if (!r.ok || !r.body) throw new Error(`O Ollama respondeu HTTP ${r.status}. O modelo "${modelo}" está instalado?`);
  const leitor = r.body.getReader();
  const dec = new TextDecoder();
  let resto = "";
  let texto = "";
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    resto += dec.decode(value, { stream: true });
    const linhas = resto.split("\n");
    resto = linhas.pop() ?? "";
    for (const linha of linhas) {
      if (!linha.trim()) continue;
      const j = JSON.parse(linha) as { message?: { content?: string }; error?: string };
      if (j.error) throw new Error(j.error);
      if (j.message?.content) {
        texto += j.message.content;
        aoReceber(texto);
      }
    }
  }
  return texto;
}
