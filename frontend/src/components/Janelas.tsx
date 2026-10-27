import { AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";
import { useJanelas } from "@/core/janelas";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { Input } from "./ui/input";

/** Monte uma vez (App.tsx). Mostra a janela pedida por confirmar()/pedirTexto(). */
export function Janelas() {
  const { atual, fechar } = useJanelas();
  const [texto, setTexto] = useState("");

  useEffect(() => {
    if (atual?.tipo === "texto") setTexto(atual.valorInicial ?? "");
  }, [atual]);

  if (!atual) return null;

  const cancelar = () => {
    if (atual.tipo === "confirmar") atual.resolver(false);
    else atual.resolver(null);
    fechar();
  };
  const ok = () => {
    if (atual.tipo === "confirmar") atual.resolver(true);
    else {
      const v = texto.trim();
      if (!v) return;
      atual.resolver(v);
    }
    fechar();
  };

  return (
    <Dialog
      aberto
      aoMudar={(aberto) => !aberto && cancelar()}
      titulo={
        <span className="flex items-center gap-2">
          {atual.tipo === "confirmar" && atual.perigo ? <AlertTriangle className="size-5 text-danger" /> : null}
          {atual.titulo}
        </span>
      }
      descricao={atual.mensagem}
      rodape={
        <>
          <Button variante="secondary" onClick={cancelar}>
            {atual.tipo === "confirmar" ? (atual.cancelar ?? "Continuar preenchendo") : "Cancelar"}
          </Button>
          <Button variante={atual.tipo === "confirmar" && atual.perigo ? "danger" : "primary"} onClick={ok}>
            {atual.confirmar ?? "Confirmar"}
          </Button>
        </>
      }
    >
      {atual.tipo === "texto" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ok();
          }}
        >
          <label className="text-xs font-bold uppercase tracking-wider text-arcom-gray" htmlFor="janela-texto">
            {atual.rotulo}
          </label>
          <Input id="janela-texto" className="mt-1" value={texto} onChange={(e) => setTexto(e.target.value)} />
        </form>
      ) : null}
    </Dialog>
  );
}
