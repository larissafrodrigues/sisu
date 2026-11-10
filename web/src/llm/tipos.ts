/** Tipos comuns aos clientes de LLM. */
export interface Mensagem {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface EstadoLLM {
  ok: boolean;
  modelos: string[];
  erro?: string;
}
