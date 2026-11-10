import { perfilTemNotas } from "../core/avaliacao";
import { mediaSimples, edicaoPreenchida } from "../core/notas";
import { fmt } from "../core/texto";
import type { Perfil } from "../core/tipos";
import { useApp, type Rota } from "../state/store";
import { BuscaMulti, CamposNotas, Chips } from "../ui/Campos";

export const EXEMPLO = { red: 780, lc: 642.5, mt: 705.3, ch: 668.1, cn: 631.9 };

export function FormCotas({ perfil, set }: { perfil: Perfil; set: (p: Perfil) => void }) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <label className="marca-caixa">
        <input type="checkbox" checked={perfil.escolaPublica} onChange={(e) => set({ ...perfil, escolaPublica: e.target.checked })} />
        <span>Cursei todo o ensino médio em escola pública<br /><span className="pequeno mudo">Condição para qualquer cota da Lei de Cotas.</span></span>
      </label>
      {perfil.escolaPublica && (
        <>
          <label className="marca-caixa">
            <input type="checkbox" checked={perfil.rendaBaixa} onChange={(e) => set({ ...perfil, rendaBaixa: e.target.checked })} />
            <span>Renda familiar de até 1 salário mínimo por pessoa</span>
          </label>
          <div className="campo">
            <span>Autodeclaração</span>
            <div className="chips">
              {([["nao", "Prefiro não usar"], ["pp", "Preto ou pardo"], ["indigena", "Indígena"]] as const).map(([v, r]) => (
                <button type="button" key={v} className="chip" aria-pressed={perfil.raca === v} onClick={() => set({ ...perfil, raca: v })}>{r}</button>
              ))}
            </div>
          </div>
          <label className="marca-caixa">
            <input type="checkbox" checked={perfil.quilombola} onChange={(e) => set({ ...perfil, quilombola: e.target.checked })} />
            <span>Sou quilombola</span>
          </label>
          <label className="marca-caixa">
            <input type="checkbox" checked={perfil.pcd} onChange={(e) => set({ ...perfil, pcd: e.target.checked })} />
            <span>Sou pessoa com deficiência</span>
          </label>
        </>
      )}
    </div>
  );
}

export function PaginaPerfil({ ir }: { ir: (r: Rota) => void }) {
  const { base, estado, setPerfil, limparTudo } = useApp();
  const p = estado.perfil;
  const setEd = (i: number, notas: Perfil["edicoes"][number]["notas"]) =>
    setPerfil({ ...p, edicoes: p.edicoes.map((e, k) => (k === i ? { ...e, notas } : e)) });
  return (
    <>
      <div className="cab">
        <div>
          <h1>Seu perfil</h1>
          <p>Tudo fica salvo só neste navegador. Nada é enviado a servidor algum.</p>
        </div>
        <div className="linha-flex">
          <button className="bt" onClick={() => { if (confirm("Apagar notas, lista e comparação deste navegador?")) limparTudo(); }}>Apagar meus dados</button>
          <button className="bt pri" disabled={!perfilTemNotas(p)} onClick={() => ir("painel")}>Ver minhas chances</button>
        </div>
      </div>

      <section className="painel">
        <h2>Notas do Enem</h2>
        <p className="mudo" style={{ margin: "6px 0 16px", maxWidth: "70ch" }}>
          O SISU aceita as três últimas edições e usa, em cada curso, a que der a melhor média ponderada. Preencha as que você fez.
          Se o resultado do Enem {base.anoAlvo - 1} ainda não saiu, use uma estimativa e ajuste depois.
        </p>
        <div style={{ display: "grid", gap: 18 }}>
          {p.edicoes.map((e, i) => (
            <div key={e.ano}>
              <div className="linha-flex" style={{ marginBottom: 6 }}>
                <h3>Enem {e.ano}</h3>
                {edicaoPreenchida(e) && <span className="pequeno mudo">média simples {fmt.nota1(mediaSimples(e.notas))}</span>}
                {i === 0 && !edicaoPreenchida(e) && <button className="bt mini fantasma" onClick={() => setEd(0, EXEMPLO)}>Preencher com um exemplo</button>}
              </div>
              <CamposNotas edicao={e} onChange={(n) => setEd(i, n)} />
            </div>
          ))}
        </div>
      </section>

      <div className="grade2" style={{ marginTop: 18 }}>
        <section className="painel">
          <h2>Cotas</h2>
          <p className="mudo" style={{ margin: "6px 0 14px" }}>
            Quem concorre por cota disputa primeiro a ampla concorrência e depois a vaga reservada (Lei nº 14.723/2023). Marcamos em cada curso a modalidade com maior chance.
          </p>
          <FormCotas perfil={p} set={setPerfil} />
        </section>
        <section className="painel">
          <h2>O que você procura</h2>
          <p className="mudo" style={{ margin: "6px 0 14px" }}>Opcional. Serve para ordenar as oportunidades; nada é escondido.</p>
          <div style={{ display: "grid", gap: 14 }}>
            <div className="campo"><span>Cursos</span>
              <BuscaMulti opcoes={base.cursos} valor={p.cursos} onChange={(cursos) => setPerfil({ ...p, cursos })} placeholder="Digite um curso: Direito, Enfermagem…" />
            </div>
            <div className="campo"><span>Áreas</span><Chips opcoes={base.areas.filter((a) => a !== "Outras")} valor={p.areas} onChange={(areas) => setPerfil({ ...p, areas })} /></div>
            <div className="campo"><span>Estados</span><Chips opcoes={base.ufs} valor={p.ufs} onChange={(ufs) => setPerfil({ ...p, ufs })} /></div>
            <div className="campo"><span>Turnos</span><Chips opcoes={base.turnos} valor={p.turnos} onChange={(turnos) => setPerfil({ ...p, turnos })} /></div>
            <div className="campo"><span>Grau</span><Chips opcoes={base.graus} valor={p.graus} onChange={(graus) => setPerfil({ ...p, graus })} /></div>
          </div>
        </section>
      </div>
    </>
  );
}
