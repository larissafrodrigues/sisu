/**
 * Escolha do servidor de LLM. Para acrescentar outro, implemente `verificar` e `conversar`
 * e registre-o em PROVEDORES.
 */
import * as ollama from "./ollama";
import * as openai from "./openai";
import type { EstadoLLM, Mensagem } from "./tipos";

export type { EstadoLLM, Mensagem } from "./tipos";

export type IdProvedor = "vllm" | "ollama";

export interface ConfigProvedor {
  provedor: IdProvedor;
  url: string;
  chave: string;
}

interface Provedor {
  nome: string;
  urlPadrao: string;
  site: string;
  usaChave: boolean;
  verificar: (c: ConfigProvedor) => Promise<EstadoLLM>;
  conversar: (c: ConfigProvedor, modelo: string, msgs: Mensagem[], aoReceber: (parcial: string) => void, sinal?: AbortSignal) => Promise<string>;
}

export const PROVEDORES: Record<IdProvedor, Provedor> = {
  vllm: {
    nome: "vLLM",
    urlPadrao: "http://127.0.0.1:8000",
    site: "https://docs.vllm.ai",
    usaChave: true,
    verificar: (c) => openai.verificar(c.url, c.chave),
    conversar: (c, modelo, msgs, cb, sinal) => openai.conversar(c.url, c.chave, modelo, msgs, cb, sinal),
  },
  ollama: {
    nome: "Ollama",
    urlPadrao: "http://127.0.0.1:11434",
    site: "https://ollama.com",
    usaChave: false,
    verificar: (c) => ollama.verificar(c.url),
    conversar: (c, modelo, msgs, cb, sinal) => ollama.conversar(c.url, modelo, msgs, cb, sinal),
  },
};

export const PROVEDOR_PADRAO: IdProvedor = "vllm";
