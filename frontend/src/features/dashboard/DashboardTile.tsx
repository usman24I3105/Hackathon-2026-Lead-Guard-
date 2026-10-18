import { useState } from "react";
import { Card } from "../../components/Primitives";

export function DashboardTile({
  label,
  value,
  definition,
  onClick,
  masked,
}: {
  label: string;
  value: string;
  definition: string;
  onClick?: () => void;
  masked?: boolean;
}) {
  const [showDef, setShowDef] = useState(false);
  const Comp = onClick ? "button" : "div";

  return (
    <Card className="p-4 flex flex-col gap-1 text-left relative">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-ink-2 uppercase tracking-wide">{label}</span>
        <button
          aria-label={`What does ${label} mean?`}
          aria-expanded={showDef}
          onClick={() => setShowDef((s) => !s)}
          className="h-6 w-6 rounded-full border border-line text-ink-2 text-xs hover:text-ink shrink-0"
        >
          i
        </button>
      </div>
      <Comp
        onClick={onClick}
        className={`font-mono-tab text-2xl font-semibold text-left ${onClick ? "hover:text-focus cursor-pointer" : ""}`}
      >
        {masked ? "•••" : value}
      </Comp>
      {showDef && <p className="text-xs text-ink-2 mt-1">{definition}</p>}
    </Card>
  );
}
