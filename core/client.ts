import { hostname } from 'os';
import { AWClient } from 'aw-client';
import { Send } from './heartbeats';

export const PULSETIME_S = 80;

export interface Log {
    debug(message: string): void;
    warn(message: string): void;
}

// Sends heartbeats to the bucket `<clientName>_<hostname>`, created on the first one
export function awSender(clientName: string, eventType: string, log: Log): Send {
    const client = new AWClient(clientName);
    const bucketId = `${clientName}_${hostname()}`;
    let bucketReady = false;
    return async (data, timestamp) => {
        try {
            if (!bucketReady) {
                await client.ensureBucket(bucketId, eventType, hostname());
                bucketReady = true;
            }
            await client.heartbeat(bucketId, PULSETIME_S, { timestamp, duration: 0, data });
            log.debug(`heartbeat ${timestamp.toISOString()} ${JSON.stringify(data)}`);
        } catch (err) {
            // The server may be down or restarted (bucket gone): retry everything next time
            bucketReady = false;
            log.warn(`heartbeat failed: ${err instanceof Error ? err.message : String(err)}`);
        }
    };
}
