import React from 'react';
import { Card, RANK_NAMES, SUIT_NAMES } from '../types/game';

interface CardViewProps {
  card?: Card;
  faceDown?: boolean;
  isLegal?: boolean;
  isSelected?: boolean;
  isPlayable?: boolean;
  isTrump?: boolean;
  onClick?: () => void;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const CardView: React.FC<CardViewProps> = ({
  card,
  faceDown = false,
  isLegal = true,
  isSelected = false,
  isPlayable = false,
  isTrump = false,
  onClick,
  className = '',
  size = 'md',
}) => {
  const sizeClasses = {
    sm: 'w-10 h-14 sm:w-11 sm:h-16 text-xs rounded-lg',
    md: 'w-13 h-19 sm:w-16 sm:h-23 md:w-18 md:h-26 text-sm rounded-xl',
    lg: 'w-14 h-20 sm:w-17 sm:h-24 md:w-20 md:h-28 lg:w-24 lg:h-34 text-base rounded-xl sm:rounded-2xl',
  };

  if (faceDown || !card) {
    return (
      <div
        className={`relative shadow-md border border-slate-300/40 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 flex items-center justify-center select-none overflow-hidden ${sizeClasses[size]} ${className}`}
      >
        <div className="absolute inset-1 border border-amber-400/35 rounded-md sm:rounded-lg flex items-center justify-center bg-slate-900/70">
          <div className="w-full h-full opacity-20 bg-[radial-gradient(#f59e0b_1.2px,transparent_1.2px)] [background-size:6px_6px]" />
          <span className="absolute text-amber-400/70 font-sans font-black text-xs sm:text-sm">♠</span>
        </div>
      </div>
    );
  }

  const suitMeta = SUIT_NAMES[card.suit];
  const rankDisplay = RANK_NAMES[card.rank];

  const isRedSuit = card.suit === 'H' || card.suit === 'D';
  const suitColorClass = isRedSuit ? 'text-[#C81E2B]' : 'text-[#111827]';

  const cursorClass =
    isPlayable && isLegal
      ? 'cursor-pointer hover:-translate-y-4 sm:hover:-translate-y-5 hover:scale-[1.05] active:scale-95 active:translate-y-0 hover:shadow-2xl hover:shadow-amber-500/35 transition-all duration-200 ease-out z-30'
      : 'cursor-default transition-all duration-200 ease-out';

  const dimClass = !isLegal && isPlayable ? 'opacity-40 grayscale-[40%] contrast-75 scale-[0.98]' : '';
  const selectedClass = isSelected
    ? 'ring-4 ring-amber-400 -translate-y-4 sm:-translate-y-5 shadow-2xl scale-[1.05] z-30'
    : '';
  const playableRing =
    isPlayable && isLegal
      ? 'ring-2 ring-emerald-400/90 hover:ring-2 hover:ring-amber-400 animate-playable-glow'
      : '';
  const trumpBorder = isTrump
    ? 'border-amber-400 ring-2 ring-amber-400/75 shadow-[0_0_12px_rgba(245,158,11,0.3)]'
    : 'border-slate-300';

  const topRankSize =
    size === 'sm'
      ? 'text-sm sm:text-base'
      : size === 'md'
      ? 'text-base sm:text-xl md:text-2xl'
      : 'text-lg sm:text-2xl md:text-3xl';

  const topPipSize =
    size === 'sm'
      ? 'text-[10px] sm:text-xs'
      : size === 'md'
      ? 'text-xs sm:text-sm md:text-base'
      : 'text-sm sm:text-base md:text-lg';

  const mainPipSize =
    size === 'sm'
      ? 'text-2xl sm:text-3xl'
      : size === 'md'
      ? 'text-3xl sm:text-4xl md:text-5xl'
      : 'text-3xl sm:text-5xl md:text-6xl';

  return (
    <div
      onClick={onClick}
      title={`${rankDisplay} of ${suitMeta.english}`}
      className={`relative bg-gradient-to-br from-white via-[#fcfcfd] to-[#f1f5f9] border flex flex-col justify-between p-1.5 sm:p-2 select-none touch-manipulation transition-all duration-200 ease-out overflow-hidden ${sizeClasses[size]} ${cursorClass} ${dimClass} ${selectedClass} ${playableRing} ${trumpBorder} ${className}`}
      style={{
        boxShadow: isSelected
          ? '0 20px 25px -5px rgba(0, 0, 0, 0.45), 0 8px 10px -6px rgba(0, 0, 0, 0.35)'
          : '0 6px 14px -2px rgba(0, 0, 0, 0.28), 0 2px 5px -2px rgba(0, 0, 0, 0.16)',
      }}
    >
      {/* Subtle Top Gloss Sheen */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-white/80 to-transparent" />
      {/* Subtle Inner Card Frame */}
      <div className="pointer-events-none absolute inset-1 rounded-[inherit] border border-slate-200/70" />
      {/* Trump Badge Indicator (English only) */}
      {isTrump && (
        <div
          title={`Trump Suit: ${suitMeta.english}`}
          className="absolute top-0 right-0 px-1 py-0.5 bg-amber-400 rounded-bl-lg shadow-sm flex items-center gap-0.5 z-20"
        >
          <span className="text-[8px] sm:text-[9px] font-black text-slate-950 leading-none">★</span>
        </div>
      )}

      {/* Top Left Rank & Small Suit Pip (matching clean classic card layout) */}
      <div className={`flex flex-col items-center w-fit leading-none z-10 font-sans ${suitColorClass}`}>
        <span className={`font-bold tracking-tighter leading-none ${topRankSize}`}>
          {rankDisplay}
        </span>
        <span className={`leading-none mt-0.5 ${topPipSize}`}>
          {suitMeta.symbol}
        </span>
      </div>

      {/* Large Lower-Right Suit Symbol */}
      <div className={`flex items-end justify-end leading-none z-10 pointer-events-none ${suitColorClass}`}>
        <span className={`leading-none ${mainPipSize} translate-y-0.5`}>
          {suitMeta.symbol}
        </span>
      </div>
    </div>
  );
};
