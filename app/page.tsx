"use client";

import { useState } from "react";
import Login from "@/components/Login";
import Header from "@/components/Header";
import ModuleContainer from "@/components/ModuleContainer";
import ImportModule from "@/components/ImportModule";
import BalanceModule from "@/components/BalanceModule";
import DashboardModule from "@/components/DashboardModule";
import HistoricoModule from "@/components/HistoricoModule";
import VariacionModule from "@/components/VariacionModule";
import { BalanceInfo, BalanceRow, ExcelData, SavedLoad } from "@/types/balance";

export default function Home() {
  const [logged, setLogged] = useState(false);
  const [activeModule, setActiveModule] = useState("dashboard");

  const [datos, setDatos] = useState<ExcelData>({});
  const [hojasEncontradas, setHojasEncontradas] = useState<string[]>([]);
  const [hojaActiva, setHojaActiva] = useState<string>("");
  const [archivoNombre, setArchivoNombre] = useState<string>("");

  const [analisis, setAnalisis] = useState<BalanceRow[]>([]);
  const [infoAnalisis, setInfoAnalisis] = useState<BalanceInfo | null>(null);

  function cargarBalanceHistorico(carga: SavedLoad) {
    setAnalisis(carga.analisis);
    setInfoAnalisis(carga.info);
    setArchivoNombre(carga.archivo);
    setActiveModule("dashboard");
  }

  if (!logged) {
    return <Login onLogin={() => setLogged(true)} />;
  }

  const titles: Record<string, string> = {
    dashboard: "Dashboard",
    importacion: "Importación / Bases",
    balance: "Balance de materiales",
    variacion: "Variaciones",
    historico: "Histórico",
  };

  return (
    <main className="min-h-screen bg-[#f8f8f6] text-slate-900">
      <Header
        title={titles[activeModule] || "BALANCE"}
        active={activeModule}
        setActive={setActiveModule}
        onLogout={() => setLogged(false)}
      />

      <ModuleContainer>
        {activeModule === "dashboard" && (
          <DashboardModule analisis={analisis} infoAnalisis={infoAnalisis} />
        )}

        {activeModule === "importacion" && (
          <ImportModule
            datos={datos}
            setDatos={setDatos}
            hojasEncontradas={hojasEncontradas}
            setHojasEncontradas={setHojasEncontradas}
            hojaActiva={hojaActiva}
            setHojaActiva={setHojaActiva}
            setArchivoNombre={setArchivoNombre}
          />
        )}

        {activeModule === "balance" && (
          <BalanceModule
            datos={datos}
            archivoNombre={archivoNombre}
            analisis={analisis}
            setAnalisis={setAnalisis}
            infoAnalisis={infoAnalisis}
            setInfoAnalisis={setInfoAnalisis}
          />
        )}

        {activeModule === "variacion" && <VariacionModule />}

        {activeModule === "historico" && (
          <HistoricoModule onLoad={cargarBalanceHistorico} />
        )}
      </ModuleContainer>
    </main>
  );
}