import fs from 'fs';
import path from 'path';
import logger from '../http/logger';

export interface SyncHistoryEntry {
  id: string;
  timestamp: string;
  direction: 'inbound' | 'outbound';
  provider: 'twilio' | 'stripe' | 'google' | 'slack' | 'telegram';
  eventType: string;
  status: 'ok' | 'failed' | 'duplicate';
  referenceId?: string;
  details?: Record<string, any>;
}

const SYNC_FILE_PATH = path.resolve(__dirname, '../../../sync_history.json');

export async function recordSyncEvent(entry: Omit<SyncHistoryEntry, 'id' | 'timestamp'>): Promise<SyncHistoryEntry> {
  const fullEntry: SyncHistoryEntry = {
    id: `sync_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    ...entry,
  };

  try {
    let existing: SyncHistoryEntry[] = [];
    if (fs.existsSync(SYNC_FILE_PATH)) {
      try {
        const content = fs.readFileSync(SYNC_FILE_PATH, 'utf-8');
        existing = JSON.parse(content);
        if (!Array.isArray(existing)) existing = [];
      } catch {
        existing = [];
      }
    }
    // Keep most recent 500 events
    existing.unshift(fullEntry);
    if (existing.length > 500) {
      existing = existing.slice(0, 500);
    }
    fs.writeFileSync(SYNC_FILE_PATH, JSON.stringify(existing, null, 2), 'utf-8');
  } catch (err: any) {
    logger.warn({ err: err.message }, 'Failed to write sync history to file');
  }

  return fullEntry;
}

export function getSyncHistory(limit = 100): SyncHistoryEntry[] {
  try {
    if (fs.existsSync(SYNC_FILE_PATH)) {
      const content = fs.readFileSync(SYNC_FILE_PATH, 'utf-8');
      const list = JSON.parse(content);
      if (Array.isArray(list)) {
        return list.slice(0, limit);
      }
    }
  } catch (err: any) {
    logger.warn({ err: err.message }, 'Failed to read sync history');
  }
  return [];
}
