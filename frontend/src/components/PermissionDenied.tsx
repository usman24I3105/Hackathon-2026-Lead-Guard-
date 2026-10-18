import { EmptyState } from "./Primitives";

export function PermissionDenied({ permission }: { permission: string }) {
  return (
    <div className="p-6">
      <EmptyState
        title="You don't have access to this page."
        body={`You need the "${permission}" permission. Ask an owner or manager to grant it if you need it.`}
      />
    </div>
  );
}
