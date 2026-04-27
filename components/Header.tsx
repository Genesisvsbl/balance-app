"use client";

import TopNav from "./TopNav";

type Props = {
  title: string;
  active: string;
  setActive: (value: string) => void;
  onLogout: () => void;
};

export default function Header({ title, active, setActive, onLogout }: Props) {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
      <div className="flex h-20 items-center justify-between px-8">
        <div className="flex items-center gap-5">
          <img
            src="/LOGO.png"
            alt="Bavaria"
            className="h-11 w-32 object-contain"
          />

          <div className="h-10 w-px bg-slate-200" />

          <div>
            <h1 className="text-xl font-black tracking-tight text-slate-950">
              BALANCE
            </h1>
            <p className="text-xs font-semibold text-slate-500">
              Planeación de materiales
            </p>
          </div>
        </div>

        <TopNav active={active} setActive={setActive} />

        <button
          onClick={onLogout}
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
        >
          Cerrar sesión
        </button>
      </div>

      <div className="border-t border-slate-100 bg-[#fbfbfa] px-8 py-4">
        <h2 className="text-2xl font-black text-slate-950">{title}</h2>
      </div>
    </header>
  );
}