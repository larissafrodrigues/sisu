import type { Preferencia } from "../tema/tema";
import { Ic } from "./Icones";

const OPCOES: { valor: Preferencia; nome: string; icone: () => JSX.Element }[] = [
  { valor: "claro", nome: "Claro", icone: Ic.sol },
  { valor: "escuro", nome: "Escuro", icone: Ic.lua },
  { valor: "sistema", nome: "Auto", icone: Ic.tela },
];

/** Escolha do tema. "Auto" segue a configuração do aparelho. */
export function SeletorTema({ valor, aoMudar, compacto = false }: { valor: Preferencia; aoMudar: (p: Preferencia) => void; compacto?: boolean }) {
  return (
    <div className={`tema${compacto ? " compacto" : ""}`} role="group" aria-label="Tema">
      {OPCOES.map((o) => (
        <button key={o.valor} type="button" aria-pressed={valor === o.valor} onClick={() => aoMudar(o.valor)}
          title={o.valor === "sistema" ? "Automático: segue o tema do aparelho" : `Tema ${o.nome.toLowerCase()}`}>
          {o.icone()}<span className={compacto ? "sr" : undefined}>{o.nome}</span>
        </button>
      ))}
    </div>
  );
}
