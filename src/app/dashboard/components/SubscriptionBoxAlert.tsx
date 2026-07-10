'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function SubscriptionBoxAlert() {
  const [count, setCount] = useState(0);
  const currentMonth = new Date().toISOString().slice(0, 7);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { count: c } = await supabase
      .from('subscription_orders')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'confirmed')
      .eq('order_month', currentMonth);
    setCount(c ?? 0);
  }, [currentMonth]);

  useEffect(() => {
    load();
    const supabase = createClient();
    const channel = supabase
      .channel('dashboard-box-alerts')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'subscription_orders' }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  if (count === 0) return null;

  return (
    <a href="/abonnements" className="block">
      <div className="relative flex items-center gap-3 bg-pink-600 text-white px-5 py-3.5 rounded-2xl shadow-lg overflow-hidden animate-pulse hover:animate-none hover:bg-pink-700 transition-colors cursor-pointer">
        <span className="absolute inset-0 bg-gradient-to-r from-pink-500/30 to-fuchsia-500/30 rounded-2xl" />
        <span className="relative text-2xl">💅</span>
        <div className="relative flex-1 min-w-0">
          <p className="font-black text-base leading-tight">
            {count} box client{count > 1 ? 's' : ''} confirmée{count > 1 ? 's' : ''} — en attente de traitement
          </p>
          <p className="text-pink-200 text-xs mt-0.5">Cliquez pour traiter les commandes</p>
        </div>
        <span className="relative shrink-0">
          <span className="flex w-3 h-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-white" />
          </span>
        </span>
      </div>
    </a>
  );
}
