/** Utilidades de texto e formatação (pt-BR). */

export function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const nf1 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

export const fmt = {
  nota: (v: number | null | undefined) => (v == null || Number.isNaN(v) ? "—" : nf2.format(v)),
  nota1: (v: number | null | undefined) => (v == null || Number.isNaN(v) ? "—" : nf1.format(v)),
  int: (v: number | null | undefined) => (v == null || Number.isNaN(v) ? "—" : nf0.format(v)),
  /** Probabilidade como percentual, sem prometer certeza nos extremos. */
  pct: (p: number | null | undefined) => {
    if (p == null || Number.isNaN(p)) return "—";
    if (p < 0.01) return "<1%";
    if (p > 0.99) return ">99%";
    return `${Math.round(p * 100)}%`;
  },
  delta: (v: number | null | undefined) => {
    if (v == null || Number.isNaN(v)) return "—";
    const s = nf1.format(Math.abs(v));
    return v > 0 ? `+${s}` : v < 0 ? `−${s}` : s;
  },
};

export function plural(n: number, um: string, varios: string): string {
  return `${fmt.int(n)} ${n === 1 ? um : varios}`;
}
