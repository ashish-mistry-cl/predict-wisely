import React from 'react';
import { Player } from '../types/game';
import { Crown, Trophy, RotateCcw, Home } from 'lucide-react';

interface GameOverModalProps {
  players: Player[];
  onPlayAgain: () => void;
  onReturnLobby: () => void;
  isHost: boolean;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  players,
  onPlayAgain,
  onReturnLobby,
  isHost,
}) => {
  const sorted = [...players].sort((a, b) => b.totalScore - a.totalScore);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-lg rounded-3xl bg-slate-900 border border-amber-500/40 p-6 sm:p-8 shadow-2xl flex flex-col items-center text-center max-h-[92vh] overflow-y-auto">
        {/* Trophy Header */}
        <div className="relative mb-3">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-amber-500 to-yellow-300 flex items-center justify-center text-slate-950 shadow-xl shadow-amber-500/30">
            <Trophy size={36} />
          </div>
          <div className="absolute -top-3 -right-2 text-amber-300 animate-bounce">
            <Crown size={24} />
          </div>
        </div>

        <h2 className="text-2xl font-extrabold text-slate-100 font-display">Match Finished!</h2>
        <p className="text-xs text-slate-400 mb-6">
          Congratulations to the champion!
        </p>

        {/* Podium Standings */}
        <div className="w-full space-y-2 mb-6 max-h-[42vh] overflow-y-auto pr-1">
          {sorted.map((player, idx) => {
            const isWinner = idx === 0;

            return (
              <div
                key={player.id}
                className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all ${
                  isWinner
                    ? 'bg-gradient-to-r from-amber-500/20 via-yellow-500/10 to-transparent border-amber-500/50 shadow-lg'
                    : 'bg-slate-800/50 border-slate-700/60'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black ${
                      idx === 0
                        ? 'bg-amber-400 text-slate-950'
                        : idx === 1
                        ? 'bg-slate-300 text-slate-950'
                        : idx === 2
                        ? 'bg-amber-700 text-white'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    #{idx + 1}
                  </div>
                  <div className="text-2xl">{player.avatar}</div>
                  <div className="text-left">
                    <div className="font-bold text-sm text-slate-100 flex items-center gap-1.5">
                      {player.name}
                      {isWinner && <Crown size={14} className="text-amber-400" />}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="font-extrabold text-amber-400 text-base">{player.totalScore} pts</div>
                    <div className="text-[10px] text-slate-400">Final Score</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3 w-full">
          <button
            onClick={onReturnLobby}
            className="py-3 px-4 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 font-bold text-sm flex items-center justify-center gap-2 transition"
          >
            <Home size={16} />
            <span>Lobby</span>
          </button>

          {isHost ? (
            <button
              onClick={onPlayAgain}
              className="py-3 px-4 rounded-xl bg-gradient-to-r from-amber-400 to-yellow-400 hover:from-amber-300 hover:to-yellow-300 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 active:scale-95 transition"
            >
              <RotateCcw size={16} />
              <span>Play Again</span>
            </button>
          ) : (
            <button
              onClick={onReturnLobby}
              className="py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm flex items-center justify-center gap-2 transition"
            >
              <Home size={16} />
              <span>Back to Menu</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
