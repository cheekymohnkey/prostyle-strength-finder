import React from 'react';
import { GlobalToolbar } from './GlobalToolbar';

interface StudioLayoutProps {
  children?: React.ReactNode;
  headerContent?: React.ReactNode;
}

export function StudioLayout({ children, headerContent }: StudioLayoutProps) {
  return (
    <div className="flex h-screen flex-col bg-[var(--app-bg)] max-h-screen overflow-hidden">
      {/* Top Bar - Fixed Height */}
      <div className="flex-none z-10 shadow-sm relative bg-white border-b border-gray-200">
        {headerContent}
      </div>

      {/* Main Workspace - Fills remaining height */}
      <div className="flex flex-1 overflow-hidden">
        {children}
      </div>
    </div>
  );
}
