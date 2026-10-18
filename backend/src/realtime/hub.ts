import type { Response } from 'express';
import { trackSseOpen, trackSseClose } from '../security/limits';
import logger from '../http/logger';

interface HubConnection {
  workspaceId: string;
  userId: string;
  res: Response;
}

/**
 * BE-5: SSE hub — per-workspace fan-out.
 * IDs-only payloads per contract §3.
 * Heartbeat every 15s.
 */
class SseHub {
  private connections = new Map<string, Set<HubConnection>>();

  add(conn: HubConnection): void {
    const { workspaceId } = conn;
    if (!this.connections.has(workspaceId)) {
      this.connections.set(workspaceId, new Set());
    }
    this.connections.get(workspaceId)!.add(conn);
    trackSseOpen(conn.userId, workspaceId);

    // Cleanup on close/error
    const cleanup = () => {
      this.remove(conn);
    };
    conn.res.on('close', cleanup);
    conn.res.on('error', cleanup);
  }

  remove(conn: HubConnection): void {
    const ws = this.connections.get(conn.workspaceId);
    if (ws) {
      ws.delete(conn);
      if (ws.size === 0) this.connections.delete(conn.workspaceId);
    }
    trackSseClose(conn.userId, conn.workspaceId);
  }

  emit(workspaceId: string, event: string, data: Record<string, unknown>): void {
    const ws = this.connections.get(workspaceId);
    if (!ws) return;
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const conn of ws) {
      try {
        conn.res.write(payload);
      } catch (err) {
        logger.warn({ err }, 'SSE write failed');
        this.remove(conn);
      }
    }
  }

  startHeartbeat(): void {
    setInterval(() => {
      for (const [, conns] of this.connections) {
        for (const conn of conns) {
          try {
            conn.res.write(':heartbeat\n\n');
          } catch {
            this.remove(conn);
          }
        }
      }
    }, 15000);
  }
}

export const hub = new SseHub();

// Start heartbeat on module load
hub.startHeartbeat();
