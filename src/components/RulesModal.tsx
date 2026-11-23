import React from 'react';
import { X, BookOpen, AlertTriangle, ShieldCheck, Award } from 'lucide-react';
import { SUIT_NAMES, TRUMP_CYCLE } from '../types/game';

interface RulesModalProps {
  onClose: () => void;
}

export const RulesModal: React.FC<RulesModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-xl rounded-3xl bg-slate-900 border border-slate-700 p-5 sm:p-6 shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <BookOpen size={22} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-100 font-display">How to Play Kachuful</h2>
              <p className="text-xs text-slate-400">Official Indian Judgement Rules & Mechanics</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 text-xs sm:text-sm text-slate-300 leading-relaxed overflow-y-auto pr-1">
          {/* Section 1: Objective */}
          <div className="bg-slate-800/40 border border-slate-700/60 rounded-2xl p-4">
            <h4 className="font-bold text-slate-100 text-sm mb-1 flex items-center gap-2">
              <Award size={16} className="text-amber-400" />
              Objective
            </h4>
            <p className="text-slate-400 text-xs">
              Kachuful (also known as Judgement) is a classic card game where each player predicts the exact number of hands (haath) they will win in each round.
            </p>
          </div>

          {/* Section 2: Trump Rotation */}
          <div className="bg-slate-800/40 border border-slate-700/60 rounded-2xl p-4">
            <h4 className="font-bold text-slate-100 text-sm mb-2 flex items-center gap-2">
              <ShieldCheck size={16} className="text-emerald-400" />
              The "Ka-Chu-Fu-La" Trump Cycle
            </h4>
            <p className="text-slate-400 text-xs mb-3">
              The game name comes from the fixed rotation of trump suits across rounds:
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {TRUMP_CYCLE.map((suit) => {
                const meta = SUIT_NAMES[suit];
                return (
                  <div key={suit} className="bg-slate-900/80 p-2 rounded-xl border border-slate-700/70 text-center">
                    <span className={`text-xl ${meta.color}`}>{meta.symbol}</span>
                    <div className="font-bold text-xs text-slate-200">{meta.english} ({meta.hindiSuit})</div>
                    <div className="text-[10px] text-slate-400">{meta.hindi}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 3: The Dealer Hook Rule */}
          <div className="bg-rose-950/30 border border-rose-600/40 rounded-2xl p-4">
            <h4 className="font-bold text-rose-200 text-sm mb-1 flex items-center gap-2">
              <AlertTriangle size={16} className="text-rose-400" />
              The Mandatory Dealer "Hook" Rule
            </h4>
            <p className="text-xs text-rose-300">
              The dealer bids last. To prevent all players from being satisfied, <strong>the dealer cannot make the total bids equal the total cards/hands in the round</strong>.
            </p>
            <div className="mt-2 text-[11px] text-rose-200/90 bg-rose-900/40 p-2 rounded-lg font-mono">
              Sum(All Player Bids) ≠ Cards Dealt in Round
            </div>
          </div>

          {/* Section 4: Hand Playing Rules */}
          <div className="bg-slate-800/40 border border-slate-700/60 rounded-2xl p-4">
            <h4 className="font-bold text-slate-100 text-sm mb-1">Hand-Playing Rules</h4>
            <ul className="list-disc list-inside space-y-1 text-slate-400 text-xs">
              <li>You <strong>must follow suit</strong> if you have cards of the led suit.</li>
              <li>If you have no cards of the led suit, you can trump or discard any other suit.</li>
              <li>The highest trump card wins the hand. If no trumps are played, the highest card of the led suit wins.</li>
              <li>Ranks: A (Ikka, highest) &gt; K (Badshah) &gt; Q (Begum) &gt; J (Ghulam) &gt; 10 &gt; ... &gt; 2 (lowest).</li>
            </ul>
          </div>

          {/* Section 5: Scoring */}
          <div className="bg-slate-800/40 border border-slate-700/60 rounded-2xl p-4">
            <h4 className="font-bold text-slate-100 text-sm mb-1">Classic Judgement Scoring</h4>
            <p className="text-slate-400 text-xs mb-2">
              Points are only awarded for hitting your exact judgement:
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-emerald-950/30 border border-emerald-500/30 p-2 rounded-xl text-center">
                <span className="font-bold text-emerald-300 block">Exact Hit</span>
                <span className="text-[11px] text-slate-300">Score = 10 + Bid</span>
              </div>
              <div className="bg-slate-900 p-2 rounded-xl border border-slate-700 text-center">
                <span className="font-bold text-slate-400 block">Miss (Over or Under)</span>
                <span className="text-[11px] text-slate-400">Score = 0 points</span>
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="mt-5 w-full py-2.5 px-4 rounded-xl font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 transition"
        >
          Got It, Let's Play
        </button>
      </div>
    </div>
  );
};
