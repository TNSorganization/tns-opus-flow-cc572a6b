import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Subscribe to postgres_changes on one or more tables and invalidate the
 * given TanStack Query keys whenever anything changes. Channel is torn down
 * on unmount.
 */
export function useRealtimeInvalidate(
  channelName: string,
  tables: string[],
  queryKeys: (string | number)[][],
) {
  const qc = useQueryClient();
  useEffect(() => {
    let ch = supabase.channel(channelName);
    for (const table of tables) {
      ch = ch.on("postgres_changes", { event: "*", schema: "public", table }, () => {
        for (const key of queryKeys) qc.invalidateQueries({ queryKey: key });
      });
    }
    ch.subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName, qc]);
}
