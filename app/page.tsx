"use client";

import { useEffect, useState } from "react";
import Login from "@/components/Login";
import Header from "@/components/Header";
import ModuleContainer from "@/components/ModuleContainer";
import ImportModule from "@/components/ImportModule";
import BalanceModule from "@/components/BalanceModule";
import Balance2Module from "@/components/Balance2Module";
import DashboardModule from "@/components/DashboardModule";
import HistoricoModule from "@/components/HistoricoModule";
import VariacionModule from "@/components/VariacionModule";
import { BalanceInfo, BalanceRow, ExcelData, SavedLoad } from "@/types/balance";

export type AppUser = {
  id: string;
  username: string;
  fullName: string;
  role: string;
};

export default function Home() {
  const [logged, setLogged] = useState(false);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [activeModule, setActiveModule] = useState("importacion");

  const [datos, setDatos] = useState<ExcelData>({});
  const [hojasEncontradas, setHojasEncontradas] = useState<string[]>([]);
  const [hojaActiva, setHojaActiva] = useState<string>("");
  const [archivoNombre, setArchivoNombre] = useState<string>("");

  const [analisis, setAnalisis] = useState<BalanceRow[]>([]);
  const [infoAnalisis, setInfoAnalisis] = useState<BalanceInfo | null>(null);

  useEffect(() => {
    const savedUser = sessionStorage.getItem("balance_user");
    if (!savedUser) return;

    try {
      const user = JSON.parse(savedUser) as AppUser;
      setCurrentUser(user);
      setLogged(true);
    } catch {
      sessionStorage.removeItem("balance_user");
    }
  }, []);

  function iniciarSesion(user: AppUser) {
    setCurrentUser(user);
    setLogged(true);
    sessionStorage.setItem("balance_user", JSON.stringify(user));
  }

  function cerrarSesion() {
    setCurrentUser(null);
    setLogged(false);
    sessionStorage.removeItem("balance_user");
  }

  function hidratarAnalisisHistorico(carga: SavedLoad) {
    const stockPiPorCodigo = carga.info?.stockPiPorCodigo || {};

    return (carga.analisis || []).map((row) => {
      const stockPi = stockPiPorCodigo[row.codigo];
      if (!stockPi) return row;

      return {
        ...row,
        stockMin: row.stockMin ?? stockPi.stockMin ?? null,
        stockMed: row.stockMed ?? stockPi.stockMed ?? null,
        stockMax: row.stockMax ?? stockPi.stockMax ?? null,
      };
    });
  }

  function cargarBalanceHistorico(carga: SavedLoad) {
    setDatos(carga.datos || {});
    setHojasEncontradas(carga.hojas || []);
    setHojaActiva(carga.hojas?.[0] || "");
    setAnalisis(hidratarAnalisisHistorico(carga));
    setInfoAnalisis(carga.info || null);
    setArchivoNombre(carga.archivo || "Balance historico");
    setActiveModule("balance");
  }

  if (!logged || !currentUser) {
    return <Login onLogin={iniciarSesion} />;
  }

  const titles: Record<string, string> = {
    dashboard: "Dashboard",
    importacion: "Importacion / Bases",
    balance: "Balance de materiales",
    balance2: "Balance 2",
    variacion: "Variaciones",
    historico: "Historico",
  };

  return (
    <main className="min-h-screen bg-[#f8f8f6] text-slate-900">
      <Header
        title={titles[activeModule] || "BALANCE"}
        active={activeModule}
        setActive={setActiveModule}
        onLogout={cerrarSesion}
        userName={currentUser.fullName}
      />

      <ModuleContainer>
        {activeModule === "dashboard" && (
          <DashboardModule
            datos={datos}
            analisis={analisis}
            infoAnalisis={infoAnalisis}
          />
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
            currentUser={currentUser}
          />
        )}

        {activeModule === "balance2" && (
          <Balance2Module
            datos={datos}
            analisis={analisis}
            infoAnalisis={infoAnalisis}
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

