import { Loader2, Search } from "lucide-react";
import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Campo, Input, Select, Textarea } from "@/components/ui/input";
import { AREAS_RESUMO } from "@/core/constantes";
import { ErroApi } from "@/core/erro";
import { resolverZod } from "@/core/formulario";
import { consultarFornecedor, useSugestoes } from "@/hooks/recursos";
import {
  cnpjValido,
  esquemaCompra,
  mascararCNPJ,
  SUGESTOES_INICIAIS,
  type ValoresCompra,
} from "./compraForm";

type Aviso = { tipo: "info" | "erro"; texto: string } | null;

function unir(...listas: string[][]): string[] {
  return [...new Set(listas.flat().filter(Boolean))];
}

/**
 * Formulário de compra do Resumo Inteligente. Usado em "Lançar compra" e na
 * edição pelo histórico. `inicial` só é lido na montagem — troque a `key`
 * pra recarregar com outros valores.
 */
export function FormularioCompra({
  inicial,
  aoSalvar,
  aoMudar,
  salvando,
  rotuloSalvar = "Salvar compra",
  acoesExtras,
  idPrefixo = "compra",
}: {
  inicial: ValoresCompra;
  aoSalvar: (v: ValoresCompra) => Promise<unknown> | void;
  aoMudar?: (v: ValoresCompra) => void;
  salvando?: boolean;
  rotuloSalvar?: string;
  acoesExtras?: ReactNode;
  idPrefixo?: string;
}) {
  const form = useForm<ValoresCompra>({ resolver: resolverZod(esquemaCompra), defaultValues: inicial });
  const { register, setValue, getValues, formState, control } = form;
  const erros = formState.errors;
  const areaAtual = useWatch({ control, name: "area" });
  const sugestoes = useSugestoes();
  const [aviso, setAviso] = useState<Aviso>(null);
  const [consultando, setConsultando] = useState<"cnpj" | "codigo" | null>(null);

  useEffect(() => {
    if (!aoMudar) return;
    aoMudar(getValues());
    const sub = form.watch((v) => aoMudar(v as ValoresCompra));
    return () => sub.unsubscribe();
  }, [form, aoMudar, getValues]);

  const id = (c: string) => `${idPrefixo}-${c}`;

  async function porCNPJ() {
    const cnpj = getValues("cnpj");
    if (!cnpj.trim()) return;
    if (!cnpjValido(cnpj)) {
      setAviso({ tipo: "erro", texto: "CNPJ inválido. Confira os dígitos." });
      return;
    }
    setConsultando("cnpj");
    try {
      const r = await consultarFornecedor({ cnpj });
      if (r.encontrado) {
        setValue("fornecedor", r.nome, { shouldDirty: true });
        if (r.codigo) setValue("codigoFornecedor", r.codigo, { shouldDirty: true });
        setValue("cnpj", r.cnpj || cnpj);
        const origem = r.origem === "brasilapi" ? "Receita (BrasilAPI)" : r.origem === "historico" ? "histórico de compras" : "cadastro";
        setAviso({ tipo: "info", texto: r.aviso ?? `Fornecedor preenchido a partir do ${origem}.` });
      } else {
        setAviso({ tipo: "info", texto: "CNPJ não encontrado. Preencha o fornecedor manualmente." });
      }
    } catch (e) {
      setAviso({ tipo: "erro", texto: e instanceof ErroApi ? e.mensagem : "Não foi possível consultar o CNPJ. Preencha manualmente." });
    } finally {
      setConsultando(null);
    }
  }

  async function porCodigo() {
    const codigo = getValues("codigoFornecedor").trim();
    if (!codigo) return;
    setConsultando("codigo");
    try {
      const r = await consultarFornecedor({ codigo });
      if (r.encontrado) {
        setValue("fornecedor", r.nome, { shouldDirty: true });
        if (r.cnpj) setValue("cnpj", r.cnpj, { shouldDirty: true });
        setAviso({ tipo: "info", texto: r.aviso ?? "Fornecedor e CNPJ preenchidos pelo código." });
      } else {
        setAviso({ tipo: "info", texto: "Código não encontrado no histórico. Informe fornecedor e CNPJ uma vez e o sistema aprende." });
      }
    } catch (e) {
      setAviso({ tipo: "erro", texto: e instanceof ErroApi ? e.mensagem : "Não foi possível consultar o código. Preencha manualmente." });
    } finally {
      setConsultando(null);
    }
  }

  const aoEnter = (fn: () => Promise<void>) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void fn();
    }
  };

  const cnpjReg = register("cnpj");
  const codigoReg = register("codigoFornecedor");
  const s = sugestoes.data;

  return (
    <form
      noValidate
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      onSubmit={(e) =>
        void form.handleSubmit(async (v) => {
          try {
            await aoSalvar(v);
            setAviso(null);
          } catch {
            // erro de API já vira toast no interceptor (core/api.ts)
          }
        })(e)
      }
    >
      <datalist id={id("l-solicitantes")}>
        {unir(SUGESTOES_INICIAIS.solicitantes, s?.solicitantes ?? []).map((v) => <option key={v} value={v} />)}
      </datalist>
      <datalist id={id("l-autorizadores")}>
        {unir(SUGESTOES_INICIAIS.aprovadores, s?.autorizadores ?? []).map((v) => <option key={v} value={v} />)}
      </datalist>
      <datalist id={id("l-aprovadores")}>
        {unir(SUGESTOES_INICIAIS.aprovadores, s?.aprovadores ?? []).map((v) => <option key={v} value={v} />)}
      </datalist>
      <datalist id={id("l-fornecedores")}>
        {unir(SUGESTOES_INICIAIS.fornecedores, s?.fornecedores ?? []).map((v) => <option key={v} value={v} />)}
      </datalist>
      <datalist id={id("l-prazos")}>
        {unir(["À VISTA", "28 DIAS", "30 DIAS", "CARTÃO DE CRÉDITO"], s?.prazos ?? []).map((v) => <option key={v} value={v} />)}
      </datalist>

      <Campo rotulo="Data" htmlFor={id("data")} erro={erros.data?.message}>
        <Input id={id("data")} type="date" {...register("data")} />
      </Campo>
      <Campo rotulo="Tipo" htmlFor={id("tipo")}>
        <Select id={id("tipo")} {...register("tipo")}>
          <option value="compra">Compra realizada</option>
          <option value="orcamento">Orçamento</option>
        </Select>
      </Campo>
      <Campo rotulo="Solicitante" htmlFor={id("solicitante")} erro={erros.solicitante?.message}>
        <Input id={id("solicitante")} list={id("l-solicitantes")} autoComplete="off" {...register("solicitante")} />
      </Campo>
      <Campo rotulo="Área" htmlFor={id("area")} erro={erros.area?.message}>
        <Select id={id("area")} {...register("area")} aria-invalid={!!erros.area}>
          <option value="">Escolha</option>
          {AREAS_RESUMO.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
          {areaAtual && !(AREAS_RESUMO as readonly string[]).includes(areaAtual) ? (
            <option value={areaAtual}>{areaAtual}</option>
          ) : null}
        </Select>
      </Campo>

      <Campo rotulo="CNPJ do fornecedor" htmlFor={id("cnpj")} erro={erros.cnpj?.message} dica="Saia do campo ou tecle Enter para buscar">
        <div className="relative">
          <Input
            id={id("cnpj")}
            inputMode="numeric"
            placeholder="00.000.000/0000-00"
            autoComplete="off"
            {...cnpjReg}
            onChange={(e) => {
              e.target.value = mascararCNPJ(e.target.value);
              void cnpjReg.onChange(e);
            }}
            onBlur={(e) => {
              void cnpjReg.onBlur(e);
              void porCNPJ();
            }}
            onKeyDown={aoEnter(porCNPJ)}
          />
          {consultando === "cnpj" ? <Loader2 className="absolute right-3 top-3 size-4 animate-spin text-verde-arcom" /> : null}
        </div>
      </Campo>
      <Campo rotulo="Código do fornecedor" htmlFor={id("codigo")} erro={erros.codigoFornecedor?.message}>
        <div className="relative">
          <Input
            id={id("codigo")}
            autoComplete="off"
            {...codigoReg}
            onBlur={(e) => {
              void codigoReg.onBlur(e);
              void porCodigo();
            }}
            onKeyDown={aoEnter(porCodigo)}
          />
          {consultando === "codigo" ? (
            <Loader2 className="absolute right-3 top-3 size-4 animate-spin text-verde-arcom" />
          ) : (
            <Search className="pointer-events-none absolute right-3 top-3 size-4 text-arcom-gray/60" />
          )}
        </div>
      </Campo>
      <Campo rotulo="Fornecedor" htmlFor={id("fornecedor")} erro={erros.fornecedor?.message} className="sm:col-span-2">
        <Input id={id("fornecedor")} list={id("l-fornecedores")} autoComplete="off" {...register("fornecedor")} />
      </Campo>

      {aviso ? (
        <p
          role="status"
          className={
            aviso.tipo === "erro"
              ? "rounded-md bg-danger/10 px-3 py-2 text-sm font-medium text-danger sm:col-span-2 xl:col-span-4"
              : "rounded-md bg-verde-lima/30 px-3 py-2 text-sm text-verde-escuro sm:col-span-2 xl:col-span-4"
          }
        >
          {aviso.texto}
        </p>
      ) : null}

      <Campo rotulo="OCS" htmlFor={id("ocs")} erro={erros.ocs?.message}>
        <Input id={id("ocs")} autoComplete="off" {...register("ocs")} />
      </Campo>
      <Campo rotulo="Valor (R$)" htmlFor={id("valor")} erro={erros.valor?.message}>
        <Input id={id("valor")} inputMode="decimal" placeholder="0,00" autoComplete="off" {...register("valor")} />
      </Campo>
      <Campo rotulo="Prazo de pagamento" htmlFor={id("prazo")} erro={erros.prazoPagamento?.message}>
        <Input id={id("prazo")} list={id("l-prazos")} autoComplete="off" {...register("prazoPagamento")} />
      </Campo>
      <Campo rotulo="Provisionado na OCS" htmlFor={id("provisionado")}>
        <Select id={id("provisionado")} {...register("provisionado")}>
          <option value="PENDENTE">PENDENTE</option>
          <option value="SIM">SIM</option>
        </Select>
      </Campo>

      <Campo rotulo="Autorizador" htmlFor={id("autorizador")} erro={erros.autorizador?.message}>
        <Input id={id("autorizador")} list={id("l-autorizadores")} autoComplete="off" {...register("autorizador")} />
      </Campo>
      <Campo rotulo="Aprovador no sistema (OCS)" htmlFor={id("aprovador")} erro={erros.aprovador?.message}>
        <Input id={id("aprovador")} list={id("l-aprovadores")} autoComplete="off" {...register("aprovador")} />
      </Campo>
      <Campo rotulo="Situação (opcional)" htmlFor={id("situacao")} erro={erros.situacao?.message} className="sm:col-span-2">
        <Input id={id("situacao")} autoComplete="off" {...register("situacao")} />
      </Campo>

      <Campo rotulo="Descrição" htmlFor={id("descricao")} erro={erros.descricao?.message} className="sm:col-span-2 xl:col-span-4">
        <Textarea id={id("descricao")} rows={3} {...register("descricao")} />
      </Campo>

      <div className="flex flex-wrap items-center gap-2 sm:col-span-2 xl:col-span-4">
        <Button type="submit" disabled={salvando}>
          {salvando ? "Salvando..." : rotuloSalvar}
        </Button>
        {acoesExtras}
      </div>
    </form>
  );
}
