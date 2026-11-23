import React, { useEffect, useState } from 'react';
import { Player } from '../types/game';
import { Bot, WifiOff, Crown } from 'lucide-react';

interface TableSeatProps {
  player?: Player;
  position: 'top' | 'left' | 'right' | 'bottom';
  isDealer: boolean;
  isCurrentTurn: boolean;
  isLead: boolean;
  phase: string;
  isSelf?: boolean;
  compact?: boolean;
  pill?: boolean;
  turnDeadline?: number | null;
  turnTimeoutSeconds?: number;
}

export const TableSeat: React.FC<TableSeatProps> = ({
  player,
  position,
  isDealer,
  isCurrentTurn,
  isLead: _isLead,
  phase,
  isSelf = false,
  compact = false,
  pill = false,
  turnDeadline,
  turnTimeoutSeconds = 15,
}) => {
  const isHumanTurnActive =
    !!player &&
    isCurrentTurn &&
    !player.isBot &&
    player.isConnected &&
    (phase === 'BIDDING' || phase === 'PLAYING') &&
    turnDeadline !== null;

  const totalMs = Math.max(1000, turnTimeoutSeconds * 1000);
  const [remainingMs, setRemainingMs] = useState<number>(totalMs);

  useEffect(() => {
    if (!isHumanTurnActive) {
      setRemainingMs(0);
      return;
    }

    const effectiveDeadline =
      typeof turnDeadline === 'number' ? turnDeadline : Date.now() + totalMs;

    const update = () => {
      setRemainingMs(Math.max(0, effectiveDeadline - Date.now()));
    };

    update();
    const timer = setInterval(update, 100);
    return () => clearInterval(timer);
  }, [
    isHumanTurnActive,
    turnDeadline,
    totalMs,
    phase,
    player?.id,
    player?.cardCount,
    player?.currentBid,
  ]);

  if (!player) {
    return (
      <div className="flex flex-col items-center justify-center p-2 rounded-xl border border-dashed border-emerald-900/40 bg-emerald-950/20 w-24 h-14 text-emerald-300/40 text-[10px]">
        <span>Empty Seat</span>
      </div>
    );
  }

  const isBiddingPhase = phase === 'BIDDING';
  const isPlayingPhase = phase === 'PLAYING' || phase === 'TRICK_RESOLVE';
  const progress = isHumanTurnActive ? Math.max(0, Math.min(1, remainingMs / totalMs)) : 0;
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const ringRadius = 20;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference * (1 - progress);
  const ringColor = progress > 0.5 ? '#fbbf24' : progress > 0.25 ? '#f97316' : '#f43f5e';

  const getPositionClasses = () => {
    switch (position) {
      case 'top':
        return 'flex-col items-center';
      case 'left':
        return 'flex-row items-center';
      case 'right':
        return 'flex-row-reverse items-center';
      case 'bottom':
        return 'flex-col items-center';
    }
  };

  if (pill) {
    return (
      <div
        data-seat-pill="true"
        className={`relative flex items-center gap-1.5 rounded-full px-2 py-1 transition-all duration-300 select-none max-w-[175px] shrink-0 ${
          isCurrentTurn
            ? 'bg-emerald-900/95 ring-2 ring-amber-400 shadow-[0_0_14px_rgba(251,191,36,0.55)]'
            : 'bg-slate-900/90 border border-slate-700/80 shadow-md'
        }`}
      >
        {isDealer && (
          <div
            title="Dealer"
            className="absolute -top-1 -right-1 z-20 w-4 h-4 rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 border border-amber-200 text-slate-950 text-[9px] font-black flex items-center justify-center shadow"
          >
            D
          </div>
        )}

        <div className="relative shrink-0">
          {isHumanTurnActive && (
            <>
              <svg
                viewBox="0 0 44 44"
                aria-label={`Turn countdown ${remainingSeconds}s`}
                className="absolute -inset-1 w-[calc(100%+8px)] h-[calc(100%+8px)] pointer-events-none z-10"
              >
                <circle
                  cx="22"
                  cy="22"
                  r={ringRadius}
                  fill="none"
                  stroke="rgba(255, 255, 255, 0.16)"
                  strokeWidth="3.5"
                />
                <circle
                  cx="22"
                  cy="22"
                  r={ringRadius}
                  fill="none"
                  stroke={ringColor}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeDasharray={ringCircumference}
                  strokeDashoffset={ringOffset}
                  transform="rotate(-90 22 22)"
                  className="transition-[stroke-dashoffset,stroke] duration-100 linear"
                />
              </svg>
              <span
                className={`absolute -top-1.5 -left-1.5 z-20 px-1 rounded-full text-[8px] font-black leading-tight shadow ring-1 ring-slate-900 ${
                  progress <= 0.25 ? 'bg-rose-500 text-white' : 'bg-amber-400 text-slate-950'
                }`}
              >
                {remainingSeconds}s
              </span>
            </>
          )}
          <div className="w-7 h-7 text-sm rounded-full bg-slate-800 border border-slate-600 flex items-center justify-center shadow-inner">
            {player.avatar}
          </div>
          {player.isBot && (
            <div
              title="Smart AI Bot"
              className="absolute -bottom-0.5 -right-0.5 z-20 bg-indigo-600 text-white p-0.5 rounded-full ring-1 ring-slate-900"
            >
              <Bot size={8} />
            </div>
          )}
          {!player.isConnected && !player.isBot && (
            <div
              title="Disconnected"
              className="absolute -bottom-0.5 -left-0.5 z-20 bg-rose-600 text-white p-0.5 rounded-full ring-1 ring-slate-900 animate-pulse"
            >
              <WifiOff size={8} />
            </div>
          )}
        </div>

        <div className="flex flex-col min-w-0 leading-tight pr-1">
          <div className="flex items-center gap-1 text-[10px]">
            <span className="font-semibold text-slate-100 truncate max-w-[68px]">
              {player.name}
            </span>
            {isSelf && <span className="text-[8px] text-amber-400 font-bold shrink-0">(You)</span>}
            <span className="text-amber-300 font-bold shrink-0">{player.totalScore}p</span>
          </div>

          <div className="text-[9px] font-bold flex items-center gap-1">
            {isBiddingPhase ? (
              player.currentBid !== null ? (
                <span className="text-emerald-400">Bid:{player.currentBid}</span>
              ) : isCurrentTurn ? (
                <span className="text-amber-400 animate-pulse">Bidding...</span>
              ) : (
                <span className="text-slate-500">Waiting</span>
              )
            ) : isPlayingPhase ? (
              <>
                <span className="text-slate-300">
                  B:<span className="text-amber-400">{player.currentBid ?? '-'}</span>
                </span>
                <span className="text-slate-500">·</span>
                <span
                  className={
                    player.tricksWon === player.currentBid
                      ? 'text-emerald-400 font-extrabold'
                      : player.tricksWon > (player.currentBid ?? 0)
                      ? 'text-rose-400'
                      : 'text-sky-300'
                  }
                >
                  W:{player.tricksWon}
                </span>
              </>
            ) : (
              <span className="text-slate-400">{player.isBot ? 'AI Bot' : 'Ready'}</span>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative flex ${getPositionClasses()} gap-1.5 transition-all duration-300 select-none max-w-full`}>
      {/* Dealer Token */}
      {isDealer && (
        <div
          title="Dealer"
          className="absolute -top-1 -right-1 z-20 w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 border border-amber-200 text-slate-950 text-[9px] sm:text-[10px] font-black flex items-center justify-center shadow-lg animate-bounce"
        >
          D
        </div>
      )}

      {/* Turn indicator glow ring & player profile badge */}
      <div
        className={`relative flex items-center ${compact ? 'gap-1 p-1' : 'gap-1.5 p-2'} rounded-2xl transition-all duration-300 ${
          isCurrentTurn
            ? `bg-emerald-900/95 ring-2 sm:ring-3 ring-amber-400 shadow-[0_0_22px_rgba(251,191,36,0.65)] ${
                compact ? 'scale-[1.02]' : 'scale-105'
              }`
            : 'bg-slate-900/90 border border-slate-700/70 shadow-md'
        }`}
      >
        {/* Avatar with countdown ring and status icons */}
        <div className="relative shrink-0">
          {isHumanTurnActive && (
            <>
              <svg
                viewBox="0 0 44 44"
                aria-label={`Turn countdown ${remainingSeconds}s`}
                className="absolute -inset-1 w-[calc(100%+8px)] h-[calc(100%+8px)] pointer-events-none z-10"
              >
                <circle
                  cx="22"
                  cy="22"
                  r={ringRadius}
                  fill="none"
                  stroke="rgba(255, 255, 255, 0.16)"
                  strokeWidth="3"
                />
                <circle
                  cx="22"
                  cy="22"
                  r={ringRadius}
                  fill="none"
                  stroke={ringColor}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={ringCircumference}
                  strokeDashoffset={ringOffset}
                  transform="rotate(-90 22 22)"
                  className="transition-[stroke-dashoffset,stroke] duration-100 linear"
                />
              </svg>
              <span
                className={`absolute -top-1.5 -left-1.5 z-20 px-1 rounded-full text-[9px] font-black leading-tight shadow ring-1 ring-slate-900 ${
                  progress <= 0.25 ? 'bg-rose-500 text-white' : 'bg-amber-400 text-slate-950'
                }`}
              >
                {remainingSeconds}s
              </span>
            </>
          )}

          <div
            className={`rounded-full bg-slate-800 border border-slate-600 flex items-center justify-center shadow-inner ${
              compact ? 'w-7 h-7 sm:w-8 sm:h-8 text-sm sm:text-base' : 'w-10 h-10 sm:w-11 sm:h-11 text-xl sm:text-2xl'
            }`}
          >
            {player.avatar}
          </div>

          {player.isBot && (
            <div
              title="Smart AI Bot"
              className="absolute -bottom-1 -right-1 z-20 bg-indigo-600 text-white p-0.5 rounded-full ring-1 ring-slate-900"
            >
              <Bot size={10} />
            </div>
          )}

          {!player.isConnected && !player.isBot && (
            <div
              title="Disconnected (AI proxy active, 5m rejoin window)"
              className="absolute -bottom-1 -left-1 z-20 bg-rose-600 text-white p-0.5 rounded-full ring-1 ring-slate-900 animate-pulse"
            >
              <WifiOff size={10} />
            </div>
          )}
        </div>

        {/* Player Info & Live Trick Stats */}
        <div className={`flex flex-col min-w-0 ${compact ? 'min-w-[48px] max-w-[70px]' : 'min-w-[80px] max-w-[110px]'}`}>
          <div className="flex items-center gap-1">
            <span className={`font-semibold ${compact ? 'text-[11px]' : 'text-xs'} text-slate-100 truncate`}>
              {player.name}
            </span>
            {isSelf && <span className="text-[9px] text-amber-400 font-bold shrink-0">(You)</span>}
          </div>

          <div className={`${compact ? 'text-[9px]' : 'text-[10px]'} text-slate-400 flex items-center gap-0.5 sm:gap-1 whitespace-nowrap`}>
            <span className="text-amber-300 font-medium">{player.totalScore}p</span>
            {isPlayingPhase && !isSelf && (
              <>
                <span>·</span>
                <span className="text-slate-300 font-bold">{player.cardCount}c</span>
              </>
            )}
          </div>

          {/* Current Bidding / Playing stats badge */}
          {isBiddingPhase && (
            <div className={`${compact ? 'text-[9px]' : 'text-[10px]'} font-bold truncate`}>
              {player.currentBid !== null ? (
                <span className="text-emerald-400">Bid: {player.currentBid}</span>
              ) : isCurrentTurn ? (
                <span className="text-amber-400 animate-pulse">Bidding...</span>
              ) : (
                <span className="text-slate-500">Waiting</span>
              )}
            </div>
          )}

          {isPlayingPhase && (
            <div
              className={`flex items-center gap-0.5 sm:gap-1 ${compact ? 'text-[9px]' : 'text-[10px]'} font-bold whitespace-nowrap`}
              title={`Hands Bid: ${player.currentBid ?? '-'} | Hands Won: ${player.tricksWon}`}
            >
              <span className="text-slate-300">
                {compact ? 'B:' : 'Bid:'}<span className="text-amber-400">{player.currentBid ?? '-'}</span>
              </span>
              <span>·</span>
              <span
                className={
                  player.tricksWon === player.currentBid
                    ? 'text-emerald-400 font-extrabold flex items-center gap-0.5'
                    : player.tricksWon > (player.currentBid ?? 0)
                    ? 'text-rose-400'
                    : 'text-sky-300'
                }
              >
                {compact ? 'W:' : 'Won:'}{player.tricksWon}
                {player.tricksWon === player.currentBid && player.currentBid !== null && (
                  <Crown size={9} className="inline text-emerald-400 ml-0.5" />
                )}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
