import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from './auth-store';
import { useNotificationStore } from './notification-store';

const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

export function useServerEvents() {
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    if (!accessToken) return;

    const url = `${BASE_URL}/events?token=${encodeURIComponent(accessToken)}`;
    const es = new EventSource(url);

    es.onmessage = (e: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(e.data) as {
          type: string;
          resource?: string;
          module?: string;
          action?: string;
          actor?: string;
          actorRole?: string;
        };
        if (payload.type === 'heartbeat') return;

        // Personal notification targeted at this user → refresh the bell feed.
        if (payload.type === 'notification') {
          void queryClient.invalidateQueries({ queryKey: ['notifications'] });
          return;
        }

        // Generic data-change broadcast → refresh all data + activity feed.
        void queryClient.invalidateQueries();
        useNotificationStore.getState().addEvent({
          resource: payload.resource ?? payload.type,
          module: payload.module,
          action: payload.action,
          actor: payload.actor,
          actorRole: payload.actorRole,
        });
      } catch {
        // ignore malformed events
      }
    };

    es.onerror = () => {
      es.close();
    };

    return () => {
      es.close();
    };
  }, [accessToken, queryClient]);
}
