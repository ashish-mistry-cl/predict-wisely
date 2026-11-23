import React from 'react';
import { Player, SUIT_NAMES, TRUMP_CYCLE } from '../types/game';
import { Trophy, CheckCircle2, XCircle, ArrowRight, X } from 'lucide-react';

interface RoundScorecardModalProps {
  players: Player[];
  currentRound: number;
  totalRounds: number;
  isHost: boolean;
  onNextRound: () => void;
  onClose?: () => void;
}

export const RoundScorecardModal: React.FC<RoundScorecardModalProps> = ({
  players,
  currentRound,
  totalRounds,
  isHost,
  onNextRound,
  onClose,
}) => {
  // Sort players for leaderboard ranking in this summary
  const sortedPlayers = [...players].sort((a, b) => b.totalScore - a.totalScore);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-2xl rounded-2xl bg-[#6f81d7] border border-slate-700 p-5 sm:p-6 shadow-2xl flex flex-col my-auto max-h-[92vh] overflow-y-auto">
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X size={20} />
          </button>
        )}

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Trophy size={22} />
          </div>
          <div>
            <h3 className="text-lg sm:text-xl font-bold text-slate-100">
              Round {currentRound} Scoreboard
            </h3>
            <p className="text-xs text-[#0e0a0a]">
              {currentRound >= totalRounds ? 'Final Standings' : `Progress: ${currentRound} of ${totalRounds} Rounds`}
            </p>
          </div>
        </div>

        {/* Current Round Results Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 mb-5 max-h-[35vh] overflow-y-auto pr-1">
          {sortedPlayers.map((player, rank) => {
            const lastScore = player.scoreHistory[player.scoreHistory.length - 1];
            const isHit = lastScore ? lastScore.bid === lastScore.won : false;

            return (
              <div
                key={player.id}
                className={`p-3 rounded-xl border flex flex-col items-center text-center ${
                  rank === 0
                    ? 'bg-amber-500/10 border-amber-500/40 text-slate-100'
                    : 'bg-slate-800/60 border-slate-700/60 text-slate-200'
                }`}
              >
                <div className="text-2xl mb-1">{player.avatar}</div>
                <div className="font-bold text-xs truncate max-w-full">{player.name}</div>
                <div className="text-[10px] text-slate-400 mb-2">Rank #{rank + 1}</div>

                {lastScore && (
                  <div className="flex items-center gap-1 text-xs mb-1">
                    <span className="text-slate-400">Bid: {lastScore.bid}</span>
                    <span>/</span>
                    <span className="font-bold text-slate-200">Won: {lastScore.won}</span>
                    {isHit ? (
                      <CheckCircle2 size={13} className="text-emerald-400 ml-0.5" />
                    ) : (
                      <XCircle size={13} className="text-rose-400 ml-0.5" />
                    )}
                  </div>
                )}

                <div className="text-xs">
                  {lastScore && (
                    <span className={isHit ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                      +{lastScore.points} pts
                    </span>
                  )}
                </div>

                <div className="mt-2 pt-2 border-t border-slate-700/50 w-full text-center">
                  <span className="text-[10px] text-slate-400">Total:</span>{' '}
                  <span className="font-extrabold text-amber-400 text-sm">{player.totalScore}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Detailed History Table */}
        <div className="border border-slate-700 rounded-xl overflow-hidden mb-5">
          <div className="bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-300">
            Full Round-by-Round Log
          </div>
          <div className="overflow-x-auto max-h-48 overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-800/50 text-slate-400 border-b border-slate-700">
                <tr>
                  <th className="p-2">Rnd</th>
                  <th className="p-2">Trump</th>
                  {players.map((p) => (
                    <th key={p.id} className="p-2 truncate max-w-[90px]">
                      {p.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {Array.from({ length: currentRound }).map((_, rIdx) => {
                  const roundNum = rIdx + 1;
                  const trumpSuit = TRUMP_CYCLE[(roundNum - 1) % TRUMP_CYCLE.length];
                  const trumpMeta = SUIT_NAMES[trumpSuit];

                  return (
                    <tr key={roundNum} className="hover:bg-slate-800/30">
                      <td className="p-2 font-mono font-bold text-slate-300">{roundNum}</td>
                      <td className="p-2 font-semibold">
                        <span className={rIdx === 0 ? 'text-[#171515]' : trumpMeta.color}>{trumpMeta.symbol} {trumpMeta.english}</span>
                      </td>
                      {players.map((p) => {
                        const entry = p.scoreHistory[rIdx];
                        if (!entry) return <td key={p.id} className="p-2 text-slate-600">-</td>;
                        const hit = entry.bid === entry.won;
                        return (
                          <td key={p.id} className="p-2">
                            <span className="text-slate-400">{entry.bid}/{entry.won}</span>{' '}
                            <span className={hit ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                              ({entry.points})
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Next Round Action */}
        <div className="flex items-center justify-between mt-auto pt-2">
          <div className="text-xs text-slate-400">
            {isHost ? 'You are the host. Advance when ready.' : 'Waiting for host to start next round...'}
          </div>

          {isHost ? (
            <button
              onClick={onNextRound}
              className="py-2.5 px-5 rounded-xl font-bold text-slate-950 bg-gradient-to-r from-amber-400 to-yellow-400 hover:from-amber-300 hover:to-yellow-300 flex items-center gap-2 shadow-lg shadow-amber-500/20 active:scale-95 transition"
            >
              <span>Next Round</span>
              <ArrowRight size={16} />
            </button>
          ) : (
            <div className="text-xs text-amber-400 animate-pulse font-medium">
              Host will advance round soon...
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
