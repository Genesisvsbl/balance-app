"use client";

type Props = {
  active: string;
  setActive: (value: string) => void;
};

const modules = [
  { id: "importacion", label: "Bases" },
  { id: "balance", label: "Balance" },
  { id: "dashboard", label: "Dashboard" },
  { id: "variacion", label: "Variaciones" },
  { id: "historico", label: "Histórico" },
];

export default function TopNav({ active, setActive }: Props) {
  return (
    <div className="flex items-center gap-8 border-b border-slate-200">
      {modules.map((m) => (
        <button
          key={m.id}
          onClick={() => setActive(m.id)}
          className={`pb-3 text-sm font-semibold transition ${
            active === m.id
              ? "border-b-2 border-[#e30613] text-[#e30613]"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
