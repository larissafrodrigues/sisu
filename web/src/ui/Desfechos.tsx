/** Barra de desfechos de uma estratégia: onde o estudante termina, em probabilidade. */
import type { ResultadoPar } from "../core/estrategia";
import { fmt } from "../core/texto";

const PARTES = [
  { k: "p1", nome: "Vaga na 1ª opção", cor: "var(--s1)" },
  { k: "p2", nome: "Vaga na 2ª opção", cor: "var(--s2)" },
  { k: "pEspera", nome: "Lista de espera", cor: "var(--s3)" },
  { k: "pSemVaga", nome: "Sem vaga", cor: "var(--mudo)" },
] as const;

export function Desfechos({ r, compacto = false }: { r: ResultadoPar; compacto?: boolean }) {
  const desc = PARTES.map((p) => `${p.nome}: ${fmt.pct(r[p.k])}`).join("; ");
  return (
    <div>
      <div className="desfechos" role="img" aria-label={desc}>
        {PARTES.map((p) => r[p.k] > 0.002 && <span key={p.k} style={{ flex: r[p.k], background: p.cor }} title={`${p.nome}: ${fmt.pct(r[p.k])}`} />)}
      </div>
      <div className="desf-leg" style={compacto ? { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" } : undefined}>
        {PARTES.map((p) => (
          <div key={p.k}><b>{fmt.pct(r[p.k])}</b><i style={{ background: p.cor }} />{p.nome}{p.k === "pEspera" && r.esperaEm && r.pEspera > 0.002 ? ` (na ${r.esperaEm === "a" ? "1ª" : "2ª"})` : ""}</div>
        ))}
      </div>
    </div>
  );
}
