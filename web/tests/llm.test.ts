import { afterEach, describe, expect, it, vi } from "vitest";
import * as openai from "../src/llm/openai";
import { PROVEDORES } from "../src/llm/provedores";

/** Resposta com corpo em streaming, entregue nos pedaços indicados (testa linhas cortadas ao meio). */
function streaming(pedacos: string[], status = 200): Response {
  const enc = new TextEncoder();
  const corpo = new ReadableStream<Uint8Array>({
    start(c) {
      for (const p of pedacos) c.enqueue(enc.encode(p));
      c.close();
    },
  });
  return new Response(corpo, { status, headers: { "Content-Type": "text/event-stream" } });
}

const json = (obj: unknown, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
const delta = (s: string) => `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: s } }] })}\n\n`;

afterEach(() => vi.unstubAllGlobals());

describe("cliente vLLM (API compatível com OpenAI)", () => {
  it("normaliza o endereço com ou sem /v1", () => {
    expect(openai.raizV1("http://127.0.0.1:8000")).toBe("http://127.0.0.1:8000/v1");
    expect(openai.raizV1("http://127.0.0.1:8000/v1/ ")).toBe("http://127.0.0.1:8000/v1");
  });

  it("lista os modelos e envia a chave de API quando informada", async () => {
    const f = vi.fn(async () => json({ object: "list", data: [{ id: "Qwen/Qwen2.5-7B-Instruct-AWQ" }] }));
    vi.stubGlobal("fetch", f);
    const r = await openai.verificar("http://127.0.0.1:8000", "segredo");
    expect(r).toEqual({ ok: true, modelos: ["Qwen/Qwen2.5-7B-Instruct-AWQ"] });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:8000/v1/models");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer segredo");
  });

  it("não envia Authorization sem chave e explica o 401", async () => {
    const f = vi.fn(async () => json({ error: "Unauthorized" }, 401));
    vi.stubGlobal("fetch", f);
    const r = await openai.verificar("http://127.0.0.1:8000");
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/chave de API/);
    const init = (f.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("monta o texto do streaming SSE, mesmo com eventos partidos entre pedaços", async () => {
    const corpo = delta("Olá") + delta(", tudo") + ": comentário de keep-alive\n\n" + delta(" bem?") + "data: [DONE]\n\n";
    const meio = Math.floor(corpo.length / 2);
    const f = vi.fn(async () => streaming([corpo.slice(0, 7), corpo.slice(7, meio), corpo.slice(meio)]));
    vi.stubGlobal("fetch", f);
    const parciais: string[] = [];
    const final = await openai.conversar("http://127.0.0.1:8000", "", "m", [{ role: "user", content: "oi" }], (p) => parciais.push(p));
    expect(final).toBe("Olá, tudo bem?");
    expect(parciais).toEqual(["Olá", "Olá, tudo", "Olá, tudo bem?"]);
    const corpoEnviado = JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(corpoEnviado).toMatchObject({ model: "m", stream: true });
  });

  it("propaga a mensagem de erro do vLLM (ex.: contexto longo demais)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ object: "error", message: "This model's maximum context length is 4096 tokens", code: 400 }, 400)));
    await expect(openai.conversar("http://x", "", "m", [], () => {})).rejects.toThrow(/maximum context length/);
  });
});

describe("registro de provedores", () => {
  it("vLLM é o padrão, na porta 8000; Ollama continua disponível", () => {
    expect(PROVEDORES.vllm.urlPadrao).toBe("http://127.0.0.1:8000");
    expect(PROVEDORES.ollama.urlPadrao).toBe("http://127.0.0.1:11434");
  });
});
