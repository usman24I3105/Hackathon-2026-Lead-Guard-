import { useState } from "react";
import { store, useStoreState } from "../../state/useStore";
import { useToast } from "../../state/ToastContext";
import { Skeleton } from "../../components/Primitives";
import { OpportunityCard } from "./OpportunityCard";
import { FillFieldModal } from "./FillFieldModal";

export default function Pipeline() {
  const { stages, opportunities } = useStoreState();
  const { push } = useToast();
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<{ oppId: string; stageId: string; missing: string[] } | null>(null);
  const [loading] = useState(false);

  function attemptMove(oppId: string, stageId: string) {
    const result = store.moveOpportunity(oppId, stageId);
    if (result.ok) {
      push("Moved to new stage.");
      return;
    }
    const stage = stages.find((s) => s.id === stageId);
    push(`Fill in ${result.missing.join(", ")} before moving to ${stage?.name}`, "error");
    setBlocked({ oppId, stageId, missing: result.missing });
  }

  if (loading) {
    return (
      <div className="p-6 flex gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-96 w-64" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold">Pipeline</h1>
        <p className="text-sm text-ink-2">Drag a card, or use "Move to…" with the keyboard.</p>
      </header>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {stages.map((stage) => {
          const items = opportunities.filter((o) => o.stageId === stage.id);
          return (
            <div
              key={stage.id}
              className={`w-72 shrink-0 flex flex-col rounded-[10px] border ${dragOverStage === stage.id ? "border-focus bg-focus/5" : "border-line bg-paper/40"}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverStage(stage.id);
              }}
              onDragLeave={() => setDragOverStage(null)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverStage(null);
                const oppId = e.dataTransfer.getData("text/opp-id");
                if (oppId) attemptMove(oppId, stage.id);
              }}
            >
              <div className="px-3 py-3 border-b border-line flex items-center justify-between">
                <span className="font-medium text-sm">{stage.name}</span>
                <span className="text-xs text-ink-2 bg-surface rounded-full px-2 py-0.5 border border-line">{items.length}</span>
              </div>
              <div className="flex-1 flex flex-col gap-2 p-2 min-h-[200px]">
                {items.length === 0 ? (
                  <p className="text-xs text-ink-2 text-center py-8">No opportunities yet. Add a lead to start.</p>
                ) : (
                  items.map((opp) => (
                    <OpportunityCard
                      key={opp.id}
                      opp={opp}
                      stages={stages}
                      draggable
                      onMove={(stageId) => attemptMove(opp.id, stageId)}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {blocked && (
        <FillFieldModal
          oppId={blocked.oppId}
          stageId={blocked.stageId}
          missing={blocked.missing}
          onClose={() => setBlocked(null)}
        />
      )}
    </div>
  );
}
