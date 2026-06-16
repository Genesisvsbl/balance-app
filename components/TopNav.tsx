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
    <div className="flex items-center gap-4">
      {modules.map((m) => (
        <button
          key={m.id}
          onClick={() => setActive(m.id)}
          className={`rounded-lg px-2.5 py-2 text-xs font-black transition ${
            active === m.id
              ? "bg-red-50 text-[#e30613]"
              : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
          }`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
