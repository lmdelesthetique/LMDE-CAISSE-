'use client';

import { useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

type SyncTable = 'products' | 'receipts' | 'stock_movements';

interface UseRealtimeSyncOptions {
  /** Tables to subscribe to */
  tables: SyncTable[];
  /** Called whenever any subscribed table changes */
  onRefresh: () => void;
  /** Debounce delay in ms (default: 400) */
  debounceMs?: number;
}

/**
 * Subscribes to Supabase Realtime changes on the given tables and calls
 * `onRefresh` (debounced) whenever an INSERT / UPDATE / DELETE occurs.
 *
 * Usage:
 *   useRealtimeSync({ tables: ['products', 'receipts'], onRefresh: loadData });
 */
export function useRealtimeSync({
  tables,
  onRefresh,
  debounceMs = 400,
}: UseRealtimeSyncOptions) {
  const channelsRef = useRef<RealtimeChannel[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onRefreshRef = useRef(onRefresh);

  // Keep the callback ref up-to-date without re-subscribing
  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  const debouncedRefresh = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onRefreshRef.current();
    }, debounceMs);
  }, [debounceMs]);

  useEffect(() => {
    const supabase = createClient();

    // Clean up any previous channels
    channelsRef.current.forEach((ch) => supabase.removeChannel(ch));
    channelsRef.current = [];

    tables.forEach((table) => {
      const channel = supabase
        .channel(`realtime:${table}:${Math.random().toString(36).slice(2)}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table },
          () => debouncedRefresh()
        )
        .subscribe();

      channelsRef.current.push(channel);
    });

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      channelsRef.current.forEach((ch) => supabase.removeChannel(ch));
      channelsRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables.join(','), debouncedRefresh]);
}
