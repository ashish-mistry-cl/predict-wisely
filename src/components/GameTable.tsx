import React, { useEffect, useRef, useState } from 'react';
import { Card, GameRoomState, PlayedCard, SUIT_NAMES } from '../types/game';
import { CardView } from './CardView';
import { TableSeat } from './TableSeat';
import { BiddingModal } from './BiddingModal';
import { RoundScorecardModal } from './RoundScorecardModal';
import { GameOverModal } from './GameOverModal';
import { getLegalCards, evaluateTrickWinner } from '../utils/gameRules';
import { sound } from '../utils/audio';
import {
  Volume2,
  VolumeX,
  FileSpreadsheet,
  LogOut,
  MessageSquare,
  Send,
  Crown,
  Sparkles,
  Info,
  Maximize,
  Minimize,
} from 'lucide-react';

interface GameTableProps {
  room: GameRoomState;
  myPlayerId: string;
  myHand: Card[];
  isConnected?: boolean;
  isHandLocked?: boolean;
  isBidSubmitting?: boolean;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onPlaceBid: (bid: number) => void;
  onPlayCard: (cardId: string) => void;
  onReadyNextRound: () => void;
  onPlayAgain: () => void;
  onLeaveRoom: () => void;
  onSendMessage: (text: string) => void;
  onOpenRules: () => void;
}

