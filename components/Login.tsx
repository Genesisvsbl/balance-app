"use client";

import { useState } from "react";

type Props = {
  onLogin: () => void;
};

export default function Login({ onLogin }: Props) {
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function acceder() {
    if (usuario === "admin" && password === "balance2026") {
      setError("");
      onLogin();
      return;
    }

    setError("Usuario o contraseña incorrectos.");
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-white text-slate-900">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-white" />

        <div className="absolute left-[-80px] top-[120px] h-[260px] w-[520px] rotate-[-12deg] opacity-[0.08]">
          <div className="h-full w-full bg-[repeating-linear-gradient(0deg,#d4a017_0px,#d4a017_1px,transparent_1px,transparent_18px)]" />
        </div>

        <div className="absolute right-[340px] top-[130px] h-[150px] w-[360px] rotate-[-45deg] opacity-[0.10]">
          <div className="h-full w-full bg-[repeating-linear-gradient(90deg,#d4a017_0px,#d4a017_1px,transparent_1px,transparent_22px)]" />
        </div>

        <div className="absolute bottom-[90px] right-[-40px] h-[220px] w-[480px] rotate-[-12deg] opacity-[0.055]">
          <div className="h-full w-full bg-[repeating-linear-gradient(0deg,#e30613_0px,#e30613_1px,transparent_1px,transparent_18px)]" />
        </div>

        <div className="absolute bottom-[120px] left-[80px] h-[120px] w-[300px] rotate-[-45deg] opacity-[0.07]">
          <div className="h-full w-full bg-[repeating-linear-gradient(90deg,#e30613_0px,#e30613_1px,transparent_1px,transparent_24px)]" />
        </div>

        <div className="absolute bottom-0 left-0 h-[32%] w-full bg-gradient-to-t from-[#f8fafc] to-transparent" />
        <div className="absolute bottom-16 left-12 right-12 h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
      </div>

      <header className="relative z-10 flex h-24 items-center justify-between border-b border-slate-200 bg-white px-12">
        <div className="flex items-center gap-5">
          <img
            src="/LOGO.png"
            alt="Bavaria"
            className="h-12 object-contain"
          />

          <div className="h-12 w-px bg-slate-200" />

          <div>
            <h1 className="text-2xl font-black text-slate-950">BALANCE</h1>
            <p className="text-sm font-semibold text-slate-500">
              Planeación de materiales
            </p>
          </div>
        </div>

        <span className="rounded-full border border-[#e30613]/25 bg-[#e30613]/5 px-5 py-2 text-sm font-bold text-[#e30613]">
          Acceso seguro
        </span>
      </header>

      <section className="relative z-10 flex min-h-[calc(100vh-96px)] items-center justify-end px-20">
        <div className="w-full max-w-md rounded-[24px] border border-slate-200 bg-white shadow-[0_25px_70px_rgba(0,0,0,0.12)]">
          <div className="flex flex-col items-center border-b border-slate-100 px-8 py-8 text-center">
            <img
              src="/LOGO.png"
              alt="Bavaria"
              className="h-16 object-contain"
            />

            <h2 className="mt-5 text-3xl font-black text-slate-950">
              Iniciar sesión
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Acceda al sistema de planeación
            </p>
          </div>

          <div className="px-8 py-8">
            <label className="text-xs font-bold uppercase text-slate-500">
              Usuario
            </label>

            <input
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-[#e30613] focus:ring-2 focus:ring-[#e30613]/10"
              placeholder="Ingrese su usuario"
            />

            <label className="mt-5 block text-xs font-bold uppercase text-slate-500">
              Contraseña
            </label>

            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-[#e30613] focus:ring-2 focus:ring-[#e30613]/10"
              placeholder="Ingrese su contraseña"
              onKeyDown={(e) => {
                if (e.key === "Enter") acceder();
              }}
            />

            {error && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-[#e30613]">
                {error}
              </div>
            )}

            <button
              onClick={acceder}
              className="mt-6 w-full rounded-xl bg-[#e30613] py-4 text-sm font-bold text-white shadow-md transition hover:bg-[#b8000f]"
            >
              ACCEDER
            </button>

            <div className="mt-6 rounded-xl border border-[#d4a017]/30 bg-[#fff8df] px-4 py-3 text-center text-xs font-semibold text-slate-600">
              Usuario: admin · Contraseña: balance2026
            </div>
          </div>

          <div className="border-t border-slate-100 bg-slate-50 px-8 py-4 text-center text-xs font-medium text-slate-400">
            BALANCE © 2026
          </div>
        </div>
      </section>

      <footer className="absolute bottom-5 left-0 right-0 text-center text-xs text-slate-400">
        Versión 1.0.0 · Sistema profesional de planeación de materiales
      </footer>
    </main>
  );
}