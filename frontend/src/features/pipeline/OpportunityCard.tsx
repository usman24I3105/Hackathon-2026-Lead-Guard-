import { useState } from "react";
import { useStoreState } from "../../state/useStore";
import { maskedMoney } from "../../lib/format";
import { has } from "../../lib/perm";
import { useAuth } from "../../state/AuthContext";
import type { Opportunity, StageDef } from "../../mock/types";

export function OpportunityCard({
  opp,
  stages,
  onMove,
  draggable,
}: {
  opp: Opportunity;
  stages: StageDef[];
  onMove: (stageId: string) => void;
  draggable: boolean;
}) {
  const { contacts } = useStoreState();
  const { session } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const contact = contacts.find((c) => c.id === opp.contactId);
  const canSeeValue = !session || has({ role: session.role }, "pipeline.manage") || has({ role: session.role }, "dashboard.full");

  return (
    <div
      draggable={draggable}
      onDragStart={(e) => e.dataTransfer.setData("text/opp-id", opp.id)}
      className="bg-surface border border-line rounded-card p-3 flex flex-col gap-1.5 shadow-sm cursor-grab active:cursor-grabbing"
    >
      <div className="text-sm font-medium leading-snug">{opp.title}</div>
      <div className="text-xs text-ink-2">{contact?.name}</div>
      <div className="flex items-center justify-between mt-1">
        <span className="font-mono-tab text-sm">{maskedMoney(opp.valueCents, canSeeValue)}</span>
        <div className="relative">
          <button
            className="text-xs text-ink-2 underline underline-offset-2 hover:text-ink h-9 px-1"
            onClick={() => setMenuOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            Move to…
          </button>
          {menuOpen && (
            <ul role="menu" className="absolute right-0 bottom-full mb-1 bg-surface border border-line rounded-card shadow-lg py-1 w-40 z-10">
              {stages.filter((s) => s.id !== opp.stageId).map((s) => (
                <li key={s.id}>
                  <button
                    role="menuitem"
                    className="w-full text-left text-sm px-3 py-2 hover:bg-paper"
                    onClick={() => {
                      setMenuOpen(false);
                      onMove(s.id);
                    }}
                  >
                    {s.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
