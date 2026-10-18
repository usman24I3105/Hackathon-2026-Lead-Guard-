export function LevelPips({ level }: { level: 1 | 2 | 3 }) {
  return (
    <div className="flex items-center gap-1" aria-label={`Escalation level ${level} of 3`}>
      {[1, 2, 3].map((n) => (
        <span
          key={n}
          aria-hidden
          className="block rounded-full"
          style={{
            width: 7,
            height: 7,
            background: n <= level ? "var(--alarm)" : "var(--line)",
          }}
        />
      ))}
    </div>
  );
}
