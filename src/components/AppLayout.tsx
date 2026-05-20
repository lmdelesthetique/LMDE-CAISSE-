'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

const Sidebar = dynamic(() => import('./Sidebar'), { ssr: false });

interface AppLayoutProps {
  children: React.ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  return (
    <div className="min-h-screen bg-background flex">
      {mounted && <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(p => !p)} />}
      <main
        className="flex-1 min-h-screen transition-all duration-300 ease-in-out"
        style={{ marginLeft: mounted ? (collapsed ? 64 : 240) : 0 }}
      >
        {children}
      </main>
    </div>
  );
}
