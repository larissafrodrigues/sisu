import type { ReactNode } from "react";

function Svg({ children, t = 18 }: { children: ReactNode; t?: number }) {
  return (
    <svg width={t} height={t} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const Ic = {
  bussola: (t?: number) => <Svg t={t}><circle cx="12" cy="12" r="9" /><path d="M15.5 8.5l-2 5-5 2 2-5z" /></Svg>,
  painel: () => <Svg><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></Svg>,
  busca: () => <Svg><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></Svg>,
  comparar: () => <Svg><path d="M7 4v16M17 4v16M3 8l4-4 4 4M13 16l4 4 4-4" /></Svg>,
  rota: () => <Svg><circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="6" r="2.5" /><path d="M8.5 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.5" /></Svg>,
  conversa: () => <Svg><path d="M4 5h16v11H9l-5 4z" /></Svg>,
  pessoa: () => <Svg><circle cx="12" cy="8" r="4" /><path d="M4 20c1.5-4 4.5-5 8-5s6.5 1 8 5" /></Svg>,
  livro: () => <Svg><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M8 7h7M8 11h7" /></Svg>,
  sol: () => <Svg><circle cx="12" cy="12" r="4" /><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" /></Svg>,
  lua: () => <Svg><path d="M20 14.5A8 8 0 0 1 9.500 4a8 8 0 1 0 10.5 10.5z" /></Svg>,
  tela: () => <Svg><rect x="3" y="4" width="18" height="12" rx="1.5" /><path d="M9 20h6M12 16v4" /></Svg>,
  fechar: () => <Svg><path d="M6 6l12 12M18 6L6 18" /></Svg>,
  enviar: () => <Svg><path d="M4 12l16-8-6 16-3-7z" /></Svg>,
  ajuste: () => <Svg><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></Svg>,
  marcador: (cheio: boolean) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={cheio ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 3h12v18l-6-4.5L6 21z" />
    </svg>
  ),
  estrela: (cheia: boolean, t = 18) => (
    <svg width={t} height={t} viewBox="0 0 24 24" fill={cheia ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.200 9.5l6.1-.9z" />
    </svg>
  ),
};

export function Logo() {
  return (
    <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="14.5" fill="none" stroke="currentColor" strokeWidth="1.6" opacity="0.55" />
      <path d="M16 4l4.2 12L16 28l-4.2-12z" fill="#f4b63f" />
      <path d="M16 16l4.2 0L16 28z" fill="#c98a14" />
      <circle cx="16" cy="16" r="1.9" fill="#0e3f4a" />
    </svg>
  );
}
