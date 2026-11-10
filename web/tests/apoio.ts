import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { decodificar } from "../src/core/dados";
import type { Base, Perfil } from "../src/core/tipos";

let cache: Base | null = null;
export function base(): Base {
  cache ??= decodificar(JSON.parse(readFileSync(resolve(__dirname, "../public/data/base.json"), "utf8")));
  return cache;
}

export function perfil(parcial: Partial<Perfil> = {}): Perfil {
  return {
    nome: "",
    edicoes: [{ ano: 2026, notas: { red: 800, lc: 650, mt: 700, ch: 660, cn: 640 } }],
    escolaPublica: false, rendaBaixa: false, raca: "nao", quilombola: false, pcd: false,
    cursos: [], areas: [], ufs: [], turnos: [], graus: [],
    ...parcial,
  };
}
