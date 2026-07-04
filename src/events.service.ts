import { Injectable } from '@nestjs/common';
import { Observable, Subject, merge, interval, filter } from 'rxjs';
import { map } from 'rxjs/operators';

export interface DataChangedEvent {
  type: 'change' | 'heartbeat' | 'notification';
  // For 'change' events (cache invalidation, broadcast to everyone):
  resource?: string;
  module?: string;
  action?: string;
  actor?: string;
  actorRole?: string;
  // For 'notification' events (personal, targeted to one user):
  userId?: string;
  id?: string;
  title?: string;
  body?: string;
  eventType?: string;
  data?: unknown;
  createdAt?: string;
}

export type EmitPayload = {
  resource: string;
  module?: string;
  action?: string;
  actor?: string;
  actorRole?: string;
};

export type NotifyPayload = {
  userId: string;
  id: string;
  title: string;
  body: string;
  eventType: string;
  data?: unknown;
  createdAt: string;
};

@Injectable()
export class EventsService {
  // Global broadcast: every connected client receives these (used for cache
  // invalidation — "some Client/Job/License changed, refetch your queries").
  private readonly broadcast = new Subject<DataChangedEvent>();

  // Personal channel: notifications targeted at a single user. Tagged with
  // userId and filtered per subscriber so a user only sees their own.
  private readonly personal = new Subject<DataChangedEvent>();

  /** Broadcast a generic data-change event to all subscribers. */
  emit(payload: EmitPayload) {
    this.broadcast.next({ type: 'change', ...payload });
  }

  /** Push a personal notification event to one user's live stream. */
  emitToUser(payload: NotifyPayload) {
    this.personal.next({ type: 'notification', ...payload });
  }

  /**
   * SSE stream for one connected client. Merges:
   *  - the global broadcast (cache-invalidation events),
   *  - this user's personal notifications, and
   *  - a heartbeat to keep the connection alive through proxies.
   */
  stream(userId?: string): Observable<MessageEvent> {
    return merge(
      this.broadcast.asObservable().pipe(
        map((event) => ({ data: event }) as MessageEvent),
      ),
      this.personal.asObservable().pipe(
        filter((event) => !!userId && event.userId === userId),
        map((event) => ({ data: event }) as MessageEvent),
      ),
      interval(25000).pipe(
        map(() => ({ data: { type: 'heartbeat' } }) as MessageEvent),
      ),
    );
  }
}
