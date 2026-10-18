import type { ReactNode } from "react";
import { useAuth } from "../state/AuthContext";
import { has, type Permission } from "../lib/perm";
import { PermissionDenied } from "./PermissionDenied";

/**
 * UX-only gate: hides a route the user can't use yet so they're not staring
 * at a wall of 403s. The server remains the actual authority — every
 * mutation still gets checked there regardless of what this renders.
 */
export function RequirePermission({ permission, children }: { permission: Permission; children: ReactNode }) {
  const { session } = useAuth();
  if (session && !has({ role: session.role }, permission)) {
    return <PermissionDenied permission={permission} />;
  }
  return <>{children}</>;
}
