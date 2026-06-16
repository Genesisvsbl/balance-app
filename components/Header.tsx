"use client";

import TopNav from "./TopNav";

type Props = {
  title: string;
  active: string;
  setActive: (value: string) => void;
  onLogout: () => void;
  userName: string;
};

export default function Header({
  title,
  active,
  setActive,
  onLogout,
  userName,
}: Props) {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
      <div className="flex h-16 items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <img
            src="/LOGO.png"
            alt="Bavaria"
            className="h-9 w-28 object-contain"
          />

          <div className="h-8 w-px bg-slate-200" />

          <div>
            <h1 className="text-base font-black tracking-tight text-slate-950">
              BALANCE
            </h1>
            <p className="text-xs font-semibold text-slate-500">
              Planeación de materiales
            </p>
          </div>
        </div>

        <TopNav active={active} setActive={setActive} />

        <div className="flex items-center gap-3">
          <div className="max-w-[160px] truncate rounded-lg border border-[#d4a017]/30 bg-[#fff8df] px-3 py-2 text-xs font-black text-[#9a6a00]">
            {userName}
          </div>

          <button
            onClick={onLogout}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            Cerrar sesión
          </button>
        </div>
      </div>

      <div className="border-t border-slate-100 bg-[#fbfbfa] px-6 py-3">
        <h2 className="text-lg font-black text-slate-950">{title}</h2>
      </div>
    </header>
  );
}
