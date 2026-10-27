// Todas as rotas num arquivo só (ver padroes/02-frontend.md). Uma tela por
// arquivo em src/pages/, sempre carregada com lazy — cada rota vira o próprio
// chunk do build.
import { lazy, Suspense } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ErroDeTela } from "./core/ErroDeTela";
import { RotaProtegida, useSessao } from "./core/sessao";

const Login = lazy(() => import("./pages/Login"));
const Painel = lazy(() => import("./pages/Painel"));
const PedidosRestaurante = lazy(() => import("./pages/PedidosRestaurante"));
const CotacaoCarnes = lazy(() => import("./pages/CotacaoCarnes"));
const ComprasConsumo = lazy(() => import("./pages/ComprasConsumo"));
const OrdemCompra = lazy(() => import("./pages/OrdemCompra"));
const ResumoLancar = lazy(() => import("./pages/ResumoLancar"));
const ResumoDiario = lazy(() => import("./pages/ResumoDiario"));
const ResumoHistorico = lazy(() => import("./pages/ResumoHistorico"));
const Eventos = lazy(() => import("./pages/Eventos"));
const Fornecedores = lazy(() => import("./pages/Fornecedores"));
const Usuarios = lazy(() => import("./pages/Usuarios"));
const Backup = lazy(() => import("./pages/Backup"));
const NaoEncontrado = lazy(() => import("./pages/NaoEncontrado"));

function TelaDeCarregamento() {
  return null; // a barra de carregamento global já indica progresso
}

/** "/" abre o painel pra Compras e os pedidos pro time do restaurante. */
function Inicio() {
  const { usuario } = useSessao();
  return usuario?.papel === "restaurante" ? <PedidosRestaurante /> : <Painel />;
}

export function Rotas() {
  const location = useLocation();

  return (
    <ErroDeTela chave={location.pathname}>
      <Suspense fallback={<TelaDeCarregamento />}>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route element={<RotaProtegida />}>
            <Route element={<Layout />}>
              <Route path="/" element={<Inicio />} />
              <Route path="/pedidos-restaurante" element={<PedidosRestaurante />} />

              <Route element={<RotaProtegida papel="compras" />}>
                <Route path="/cotacao-carnes" element={<CotacaoCarnes />} />
                <Route path="/compras-consumo" element={<ComprasConsumo />} />
                <Route path="/resumo/lancar" element={<ResumoLancar />} />
                <Route path="/resumo/diario" element={<ResumoDiario />} />
                <Route path="/resumo/historico" element={<ResumoHistorico />} />
                <Route path="/eventos" element={<Eventos />} />
                <Route path="/fornecedores" element={<Fornecedores />} />
                <Route path="/usuarios" element={<Usuarios />} />
                <Route path="/backup" element={<Backup />} />
              </Route>
            </Route>

            {/* Ordem de compra fica fora do layout: é uma folha A4 pra imprimir/salvar em PDF. */}
            <Route element={<RotaProtegida papel="compras" />}>
              <Route path="/ordem-compra/:id/:fornecedorId" element={<OrdemCompra />} />
            </Route>
          </Route>

          <Route path="*" element={<NaoEncontrado />} />
        </Routes>
      </Suspense>
    </ErroDeTela>
  );
}
