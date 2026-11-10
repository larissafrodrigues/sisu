/**
 * Cliente da API compatível com OpenAI, usada pelo vLLM (`vllm serve …`).
 * Também funciona com outros servidores que expõem a mesma API (llama.cpp server, LM Studio, SGLang).
 *
 *   GET  {base}/v1/models            → modelos servidos
 *   POST {base}/v1/chat/completions  → resposta em streaming (Server-Sent Events)
 *
 * Referência: https://docs.vllm.ai/en/latest/serving/openai_compatible_server.html
 */
import type { EstadoLLM, Mensagem } from "./tipos";

/** Aceita o endereço com ou sem "/v1" no fim e devolve a raiz da API ("…/v1"). */
export function raizV1(url: string): string {
  return `${url.trim().replace(/\/+$/, "").replace(/\/v1$/, "")}/v1`;
}

function cabecalhos(chave: string): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (chave.trim()) h.Authorization = `Bearer ${chave.trim()}`;
  return h;
}

/** Extrai a mensagem de erro dos formatos usados pelo vLLM e pela OpenAI. */
async function mensagemErro(r: Response): Promise<string> {
  try {
    const j = (await r.json()) as { message?: string; error?: { message?: string } | string; detail?: string };
    const m = typeof j.error === "string" ? j.error : j.error?.message ?? j.message ?? j.detail;
    if (m) return `HTTP ${r.status}: ${m}`;
  } catch {
    /* corpo não é JSON */
  }
  return `HTTP ${r.status}`;
}

export async function verificar(url: string, chave = "", tempoMs = 2500): Promise<EstadoLLM> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), tempoMs);
  try {
    const r = await fetch(`${raizV1(url)}/models`, { headers: cabecalhos(chave), signal: ctl.signal });
    if (r.status === 401) return { ok: false, modelos: [], erro: "O servidor pediu uma chave de API. Preencha o campo “Chave de API” com o valor de --api-key." };
    if (!r.ok) return { ok: false, modelos: [], erro: `O servidor respondeu ${await mensagemErro(r)}.` };
    const j = (await r.json()) as { data?: { id: string }[] };
    const modelos = (j.data ?? []).map((m) => m.id).sort();
    return modelos.length
      ? { ok: true, modelos }
      : { ok: false, modelos, erro: "O servidor respondeu, mas não informou nenhum modelo." };
  } catch {
    return {
      ok: false, modelos: [],
      erro: "Sem resposta do vLLM neste endereço. Confira se o `vllm serve` terminou de carregar o modelo (a mensagem “Application startup complete” aparece no terminal) e se a porta está certa.",
    };
  } finally {
    clearTimeout(t);
  }
}

/** Conversa com streaming SSE: chama `aoReceber` a cada pedaço e devolve o texto completo. */
export async function conversar(url: string, chave: string, modelo: string, mensagens: Mensagem[], aoReceber: (parcial: string) => void, sinal?: AbortSignal): Promise<string> {
  const r = await fetch(`${raizV1(url)}/chat/completions`, {
    method: "POST",
    headers: cabecalhos(chave),
    body: JSON.stringify({ model: modelo, messages: mensagens, stream: true, temperature: 0.3, max_tokens: 1200 }),
    signal: sinal,
  });
  if (!r.ok || !r.body) throw new Error(await mensagemErro(r));
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
    for (const bruta of linhas) {
      const linha = bruta.trim();
      if (!linha.startsWith("data:")) continue; // ignora comentários e linhas vazias do SSE
      const dado = linha.slice(5).trim();
      if (dado === "[DONE]") return texto;
      const j = JSON.parse(dado) as { choices?: { delta?: { content?: string | null } }[]; error?: { message?: string } };
      if (j.error) throw new Error(j.error.message ?? "erro no streaming");
      const pedaco = j.choices?.[0]?.delta?.content;
      if (pedaco) {
        texto += pedaco;
        aoReceber(texto);
      }
    }
  }
  return texto;
}
