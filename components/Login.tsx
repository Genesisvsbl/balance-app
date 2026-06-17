"use client";

import { useRef, useState } from "react";
import { publicPath } from "@/lib/site";
import { supabase } from "@/lib/supabase-browser";

type AppUser = {
  id: string;
  username: string;
  fullName: string;
  role: string;
};

type Props = {
  onLogin: (user: AppUser) => void;
};

export default function Login({ onLogin }: Props) {
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  async function acceder() {
    setLoading(true);
    setError("");

    try {
      const { data, error } = await supabase.rpc("login_app_user", {
        login_text: usuario,
        login_password: password,
      });

      if (error) {
        throw new Error(error.message || "Usuario o contrasena incorrectos.");
      }

      onLogin(data.user);
    } catch (error: any) {
      setError(error.message || "No se pudo iniciar sesion.");
    } finally {
      setLoading(false);
    }
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

      <header className="relative z-10 flex h-[72px] items-center justify-between border-b border-slate-200 bg-white px-8">
        <div className="flex items-center gap-4">
          <img
            src={publicPath("/LOGO.png")}
            alt="Bavaria"
            className="h-9 object-contain"
          />

          <div className="h-9 w-px bg-slate-200" />

          <div>
            <h1 className="text-xl font-black text-slate-950">BALANCE</h1>
            <p className="text-sm font-semibold text-slate-500">
              Planeacion de materiales
            </p>
          </div>
        </div>

        <span className="rounded-full border border-[#e30613]/25 bg-[#e30613]/5 px-4 py-1.5 text-xs font-bold text-[#e30613]">
          Acceso seguro
        </span>
      </header>

      <section className="relative z-10 flex min-h-[calc(100vh-72px)] items-center justify-end px-14">
        <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white shadow-[0_18px_50px_rgba(0,0,0,0.10)]">
          <div className="flex flex-col items-center border-b border-slate-100 px-6 py-6 text-center">
            <img
              src={publicPath("/LOGO.png")}
              alt="Bavaria"
              className="h-12 object-contain"
            />

            <h2 className="mt-4 text-2xl font-black text-slate-950">
              Iniciar sesion
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Acceda al sistema de planeacion
            </p>
          </div>

          <div className="px-6 py-6">
            <label className="text-xs font-bold uppercase text-slate-500">
              Usuario
            </label>

            <input
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  window.setTimeout(() => passwordRef.current?.focus(), 0);
                }

                if (e.key === "Enter") {
                  e.preventDefault();
                  window.setTimeout(() => passwordRef.current?.focus(), 0);
                }
              }}
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#e30613] focus:ring-2 focus:ring-[#e30613]/10"
              placeholder="Ingrese su usuario"
            />

            <label className="mt-4 block text-xs font-bold uppercase text-slate-500">
              Contrasena
            </label>

            <input
              ref={passwordRef}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#e30613] focus:ring-2 focus:ring-[#e30613]/10"
              placeholder="Ingrese su contrasena"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !loading) acceder();
              }}
            />

            {error && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-semibold text-[#e30613]">
                {error}
              </div>
            )}

            <button
              onClick={acceder}
              disabled={loading}
              className="mt-5 w-full rounded-lg bg-[#e30613] py-3 text-sm font-bold text-white shadow-md transition hover:bg-[#b8000f] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "VALIDANDO..." : "ACCEDER"}
            </button>
          </div>

          <div className="border-t border-slate-100 bg-slate-50 px-6 py-3 text-center text-xs font-medium text-slate-400">
            BALANCE (c) 2026
          </div>
        </div>
      </section>

      <footer className="absolute bottom-5 left-0 right-0 text-center text-xs text-slate-400">
        Version 1.0.0 - Sistema profesional de planeacion de materiales
      </footer>
    </main>
  );
}
