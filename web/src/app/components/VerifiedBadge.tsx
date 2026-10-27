import React from 'react';

export interface VerifiedBadgeProps {
  status?: 'INTACT' | 'TAMPER_DETECTED' | 'NOT_ANCHORED';
  polygonScanUrl?: string | null;
  blockNumber?: number | null;
  size?: 'sm' | 'md';
}

export const VerifiedBadge: React.FC<VerifiedBadgeProps> = ({
  status = 'INTACT',
  polygonScanUrl,
  blockNumber,
  size = 'md',
}) => {
  const isVerified = status === 'INTACT';
  const isTampered = status === 'TAMPER_DETECTED';

  const badgeContent = (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-full transition-all ${
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'
      } ${
        isVerified
          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20'
          : isTampered
          ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30 hover:bg-rose-500/20 animate-pulse'
          : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
      }`}
    >
      <span
        className={`w-2 h-2 rounded-full ${
          isVerified ? 'bg-emerald-400' : isTampered ? 'bg-rose-500' : 'bg-zinc-500'
        }`}
      />
      {isVerified && 'Verified on Polygon'}
      {isTampered && 'Tamper Detected!'}
      {!isVerified && !isTampered && 'Pending Blockchain Anchor'}

      {polygonScanUrl && (
        <svg
          className="w-3.5 h-3.5 ml-0.5 opacity-70 hover:opacity-100"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
          />
        </svg>
      )}
    </span>
  );

  if (polygonScanUrl) {
    return (
      <a
        href={polygonScanUrl}
        target="_blank"
        rel="noopener noreferrer"
        title={blockNumber ? `Anchored at Polygon Block #${blockNumber}` : 'View on Polygonscan'}
      >
        {badgeContent}
      </a>
    );
  }

  return badgeContent;
};

export default VerifiedBadge;
