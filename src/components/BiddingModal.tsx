import React, { useEffect, useState } from 'react';
import { Lock, Target, AlertTriangle, Eye } from 'lucide-react';
import { Card, Suit, SUIT_NAMES } from '../types/game';
import { CardView } from './CardView';

interface BiddingModalProps {
  cardsInRound: number;
  forbiddenBid: number | null;
  isDealer: boolean;
  onPlaceBid: (bid: number) => void;
  totalBidsSoFar: number;
  isSubmitting?: boolean;
  myHand?: Card[];
  trumpSuit?: Suit | 'NONE';
}

export const BiddingModal: React.FC<BiddingModalProps> = ({
  cardsInRound,
  forbiddenBid,
  isDealer,
  onPlaceBid,
  totalBidsSoFar,
  isSubmitting = false,
  myHand = [],
  trumpSuit = 'NONE',
}) => {
  const [selectedBid, setSelectedBid] = useState<number | null>(null);
  const [localSubmitting, setLocalSubmitting] = useState(false);

  useEffect(() => {
    if (!isSubmitting) {
      setLocalSubmitting(false);
    }
  }, [isSubmitting]);

  const submitting = isSubmitting || localSubmitting;

  const handleConfirm = () => {
    if (selectedBid !== null && !submitting) {
      setLocalSubmitting(true);
      onPlaceBid(selectedBid);
    }
  };

  const bidOptions = Array.from({ length: cardsInRound + 1 }, (_, i) => i);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-2 sm:p-4 bg-slate-950/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-lg rounded-2xl sm:rounded-3xl bg-slate-900/95 border border-amber-500/40 p-3.5 sm:p-5 shadow-2xl flex flex-col items-center text-center my-auto max-h-[96vh] overflow-y-auto">
        {/* Header & Title */}
        <div className="flex items-center gap-2 mb-1.5">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Target size={16} />
          </div>
          <h3 className="text-base sm:text-lg font-bold text-slate-100">Make Your Judgement</h3>
        </div>

        <p className="text-[10px] sm:text-xs text-slate-300 mb-2">
          Predict exactly how many hands (haath) you will win out of <span className="text-amber-400 font-bold">{cardsInRound}</span> {cardsInRound === 1 ? 'card' : 'cards'}.
        </p>

        {/* Visible Hand Cards Preview inside Bidding Box */}
        {myHand.length > 0 && (
          <div className="w-full bg-slate-950/70 border border-slate-800 rounded-2xl p-2 mb-2 flex flex-col items-center">
            <div className="flex items-center justify-between w-full px-1 mb-1 text-[9px] sm:text-[10px] text-slate-300 font-semibold uppercase tracking-wider">
              <span className="flex items-center gap-1 text-slate-300">
                <Eye size={12} className="text-amber-400" /> Your Hand ({myHand.length} {myHand.length === 1 ? 'card' : 'cards'})
              </span>
              {trumpSuit !== 'NONE' && SUIT_NAMES[trumpSuit] && (
                <span className="text-amber-400 font-bold flex items-center gap-1">
                  Trump: {SUIT_NAMES[trumpSuit].symbol} {SUIT_NAMES[trumpSuit].english}
                </span>
              )}
            </div>

            <div className="flex items-center justify-center gap-1 sm:gap-1.5 overflow-x-auto max-w-full py-1.5 px-2 scrollbar-none">
              {myHand.map((card) => {
                const isTrump = trumpSuit !== 'NONE' && card.suit === trumpSuit;
                return (
                  <div key={card.id} className="relative shrink-0">
                    <CardView card={card} size="sm" isTrump={isTrump} className="shadow-md" />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Dealer Hook Rule Warning */}
        {isDealer && forbiddenBid !== null && (
          <div className="w-full bg-rose-950/60 border border-rose-600/40 rounded-xl p-2 mb-2 flex items-center gap-2 text-left text-[11px] sm:text-xs text-rose-300">
            <AlertTriangle size={15} className="text-rose-400 shrink-0" />
            <div>
              <span className="font-bold text-rose-200">Dealer Hook Rule:</span> You cannot bid{' '}
              <span className="font-extrabold text-white bg-rose-700 px-1.5 py-0.2 rounded text-[11px] sm:text-xs">{forbiddenBid}</span> (sum of bids cannot equal {cardsInRound}).
            </div>
          </div>
        )}

        {/* Bids placed so far info */}
        <div className="text-[10px] sm:text-[11px] text-slate-300 mb-2">
          Other players' bids total: <span className="text-slate-200 font-semibold">{totalBidsSoFar}</span>
        </div>

        {/* Bid Selection Buttons */}
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-1 sm:gap-1.5 w-full mb-3">
          {bidOptions.map((bid) => {
            const isForbidden = isDealer && forbiddenBid === bid;
            const isSelected = selectedBid === bid;

            return (
              <button
                key={bid}
                disabled={isForbidden}
                onClick={() => setSelectedBid(bid)}
                className={`relative h-9 sm:h-11 rounded-xl font-extrabold text-sm sm:text-base flex items-center justify-center transition-all ${
                  isForbidden
                    ? 'bg-slate-800/40 text-slate-600 border border-slate-800 cursor-not-allowed opacity-50'
                    : isSelected
                    ? 'bg-gradient-to-br from-amber-400 to-yellow-500 text-slate-950 shadow-lg shadow-amber-500/30 scale-105 ring-2 ring-white'
                    : 'bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700/80 active:scale-95'
                }`}
              >
                {bid}
                {isForbidden && (
                  <div
                    title="Hook Rule: Forbidden Dealer Bid"
                    className="absolute -top-1 -right-1 bg-rose-600 text-white p-0.5 rounded-full ring-2 ring-slate-900"
                  >
                    <Lock size={8} />
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Submit Action */}
        <button
          disabled={selectedBid === null || submitting}
          onClick={handleConfirm}
          className="w-full py-2.5 px-4 rounded-xl font-bold text-slate-950 bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-400 hover:from-amber-300 hover:to-yellow-300 shadow-lg shadow-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.98] text-xs sm:text-sm"
        >
          {submitting
            ? 'Submitting Bid...'
            : selectedBid !== null
            ? `Confirm Bid: ${selectedBid} ${selectedBid === 1 ? 'Hand' : 'Hands'}`
            : 'Select a Bid'}
        </button>
      </div>
    </div>
  );
};
