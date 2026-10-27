import {
  Beef,
  CalendarDays,
  ClipboardList,
  DatabaseBackup,
  FileText,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  PenSquare,
  ShoppingCart,
  Truck,
  Users,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { cn } from "@/core/cn";
import { useLogout, useSessao } from "@/core/sessao";

type ItemMenu = { para: string; rotulo: string; icone: ReactNode; fim?: boolean };
type GrupoMenu = { titulo?: string; itens: ItemMenu[] };

const MENU_COMPRAS: GrupoMenu[] = [
  { itens: [{ para: "/", rotulo: "Painel", icone: <LayoutDashboard />, fim: true }] },
  {
    titulo: "Carnes e verduras",
    itens: [
      { para: "/pedidos-restaurante", rotulo: "Pedidos do restaurante", icone: <ClipboardList /> },
      { para: "/cotacao-carnes", rotulo: "Cotação de carnes e verduras", icone: <Beef /> },
    ],
  },
  { titulo: "Compras", itens: [{ para: "/compras-consumo", rotulo: "Compras de consumo", icone: <ShoppingCart /> }] },
  {
    titulo: "Resumo Inteligente",
    itens: [
      { para: "/resumo/lancar", rotulo: "Lançar compra", icone: <PenSquare /> },
      { para: "/resumo/diario", rotulo: "Resumo diário", icone: <FileText /> },
      { para: "/resumo/historico", rotulo: "Histórico", icone: <History /> },
    ],
  },
  { titulo: "Eventos", itens: [{ para: "/eventos", rotulo: "Acompanhamento de eventos", icone: <CalendarDays /> }] },
  {
    titulo: "Cadastros",
    itens: [
      { para: "/fornecedores", rotulo: "Fornecedores", icone: <Truck /> },
      { para: "/usuarios", rotulo: "Usuários", icone: <Users /> },
      { para: "/backup", rotulo: "Backup e importação", icone: <DatabaseBackup /> },
    ],
  },
];

const MENU_RESTAURANTE: GrupoMenu[] = [
  { itens: [{ para: "/pedidos-restaurante", rotulo: "Pedidos do restaurante", icone: <ClipboardList /> }] },
];

function Navegacao({ grupos, aoNavegar }: { grupos: GrupoMenu[]; aoNavegar: () => void }) {
  return (
    <nav className="flex flex-col gap-4">
      {grupos.map((g, i) => (
        <div key={g.titulo ?? i}>
          {g.titulo ? (
            <p className="mb-1 px-4 text-[11px] font-bold uppercase tracking-wider text-white/50">{g.titulo}</p>
          ) : null}
          <ul>
            {g.itens.map((it) => (
              <li key={it.para}>
                <NavLink
                  to={it.para}
                  end={it.fim}
                  onClick={aoNavegar}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 border-l-[3px] px-4 py-2 text-sm font-medium transition duration-fast [&_svg]:size-[18px]",
                      isActive
                        ? "border-verde-lima bg-white/5 text-verde-lima"
                        : "border-transparent text-white/80 hover:bg-white/5 hover:text-white",
                    )
                  }
                >
                  {it.icone}
                  {it.rotulo}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function Layout() {
  const { usuario } = useSessao();
  const logout = useLogout();
  const [menuAberto, setMenuAberto] = useState(false);
  const grupos = usuario?.papel === "compras" ? MENU_COMPRAS : MENU_RESTAURANTE;

  const lateral = (
    <div className="flex h-full flex-col bg-verde-escuro">
      <div className="flex items-center justify-between px-4 py-4">
        <img src="/logo-arcom-verde-escuro.svg" alt="ARCOM" className="h-14 w-auto" />
        <button
          type="button"
          className="rounded-md p-1 text-white/80 hover:text-white lg:hidden"
          onClick={() => setMenuAberto(false)}
          aria-label="Fechar menu"
        >
          <X className="size-6" />
        </button>
      </div>
      <div className="px-4 pb-4">
        <p className="text-lg font-black leading-tight text-white">Conta Certa</p>
        <p className="text-xs font-medium text-verde-lima">Compras e Eventos</p>
      </div>
      <div className="flex-1 overflow-y-auto pb-4">
        <Navegacao grupos={grupos} aoNavegar={() => setMenuAberto(false)} />
      </div>
      <div className="border-t border-white/10 px-4 py-3">
        <p className="truncate text-sm font-semibold text-white">{usuario?.nome}</p>
        <p className="text-xs text-white/60">{usuario?.papel === "compras" ? "Compras" : "Restaurante"}</p>
        <button
          type="button"
          onClick={() => logout.mutate()}
          className="mt-2 flex items-center gap-2 text-sm font-medium text-white/80 transition duration-fast hover:text-verde-lima"
        >
          <LogOut className="size-4" /> Sair
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-surface lg:flex">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 lg:block print:hidden">{lateral}</aside>
      {menuAberto ? (
        <div className="fixed inset-0 z-40 lg:hidden print:hidden">
          <button type="button" className="absolute inset-0 bg-verde-escuro/40" aria-label="Fechar menu" onClick={() => setMenuAberto(false)} />
          <aside className="relative h-full w-72">{lateral}</aside>
        </div>
      ) : null}
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-surface-border bg-white px-4 py-3 lg:hidden print:hidden">
          <button type="button" onClick={() => setMenuAberto(true)} aria-label="Abrir menu" className="text-verde-escuro">
            <Menu className="size-6" />
          </button>
          <p className="font-black text-verde-escuro">Conta Certa</p>
        </header>
        <main className="mx-auto max-w-[1600px] p-4 lg:p-6 print:max-w-none print:p-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

/** Cabeçalho padrão de tela. */
export function TituloTela({ titulo, descricao, acoes }: { titulo: string; descricao?: string; acoes?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-verde-arcom">Conta Certa</p>
        <h1 className="text-2xl font-bold text-verde-escuro lg:text-3xl">{titulo}</h1>
        {descricao ? <p className="mt-1 max-w-3xl text-sm text-arcom-gray">{descricao}</p> : null}
      </div>
      {acoes ? <div className="flex flex-wrap gap-2 print:hidden">{acoes}</div> : null}
    </div>
  );
}
