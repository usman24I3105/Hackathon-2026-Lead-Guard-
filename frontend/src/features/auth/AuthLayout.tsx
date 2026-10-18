import type { ReactNode } from "react";

export function AuthLayout({ children, title, subtitle }: { children: ReactNode; title: string; subtitle: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-paper px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="font-display text-3xl mb-1">LeadGuard</div>
          <p className="text-sm text-ink-2">Every lead gets a reply. Every time.</p>
        </div>
        <div className="bg-surface border border-line rounded-[10px] p-6 sm:p-8">
          <h1 className="text-xl font-semibold mb-1">{title}</h1>
          <p className="text-sm text-ink-2 mb-6">{subtitle}</p>
          {children}
        </div>
      </div>
    </div>
  );
}