export const GameTable: React.FC<GameTableProps> = ({
  room,
  myPlayerId,
  myHand,
  isConnected = true,
  isHandLocked = false,
  isBidSubmitting = false,
  isFullscreen,
  onToggleFullscreen,
  onPlaceBid,
  onPlayCard,
  onReadyNextRound,
  onPlayAgain,
  onLeaveRoom,
  onSendMessage,
  onOpenRules,
}) => {
  const [showScorecard, setShowScorecard] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [isMuted, setIsMuted] = useState(sound.getMuted());
  const [playHint, setPlayHint] = useState<string | null>(null);
  const hintTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [viewport, setViewport] = useState(() =>
    typeof window !== 'undefined'
      ? { width: window.innerWidth, height: window.innerHeight }
      : { width: 1024, height: 768 }
  );

  useEffect(() => {
    const updateViewport = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };
    updateViewport();
    window.addEventListener('resize', updateViewport);
    window.addEventListener('orientationchange', updateViewport);
    return () => {
      window.removeEventListener('resize', updateViewport);
      window.removeEventListener('orientationchange', updateViewport);
    };
  }, []);

  const isShortLandscape = viewport.width > viewport.height && viewport.height < 500;
  const isPortrait = viewport.height > viewport.width;

  const isHost = room.hostId === myPlayerId;
  const myPlayerIndex = room.players.findIndex((p) => p.id === myPlayerId);
  const myPlayer = myPlayerIndex >= 0 ? room.players[myPlayerIndex] : null;

  const isMyTurn = room.currentTurnPlayerIndex === myPlayerIndex;
  const isBiddingPhase = room.phase === 'BIDDING';
  const isPlayingPhase = room.phase === 'PLAYING';
  const isDealer = room.dealerIndex === myPlayerIndex;
  const hasPlayedInCurrentTrick = room.currentTrick.some((played) => played.playerId === myPlayerId);
  const canShowMyTurnToPlay = isPlayingPhase && isMyTurn && !hasPlayedInCurrentTrick;

  // Currently winning card in active trick
  const currentTrickWinner =
    room.currentTrick.length > 0
      ? evaluateTrickWinner(room.currentTrick, room.trumpSuit)
      : null;

  // Determine legal cards for player
  const legalCards = isPlayingPhase && isMyTurn ? getLegalCards(myHand, room.currentTrick) : myHand;
  const legalCardIds = new Set(legalCards.map((c) => c.id));
  const isAutoPlayingTurn = canShowMyTurnToPlay && (myHand.length === 1 || legalCards.length === 1);
  const leadSuitName =
    room.currentTrick.length > 0 && SUIT_NAMES[room.currentTrick[0].card.suit]
      ? SUIT_NAMES[room.currentTrick[0].card.suit].english
      : null;

  const prevTrickLenRef = useRef(room.currentTrick.length);
  useEffect(() => {
    if (room.currentTrick.length > prevTrickLenRef.current) {
      sound.playCardDrop();
    }
    prevTrickLenRef.current = room.currentTrick.length;
  }, [room.currentTrick.length]);

  // Dynamically arrange up to 10 players relative to current user:
  const numPlayers = room.players.length;
  const opponents: { player: (typeof room.players)[0]; index: number }[] = [];
  for (let offset = 1; offset < numPlayers; offset++) {
    const targetIdx = (myPlayerIndex + offset) % numPlayers;
    opponents.push({ player: room.players[targetIdx], index: targetIdx });
  }

  let leftSeats: typeof opponents = [];
  let topSeats: typeof opponents = [];
  let rightSeats: typeof opponents = [];

  const K = opponents.length;
  if (K === 1) {
    topSeats = [opponents[0]];
  } else if (K === 2) {
    topSeats = [opponents[0], opponents[1]];
  } else if (K === 3) {
    leftSeats = [opponents[0]];
    topSeats = [opponents[1]];
    rightSeats = [opponents[2]];
  } else {
    const leftCount = Math.min(2, Math.floor(K / 4) || 1);
    const rightCount = Math.min(2, Math.floor(K / 4) || 1);
    const topCount = K - leftCount - rightCount;
    leftSeats = opponents.slice(0, leftCount);
    topSeats = opponents.slice(leftCount, leftCount + topCount);
    rightSeats = opponents.slice(leftCount + topCount);
  }
  const isCompact = numPlayers > 4;
  const isSideCompact = isCompact || isPortrait || isShortLandscape;
  const seatBottom = myPlayer;

  const showTemporaryHint = (msg: string) => {
    setPlayHint(msg);
    if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current);
    hintTimeoutRef.current = setTimeout(() => setPlayHint(null), 2200);
  };

  useEffect(() => {
    return () => {
      if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current);
    };
  }, []);

  const handleCardClick = (card: Card) => {
    if (isHandLocked) return;
    if (!isPlayingPhase) {
      if (isBiddingPhase && isMyTurn) {
        showTemporaryHint('Place your bid first!');
      }
      return;
    }
    if (!isMyTurn) {
      const turnName = room.players[room.currentTurnPlayerIndex]?.name || 'another player';
      showTemporaryHint(`Wait for ${turnName}'s turn`);
      return;
    }
    if (!legalCardIds.has(card.id)) {
      showTemporaryHint(
        leadSuitName ? `Must follow ${leadSuitName} suit!` : 'Cannot play that card right now'
      );
      return;
    }

    setPlayHint(null);
    sound.playCardDrop();
    onPlayCard(card.id);
  };

  const handleBidSubmit = (bid: number) => {
    sound.playBidChime();
    onPlaceBid(bid);
  };

  const handleToggleMute = () => {
    const next = sound.toggleMute();
    setIsMuted(next);
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    onSendMessage(chatInput.trim());
    setChatInput('');
  };

  const quickPhrases = ['Nice hand! 👏', 'Good judgement! 🎯', 'Oops! 😅', 'Well played! 🃏'];

  const trumpMeta = room.trumpSuit !== 'NONE' ? SUIT_NAMES[room.trumpSuit] : null;

  const renderTurnBanner = () => (
    <div
      data-turn-banner="true"
      className="z-20 text-center flex flex-col items-center gap-0.5 max-w-full shrink-0"
    >
      {isBiddingPhase && isMyTurn ? (
        <div className="px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 font-black text-[10px] sm:text-xs shadow-xl shadow-amber-500/30 animate-pulse leading-tight">
          YOUR TURN TO BID
        </div>
      ) : canShowMyTurnToPlay ? (
        <div className="px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 font-black text-[10px] sm:text-xs shadow-xl shadow-amber-500/30 animate-pulse leading-tight">
          {isAutoPlayingTurn
            ? myHand.length === 1
              ? 'LAST CARD — AUTO-PLAYING...'
              : `LAST ${leadSuitName ? leadSuitName.toUpperCase() : 'MATCHING'} CARD — AUTO-PLAYING...`
            : 'YOUR TURN TO PLAY'}
        </div>
      ) : isBiddingPhase || isPlayingPhase ? (
        <div className="px-2.5 py-0.5 rounded-full bg-slate-900/85 border border-slate-700/80 text-slate-300 text-[10px] sm:text-xs shadow-md leading-tight truncate max-w-full">
          Turn: <span className="font-bold text-amber-400">{room.players[room.currentTurnPlayerIndex]?.name}</span>
        </div>
      ) : room.phase === 'TRICK_RESOLVE' ? (
        <div className="px-2.5 py-0.5 rounded-full bg-slate-900/85 border border-emerald-500/40 text-emerald-300 text-[10px] sm:text-xs font-semibold shadow-md leading-tight">
          Resolving trick...
        </div>
      ) : null}
      {playHint && (
        <div className="px-2.5 py-0.5 rounded-full bg-rose-950/90 border border-rose-500/60 text-rose-200 text-[10px] sm:text-xs font-semibold shadow-lg">
          {playHint}
        </div>
      )}
    </div>
  );

  const renderTrumpBadge = () =>
    trumpMeta ? (
      <div
        data-trump-badge="true"
        title={`Trump Suit: ${trumpMeta.english}`}
        className="flex items-center gap-1.5 bg-slate-950/90 border border-amber-500/40 rounded-xl px-2 py-0.5 sm:px-2.5 sm:py-1 shadow-lg z-20 shrink-0"
      >
        <div className="flex flex-col text-right leading-none">
          <span className="text-[7px] sm:text-[8px] text-amber-300 font-bold uppercase tracking-wider">Trump</span>
          <span className="text-[10px] sm:text-xs font-bold text-slate-100">{trumpMeta.english}</span>
        </div>
        <span
          className={`text-sm sm:text-xl font-black leading-none ${
            room.trumpSuit === 'H' || room.trumpSuit === 'D' ? 'text-red-500' : 'text-white'
          }`}
        >
          {trumpMeta.symbol}
        </span>
      </div>
    ) : null;

  return (
    <div className="relative w-full h-[100dvh] max-h-[100dvh] flex flex-col bg-slate-950 select-none overflow-hidden font-sans">
      {/* Top HUD Bar */}
      <header
        className={`${
          isShortLandscape ? 'h-9 px-2' : 'h-10 sm:h-12 px-2 sm:px-4'
        } bg-slate-900/95 border-b border-slate-800 flex items-center justify-between z-30 shrink-0 backdrop-blur-md`}
      >
        {/* Left: Round & Trump Info */}
        <div className="flex items-center gap-1.5 sm:gap-3">
          <div className="flex items-center gap-1">
            <span className="text-[10px] sm:text-xs text-slate-300 font-semibold hidden md:inline">Round</span>
            <span className="font-extrabold text-amber-400 text-xs sm:text-sm">
              {room.currentRound}/{room.totalRounds}
            </span>
            <span className="text-[10px] sm:text-xs text-slate-300 font-medium">({room.cardsInRound}c)</span>
          </div>

          <div className="h-3 w-px bg-slate-700 hidden sm:block" />

          {/* Trump Badge */}
          {trumpMeta && (
            <div
              title={`Trump Suit: ${trumpMeta.english}`}
              className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-slate-800 border border-slate-700/80 shadow-sm"
            >
              <span className="text-[9px] text-slate-300 font-bold uppercase hidden lg:inline">Trump:</span>
              <span
                className={`text-sm sm:text-base font-extrabold ${
                  room.trumpSuit === 'H' || room.trumpSuit === 'D' ? 'text-red-500' : 'text-white'
                }`}
              >
                {trumpMeta.symbol}
              </span>
              <span className="text-[10px] sm:text-xs font-bold text-slate-100">{trumpMeta.english}</span>
            </div>
          )}
        </div>

        {/* Center: Status pill */}
        <div className="hidden sm:flex items-center gap-2">
          {room.phase === 'BIDDING' && (
            <span className="text-[11px] sm:text-xs font-bold text-amber-300/90 flex items-center gap-1">
              <Sparkles size={13} />
              Bidding Phase ({room.totalBidsPlaced}/{room.players.length} bids)
            </span>
          )}
          {room.phase === 'PLAYING' && (
            <span className="text-[11px] sm:text-xs font-semibold text-slate-300">
              Hand: <span className="font-bold text-emerald-400">{room.currentTrick.length}/{room.players.length} played</span>
            </span>
          )}
          {room.phase === 'TRICK_RESOLVE' && (
            <span className="text-[11px] sm:text-xs font-bold text-emerald-300 animate-pulse">
              Hand won!
            </span>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1 sm:gap-1.5">
          {/* Fullscreen Toggle */}
          <button
            onClick={onToggleFullscreen}
            aria-label={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen (Landscape)'}
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen (Landscape)'}
            className="p-1.5 sm:p-2 rounded-xl text-slate-300 hover:text-amber-400 hover:bg-slate-800 transition active:scale-95"
          >
            {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
          </button>

          <button
            onClick={onOpenRules}
            aria-label="Game Rules"
            title="Rules"
            className="p-1.5 sm:p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition hidden sm:flex"
          >
            <Info size={16} />
          </button>

          <button
            onClick={() => setShowScorecard(true)}
            aria-label="Scorecard"
            title="Scorecard"
            className="p-1.5 sm:p-2 rounded-xl text-slate-300 hover:text-amber-400 hover:bg-slate-800 transition relative"
          >
            <FileSpreadsheet size={16} />
          </button>

          <button
            onClick={() => setShowChat(!showChat)}
            aria-label="Table Chat"
            title="Chat"
            className="p-1.5 sm:p-2 rounded-xl text-slate-300 hover:text-amber-400 hover:bg-slate-800 transition relative"
          >
            <MessageSquare size={16} />
            {room.chatMessages.length > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-400" />
            )}
          </button>

          <button
            onClick={handleToggleMute}
            aria-label={isMuted ? 'Unmute sound' : 'Mute sound'}
            title={isMuted ? 'Unmute' : 'Mute'}
            className="p-1.5 sm:p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition"
          >
            {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>

          <button
            onClick={onLeaveRoom}
            aria-label="Leave Table"
            title="Leave Table"
            className="p-1.5 sm:p-2 rounded-xl text-slate-300 hover:text-rose-400 hover:bg-slate-800 transition"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* In-Game Reconnecting Banner */}
      {!isConnected && (
        <div
          data-reconnecting-banner="true"
          role="status"
          aria-live="polite"
          className="w-full shrink-0 z-30 bg-amber-500/95 border-b border-amber-300/60 text-slate-950 text-[11px] sm:text-xs font-extrabold py-0.5 sm:py-1 px-3 flex items-center justify-center gap-1.5 shadow-md"
        >
          <span className="w-2 h-2 rounded-full bg-slate-950 animate-ping" />
          <span>Reconnecting...</span>
        </div>
      )}

      {/* Main Game Arena / Felt Table */}
      <div
        className={`flex-1 relative flex flex-col items-center justify-between overflow-hidden min-h-0 ${
          isShortLandscape ? 'p-1 gap-0.5' : 'p-1 sm:p-2.5'
        }`}
      >
        {/* Felt Oval Table Surface */}
        <div
          className={`absolute felt-table felt-table-border pointer-events-none ${
            isShortLandscape
              ? 'inset-1 rounded-[24px]'
              : 'inset-1 sm:inset-3 rounded-[32px] sm:rounded-[60px]'
          }`}
        />

        {/* Short Landscape: Turn Banner + Trump Badge sit ABOVE Top Seats */}
        {isShortLandscape && (
          <div className="relative z-20 w-full flex items-center justify-center gap-2 px-2 pt-0.5 shrink-0">
            {renderTurnBanner()}
            {renderTrumpBadge()}
          </div>
        )}

        {/* Top Seats */}
        {topSeats.length > 0 && (
          <div
            data-top-seats="true"
            className={`relative z-10 flex flex-wrap items-center justify-center max-w-full px-1 shrink-0 ${
              isShortLandscape ? 'gap-1' : 'pt-0.5 sm:pt-1 gap-1 sm:gap-2'
            }`}
          >
            {topSeats.map((seat) => (
              <TableSeat
                key={seat.player.id}
                player={seat.player}
                position="top"
                isDealer={room.dealerIndex === seat.index}
                isCurrentTurn={room.currentTurnPlayerIndex === seat.index}
                isLead={room.leadPlayerIndex === seat.index}
                phase={room.phase}
                compact={isSideCompact}
                pill={isShortLandscape && topSeats.length > 2}
                turnDeadline={room.turnDeadline}
                turnTimeoutSeconds={room.settings.turnTimeoutSeconds}
              />
            ))}
          </div>
        )}

        {/* Middle Row: Left Seats, Center Battle Zone, Right Seats */}
        <div
          className={`relative z-10 w-full flex-1 flex items-center justify-between min-h-0 ${
            isShortLandscape ? 'px-1.5 gap-1' : 'px-1.5 sm:px-4 gap-1'
          }`}
        >
          {/* Left Flank */}
          <div
            data-left-seats="true"
            className="flex flex-col gap-1 sm:gap-2 items-start shrink-0"
          >
            {leftSeats.map((seat) => (
              <TableSeat
                key={seat.player.id}
                player={seat.player}
                position="left"
                isDealer={room.dealerIndex === seat.index}
                isCurrentTurn={room.currentTurnPlayerIndex === seat.index}
                isLead={room.leadPlayerIndex === seat.index}
                phase={room.phase}
                compact={isSideCompact}
                turnDeadline={room.turnDeadline}
                turnTimeoutSeconds={room.settings.turnTimeoutSeconds}
              />
            ))}
          </div>

          {/* Center Trick Playing Felt */}
          <div
            data-trick-area="true"
            className={`relative flex-1 min-w-0 flex flex-col items-center justify-center max-w-2xl w-full ${
              isShortLandscape
                ? 'p-0.5 min-h-0 h-full'
                : 'p-1 sm:p-2 min-h-[120px] sm:min-h-[180px]'
            }`}
          >
            {/* Center Background Watermark */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-10">
              <span className={`${isShortLandscape ? 'text-5xl' : 'text-7xl sm:text-8xl'} font-black text-amber-200`}>
                ♠
              </span>
            </div>

            {/* Portrait & Desktop: Non-overlapping Trump Badge + Turn Prompt Banner */}
            {!isShortLandscape && (
              <div
                className={`w-full flex items-center justify-center z-20 shrink-0 ${
                  isPortrait ? 'flex-col gap-1 mb-1' : 'flex-wrap gap-2 mb-1.5'
                }`}
              >
                {renderTrumpBadge()}
                {renderTurnBanner()}
              </div>
            )}

            {/* Active Hand Played Cards Container */}
            <div
              className={`w-full flex items-center justify-center z-10 ${
                isShortLandscape
                  ? 'min-h-[68px] py-0.5'
                  : 'min-h-[95px] sm:min-h-[130px] py-1 sm:py-2'
              }`}
            >
              {room.currentTrick.length === 0 ? (
                <div
                  className={`flex flex-col items-center justify-center text-center rounded-2xl border-2 border-dashed border-emerald-500/25 bg-emerald-950/20 max-w-xs ${
                    isShortLandscape ? 'px-3 py-1.5' : 'p-2 sm:p-3'
                  }`}
                >
                  <span className="text-emerald-300 font-bold text-[11px] sm:text-xs mb-0.5">
                    {isPlayingPhase ? 'Hand in Progress' : 'Bidding in Progress'}
                  </span>
                  <span className="text-emerald-200/50 text-[10px]">
                    {isPlayingPhase
                      ? `Waiting for ${room.players[room.leadPlayerIndex]?.name || 'Leader'} to lead hand...`
                      : 'Players are placing their judgements'}
                  </span>
                </div>
              ) : (
                <div
                  data-trick-cards="true"
                  className={`flex flex-wrap items-center justify-center max-w-full px-1 origin-center ${
                    isShortLandscape
                      ? room.currentTrick.length > 5
                        ? 'gap-1 scale-[0.82]'
                        : 'gap-1 scale-95'
                      : 'gap-1.5 sm:gap-3'
                  }`}
                >
                  {room.currentTrick.map((played: PlayedCard, idx: number) => {
                    const isWinner = currentTrickWinner?.playerId === played.playerId;
                    const isLeadCard = idx === 0;
                    const isTrumpCard = room.trumpSuit !== 'NONE' && played.card.suit === room.trumpSuit;
                    const trickCardSize =
                      isShortLandscape || (isPortrait && (leftSeats.length > 0 || numPlayers > 4)) || numPlayers > 6
                        ? 'sm'
                        : 'md';

                    return (
                      <div
                        key={played.card.id}
                        className={`flex flex-col items-center transition-all duration-200 transform animate-trick-card ${
                          isWinner ? (isShortLandscape ? 'scale-[1.02] z-20' : 'scale-105 z-20') : 'z-10'
                        }`}
                      >
                        {/* Player Name and Badges Above the Card */}
                        <div
                          className={`mb-0.5 px-1.5 py-0.2 rounded-full font-bold flex items-center gap-1 shadow-md whitespace-nowrap ${
                            isShortLandscape ? 'text-[8px]' : 'text-[9px] sm:text-[10px]'
                          } ${
                            isWinner
                              ? 'bg-amber-400 text-slate-950 ring-1 ring-amber-300'
                              : 'bg-slate-900/90 text-slate-200 border border-slate-700'
                          }`}
                        >
                          <span className={`${isShortLandscape ? 'max-w-[48px]' : 'max-w-[64px]'} truncate`}>
                            {played.playerName}
                          </span>
                          {isLeadCard && (
                            <span className="text-[7px] sm:text-[8px] bg-slate-800 text-amber-300 px-1 rounded font-normal">
                              Lead
                            </span>
                          )}
                          {isWinner && <Crown size={9} className="text-slate-950 fill-current" />}
                        </div>

                        {/* Played Card */}
                        <div className="relative">
                          <CardView
                            card={played.card}
                            size={trickCardSize}
                            isTrump={isTrumpCard}
                            className={`shadow-xl transition-all ${
                              isWinner
                                ? 'ring-2 sm:ring-3 ring-amber-400 shadow-amber-400/40'
                                : 'border-amber-600/40'
                            }`}
                          />
                        </div>

                        {/* Winning Status Badge Below the Card */}
                        {isWinner && (
                          <div
                            className={`mt-0.5 px-1.5 py-0.2 rounded-full bg-emerald-500/95 text-slate-950 font-black uppercase tracking-wider shadow ${
                              isShortLandscape ? 'text-[7px]' : 'text-[8px] sm:text-[9px]'
                            }`}
                          >
                            High Card
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Hand Resolution or Last Winner Notification */}
            {room.phase === 'TRICK_RESOLVE' && currentTrickWinner && (
              <div
                className={`mt-0.5 font-extrabold text-amber-300 bg-slate-950/90 border border-amber-400/60 px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-2xl animate-bounce z-20 ${
                  isShortLandscape ? 'text-[10px]' : 'text-[11px] sm:text-xs'
                }`}
              >
                <Crown size={12} className="text-amber-400 fill-current" />
                <span>{currentTrickWinner.playerName} wins the hand!</span>
              </div>
            )}
            {room.phase !== 'TRICK_RESOLVE' && room.lastTrickWinner && !isShortLandscape && (
              <div className="mt-1 text-[9px] sm:text-[10px] font-semibold text-emerald-300 bg-emerald-950/80 border border-emerald-500/40 px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow z-20">
                <Crown size={11} className="text-amber-400" />
                <span>Last hand won by {room.lastTrickWinner.playerName}</span>
              </div>
            )}
          </div>

          {/* Right Flank */}
          <div
            data-right-seats="true"
            className="flex flex-col gap-1 sm:gap-2 items-end shrink-0"
          >
            {rightSeats.map((seat) => (
              <TableSeat
                key={seat.player.id}
                player={seat.player}
                position="right"
                isDealer={room.dealerIndex === seat.index}
                isCurrentTurn={room.currentTurnPlayerIndex === seat.index}
                isLead={room.leadPlayerIndex === seat.index}
                phase={room.phase}
                compact={isSideCompact}
                turnDeadline={room.turnDeadline}
                turnTimeoutSeconds={room.settings.turnTimeoutSeconds}
              />
            ))}
          </div>
        </div>

        {/* Bottom Seat (Current Player Status & Hand) */}
        <div
          data-bottom-bar="true"
          className={`relative z-20 w-full flex shrink-0 ${
            isShortLandscape
              ? 'flex-row items-center justify-center gap-2 px-2 pb-1'
              : 'flex-col items-center pb-1'
          }`}
        >
          {seatBottom && (
            <div className={isShortLandscape ? 'shrink-0' : 'mb-1'}>
              <TableSeat
                player={seatBottom}
                position="bottom"
                isDealer={isDealer}
                isCurrentTurn={isMyTurn}
                isLead={room.leadPlayerIndex === myPlayerIndex}
                phase={room.phase}
                isSelf={true}
                compact={true}
                pill={isShortLandscape}
                turnDeadline={room.turnDeadline}
                turnTimeoutSeconds={room.settings.turnTimeoutSeconds}
              />
            </div>
          )}

          {/* Interactive Player Hand - clean non-overlapping card layout */}
          <div
            className={`${
              isShortLandscape ? 'min-w-0 flex justify-center' : 'w-full flex justify-center px-2 max-w-5xl'
            } items-end z-30`}
          >
            <div
              className={`flex transition-all duration-150 overflow-x-auto max-w-full scrollbar-none items-end ${
                isShortLandscape
                  ? 'gap-1 pt-2 pb-0.5 px-1'
                  : 'gap-1.5 sm:gap-2.5 md:gap-3 pt-4 pb-2 sm:pt-5 sm:pb-3 px-3 sm:px-4'
              }`}
            >
              {myHand.map((card) => {
                const isLegal = legalCardIds.has(card.id);
                const isTrumpCard = room.trumpSuit !== 'NONE' && card.suit === room.trumpSuit;

                return (
                  <div
                    key={card.id}
                    className={`transition-all duration-200 hover:z-30 shrink-0 animate-card-enter ${
                      isShortLandscape ? 'pt-1' : 'pt-2'
                    }`}
                  >
                    <CardView
                      card={card}
                      size={isShortLandscape ? 'sm' : 'lg'}
                      isPlayable={isPlayingPhase && isMyTurn && !isHandLocked}
                      isLegal={isLegal}
                      isTrump={isTrumpCard}
                      onClick={() => handleCardClick(card)}
                      className="shadow-2xl"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Bidding Modal on Player's Turn */}
      {isBiddingPhase && isMyTurn && (
        <BiddingModal
          cardsInRound={room.cardsInRound}
          forbiddenBid={room.forbiddenDealerBid}
          isDealer={isDealer}
          totalBidsSoFar={room.players
            .filter((p) => p.currentBid !== null)
            .reduce((sum, p) => sum + (p.currentBid || 0), 0)}
          onPlaceBid={handleBidSubmit}
          isSubmitting={isBidSubmitting}
          myHand={myHand}
          trumpSuit={room.trumpSuit}
        />
      )}

      {/* Round Scorecard Modal */}
      {(room.phase === 'ROUND_SUMMARY' || showScorecard) && (
        <RoundScorecardModal
          players={room.players}
          currentRound={room.currentRound}
          totalRounds={room.totalRounds}
          isHost={isHost}
          onNextRound={onReadyNextRound}
          onClose={room.phase !== 'ROUND_SUMMARY' ? () => setShowScorecard(false) : undefined}
        />
      )}

      {/* Game Over Modal */}
      {room.phase === 'GAME_OVER' && (
        <GameOverModal
          players={room.players}
          onPlayAgain={onPlayAgain}
          onReturnLobby={onLeaveRoom}
          isHost={isHost}
        />
      )}

      {/* In-Game Chat Slide-over Drawer */}
      {showChat && (
        <div className="absolute right-2 bottom-12 sm:right-6 sm:bottom-16 z-40 w-72 sm:w-96 rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl flex flex-col max-h-72 sm:max-h-96 overflow-hidden">
          <div className="p-2.5 bg-slate-800 border-b border-slate-700 flex items-center justify-between">
            <span className="font-bold text-xs text-slate-200">Table Chat</span>
            <button
              onClick={() => setShowChat(false)}
              className="text-xs text-slate-300 hover:text-white"
            >
              Close
            </button>
          </div>

          <div className="flex-1 p-2.5 overflow-y-auto space-y-1.5 max-h-44 sm:max-h-56">
            {room.chatMessages.map((msg) => (
              <div key={msg.id} className="text-xs">
                <span className="font-bold text-amber-400">{msg.sender}: </span>
                <span className="text-slate-200">{msg.text}</span>
                <span className="text-[9px] text-slate-300 ml-1.5">{msg.time}</span>
              </div>
            ))}
            {room.chatMessages.length === 0 && (
              <div className="text-xs text-slate-300 text-center py-4">No messages yet. Say hi!</div>
            )}
          </div>

          {/* Quick phrases */}
          <div className="p-1.5 border-t border-slate-800 flex gap-1 overflow-x-auto">
            {quickPhrases.map((phrase) => (
              <button
                key={phrase}
                onClick={() => onSendMessage(phrase)}
                className="px-2 py-0.5 bg-slate-800 hover:bg-slate-750 text-slate-300 text-[10px] rounded-lg shrink-0 border border-slate-700"
              >
                {phrase}
              </button>
            ))}
          </div>

          {/* Chat input form */}
          <form onSubmit={handleSendChat} className="p-1.5 bg-slate-850 flex gap-1.5 border-t border-slate-800">
            <input
              type="text"
              aria-label="Chat message"
              placeholder="Type message..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1 text-xs text-slate-100 placeholder:text-slate-300 focus:outline-none focus:border-amber-400"
            />
            <button
              type="submit"
              aria-label="Send message"
              className="p-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold"
            >
              <Send size={13} />
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
