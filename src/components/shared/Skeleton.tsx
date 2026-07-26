import React from 'react';

interface SkeletonProps {
  /** Number of skeleton lines (default 1) */
  lines?: number;
  /** Width per line (e.g. '100%', '200px') */
  width?: string;
  /** Height per line (default 14px) */
  height?: string;
  /** Extra classes */
  className?: string;
  /** Render as a card/box skeleton (circle, text-block) */
  variant?: 'text' | 'card' | 'circle';
  /** Circle size (only when variant='circle') */
  size?: string;
}

/**
 * Skeleton loader — shimmer animation for loading states.
 * Use it to show placeholder content while data loads.
 */
export const Skeleton: React.FC<SkeletonProps> = ({
  lines = 1,
  width = '100%',
  height = '14px',
  className = '',
  variant = 'text',
  size = '40px',
}) => {
  if (variant === 'circle') {
    return (
      <div
        className={`animate-shimmer rounded-full bg-slate-200 dark:bg-[#27272a] ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  if (variant === 'card') {
    return (
      <div className={`bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-2xl p-4 space-y-3 ${className}`}>
        <div className="animate-shimmer w-1/3 h-3 rounded bg-slate-200 dark:bg-[#27272a]" />
        <div className="animate-shimmer w-2/3 h-6 rounded bg-slate-200 dark:bg-[#27272a]" />
        <div className="animate-shimmer w-1/4 h-3 rounded bg-slate-200 dark:bg-[#27272a]" />
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="animate-shimmer rounded bg-slate-200 dark:bg-[#27272a]"
          style={{
            width: i === lines - 1 && lines > 1 ? '60%' : width,
            height,
          }}
        />
      ))}
    </div>
  );
};

/**
 * Convenient table row skeleton for list loading states.
 */
export const TableSkeleton: React.FC<{ rows?: number; cols?: number }> = ({
  rows = 5,
  cols = 5,
}) => (
  <div className="divide-y divide-slate-100 dark:divide-[#27272a]">
    {Array.from({ length: rows }).map((_, r) => (
      <div key={r} className="flex items-center gap-4 px-4 py-3">
        {Array.from({ length: cols }).map((_, c) => (
          <div
            key={c}
            className="animate-shimmer h-4 rounded bg-slate-200 dark:bg-[#27272a] flex-1"
            style={{ maxWidth: c === 0 ? '120px' : `${60 + Math.random() * 40}px` }}
          />
        ))}
      </div>
    ))}
  </div>
);
