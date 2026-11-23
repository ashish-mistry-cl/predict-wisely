import React, { useEffect, useState } from 'react';
import { GameRoomState, RoomSettings } from '../types/game';
import {
  Users,
  Play,
  PlusCircle,
  Copy,
  Check,
  Bot,
  Trash2,
  BookOpen,
  ArrowRight,
  Sparkles,
  Zap,
  RotateCcw,
  Link2,
} from 'lucide-react';

interface LobbyViewProps {
  playerName: string;
  setPlayerName: (name: string) => void;
  avatar: string;
  setAvatar: (avatar: string) => void;
  currentRoom: GameRoomState | null;
  myPlayerId: string;
  cachedRoomCode: string | null;
  isConnected?: boolean;
  errorMessage?: string | null;
  onQuickMatch: () => void;
  onCreateRoom: (settings: Partial<RoomSettings>) => void;
  onJoinRoom: (code: string) => void;
  onRejoinRecent: (code: string) => void;
  onStartGame: () => void;
  onAddBot: () => void;
  onRemoveBot: (botId: string) => void;
  onLeaveRoom: () => void;
  onOpenRules: () => void;
}

const AVATAR_OPTIONS = ['🦁', '🦅', '🐯', '⚡', '🦊', '🐺', '🦉', '🐼', '🐉', '🌸', '👑', '🔥'];

export const LobbyView: React.FC<LobbyViewProps> = ({
  playerName,
  setPlayerName,
  avatar,
  setAvatar,
  currentRoom,
  myPlayerId,
  cachedRoomCode,
  isConnected = true,
  errorMessage = null,
  onQuickMatch,
  onCreateRoom,
  onJoinRoom,
  onRejoinRecent,
  onStartGame,
  onAddBot,
  onRemoveBot,
  onLeaveRoom,
  onOpenRules,
}) => {
  const [inputCode, setInputCode] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [customRounds, setCustomRounds] = useState<5 | 8 | 13>(5);
  const [customMaxPlayers, setCustomMaxPlayers] = useState<number>(4);
  const [autoBotFill, setAutoBotFill] = useState(true);

  useEffect(() => {
    if (currentRoom) {
      setShowCreateModal(false);
      setIsCreatingRoom(false);
      setCreateError(null);
    }
  }, [currentRoom]);

  useEffect(() => {
    if (errorMessage && isCreatingRoom) {
      setIsCreatingRoom(false);
      setCreateError(errorMessage);
    }
  }, [errorMessage, isCreatingRoom]);

  useEffect(() => {
    if (!isCreatingRoom) return;
    const t = setTimeout(() => {
      setIsCreatingRoom(false);
      setCreateError('Server did not respond in time. Please try creating the room again.');
    }, 6000);
    return () => clearTimeout(t);
  }, [isCreatingRoom]);

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyInviteLink = (code: string) => {
    const url = `${window.location.origin}${window.location.pathname}?room=${code}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // If currently in a waiting room
  if (currentRoom && currentRoom.phase === 'LOBBY') {
    const isHost = currentRoom.hostId === myPlayerId;
    const canStart = currentRoom.players.length >= 2;
    const maxSeats = currentRoom.settings.maxPlayers || 4;

    return (
      <div className="flex-1 flex flex-col items-center justify-center p-3 sm:p-4 max-w-4xl mx-auto w-full">
        {/* Waiting Room Header Card */}
        <div className="w-full bg-slate-900/90 border border-slate-700/80 rounded-3xl p-5 sm:p-8 shadow-2xl backdrop-blur-md flex flex-col items-center">
          <div className="flex items-center justify-between w-full mb-6 pb-4 border-b border-slate-800">
            <div>
              <div className="text-xs text-slate-300 uppercase tracking-widest font-bold">Room Code</div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="font-mono text-3xl sm:text-4xl font-extrabold text-amber-400 tracking-wider">
                  {currentRoom.code}
                </span>
                <button
                  onClick={() => handleCopyCode(currentRoom.code)}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                  aria-label="Copy room code"
                  title="Copy room code"
                >
                  {copiedCode ? <Check size={18} className="text-emerald-400" /> : <Copy size={18} />}
                </button>
                <button
                  onClick={() => handleCopyInviteLink(currentRoom.code)}
                  className="px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-semibold flex items-center gap-1.5 border border-slate-700 transition"
                  title="Copy direct invite link for another device"
                >
                  {copiedLink ? <Check size={14} className="text-emerald-400" /> : <Link2 size={14} className="text-amber-400" />}
                  <span>{copiedLink ? 'Copied!' : 'Invite Link'}</span>
                </button>
              </div>
            </div>

            <div className="text-right">
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                {currentRoom.settings.roundCount} Rounds
              </span>
              <div className="text-xs text-slate-300 mt-1">
                Seats: <span className="text-slate-100 font-bold">{currentRoom.players.length}/{maxSeats}</span>
              </div>
            </div>
          </div>

          {/* Dynamic Seats Display for up to 10 players */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5 w-full mb-6 max-h-[50vh] overflow-y-auto pr-1">
            {Array.from({ length: maxSeats }).map((_, idx) => {
              const player = currentRoom.players[idx];
              if (player) {
                const isThisHost = currentRoom.hostId === player.id;
                const isMe = player.id === myPlayerId;

                return (
                  <div
                    key={player.id}
                    className="relative flex items-center justify-between p-2.5 rounded-2xl bg-slate-800/80 border border-slate-700"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="text-xl shrink-0">{player.avatar}</div>
                      <div className="min-w-0">
                        <div className="font-bold text-xs text-slate-100 truncate">
                          {player.name}
                        </div>
                        <div className="text-[10px] text-slate-300 flex items-center gap-1 flex-wrap">
                          {isMe && <span className="text-amber-400 font-semibold">(You)</span>}
                          {isThisHost && !isMe && <span className="text-amber-300">Host</span>}
                          {player.isBot && <span className="text-indigo-400">AI</span>}
                          {!player.isBot && !player.isConnected && (
                            <span className="text-amber-400/80">(Away)</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {isHost && player.isBot && (
                      <button
                        onClick={() => onRemoveBot(player.id)}
                        className="p-1 text-slate-300 hover:text-rose-400 hover:bg-slate-700/50 rounded-lg transition shrink-0 ml-1"
                        aria-label={`Remove bot ${player.name}`}
                        title="Remove Bot"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                );
              }

              return (
                <div
                  key={idx}
                  className="flex items-center justify-center p-3 rounded-2xl border-2 border-dashed border-slate-700/60 bg-slate-850/40 text-slate-300 text-xs font-medium"
                >
                  Seat {idx + 1}
                </div>
              );
            })}
          </div>

          {/* Host Controls */}
          {isHost ? (
            <div className="flex flex-col sm:flex-row gap-3 w-full">
              {currentRoom.players.length < maxSeats && (
                <button
                  onClick={onAddBot}
                  className="py-3 px-4 rounded-xl border border-indigo-500/40 bg-indigo-950/30 hover:bg-indigo-900/40 text-indigo-300 font-bold text-sm flex items-center justify-center gap-2 transition"
                >
                  <Bot size={18} />
                  <span>Add Smart AI Bot ({currentRoom.players.length}/{maxSeats})</span>
                </button>
              )}

              <button
                disabled={!canStart}
                onClick={onStartGame}
                className="flex-1 py-3.5 px-6 rounded-xl font-bold text-slate-950 bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-400 hover:from-amber-300 hover:to-yellow-300 shadow-xl shadow-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition active:scale-95"
              >
                <Play size={20} className="fill-current" />
                <span>{canStart ? `Start Game (${currentRoom.players.length} Players)` : 'Waiting for 2+ Players...'}</span>
              </button>
            </div>
          ) : (
            <div className="w-full text-center py-3 bg-slate-800/40 rounded-xl text-slate-300 text-sm animate-pulse">
              Waiting for the host to start the game...
            </div>
          )}

          <button
            onClick={onLeaveRoom}
            className="mt-4 text-xs text-slate-300 hover:text-rose-400 transition"
          >
            Leave Room
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 max-w-xl mx-auto w-full">
      {/* Active Match Reconnect Notice (5-minute Grace Period) */}
      {cachedRoomCode && (
        <div className="w-full mb-4 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/40 flex items-center justify-between shadow-lg animate-pulse">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-400/20 text-amber-400">
              <RotateCcw size={20} />
            </div>
            <div>
              <div className="text-xs font-bold text-amber-400 uppercase tracking-wider">Active Match Available</div>
              <div className="text-xs text-slate-200">
                Rejoin Room <span className="font-mono font-bold text-white">{cachedRoomCode}</span> seamlessly
              </div>
            </div>
          </div>
          <button
            onClick={() => onRejoinRecent(cachedRoomCode)}
            className="py-2 px-4 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md active:scale-95 transition"
          >
            <span>Rejoin Match</span>
            <ArrowRight size={14} />
          </button>
        </div>
      )}

      {/* Main Menu Box */}
      <div className="w-full bg-slate-900/90 border border-slate-700/80 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-md">
        {/* Profile Card */}
        <div className="flex items-center gap-4 mb-6 p-4 rounded-2xl bg-slate-800/60 border border-slate-700/60">
          <div className="relative group">
            <div className="w-14 h-14 rounded-2xl bg-slate-700 border border-slate-600 flex items-center justify-center text-3xl shadow-inner cursor-pointer">
              {avatar}
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <label className="text-[10px] text-slate-300 uppercase tracking-wider font-bold">
                Your Player Name
              </label>
            </div>
            <input
              type="text"
              aria-label="Your Player Name"
              value={playerName}
              maxLength={16}
              onChange={(e) => setPlayerName(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 px-3 py-1.5 rounded-xl text-slate-100 font-semibold text-sm focus:outline-none focus:border-amber-400"
            />
          </div>
        </div>

        {/* Avatar Selector Strip */}
        <div className="mb-6">
          <span className="text-[10px] text-slate-300 uppercase tracking-wider font-bold block mb-2">
            Select Avatar
          </span>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {AVATAR_OPTIONS.map((av) => (
              <button
                key={av}
                onClick={() => setAvatar(av)}
                aria-label={`Select avatar ${av}`}
                aria-pressed={avatar === av}
                className={`w-9 h-9 rounded-xl flex items-center justify-center text-xl shrink-0 transition ${
                  avatar === av
                    ? 'bg-amber-400/20 border-2 border-amber-400 scale-110'
                    : 'bg-slate-800 border border-slate-700 hover:bg-slate-700'
                }`}
              >
                {av}
              </button>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="space-y-3 mb-6">
          {/* Quick Match Button */}
          <button
            onClick={onQuickMatch}
            className="w-full py-4 px-6 rounded-2xl font-extrabold text-slate-950 bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-400 hover:from-amber-300 hover:to-yellow-300 shadow-xl shadow-amber-500/20 flex items-center justify-between active:scale-[0.98] transition group"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-slate-950/15 flex items-center justify-center">
                <Zap size={20} className="fill-current" />
              </div>
              <div className="text-left">
                <div className="text-base font-extrabold">Quick Match</div>
                <div className="text-[11px] text-slate-900/80 font-semibold">
                  Instant public matchmaking (Up to 10 players)
                </div>
              </div>
            </div>
            <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
          </button>

          {/* Create Custom Room */}
          <button
            type="button"
            onClick={() => {
              setCreateError(null);
              setIsCreatingRoom(false);
              setShowCreateModal(true);
            }}
            className="w-full py-3.5 px-5 rounded-2xl font-bold text-slate-200 bg-slate-800 hover:bg-slate-750 border border-slate-700 flex items-center justify-between active:scale-[0.98] transition"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center text-amber-400">
                <PlusCircle size={18} />
              </div>
              <div className="text-left">
                <div className="text-sm font-bold">Create Room (2-10 Players)</div>
                <div className="text-[11px] text-slate-300">Custom capacity, rounds & bot rules</div>
              </div>
            </div>
            <Sparkles size={16} className="text-amber-400" />
          </button>
        </div>

        {/* Join or Rejoin by Room Code */}
        <div className="p-4 rounded-2xl bg-slate-800/50 border border-slate-700/70 mb-6">
          <div className="flex items-center justify-between mb-2">
            <label className="text-[10px] text-slate-300 uppercase tracking-wider font-bold">
              Join with 4-Letter Room Code
            </label>
            <span className="text-[10px] text-amber-400/80 font-semibold font-mono">
              {inputCode.length}/4 Letters
            </span>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (inputCode.trim().length === 4) {
                onJoinRoom(inputCode.trim().toUpperCase());
              }
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              aria-label="4-letter room code"
              autoComplete="off"
              autoCapitalize="characters"
              placeholder="e.g. KACH"
              maxLength={4}
              value={inputCode}
              onChange={(e) => {
                const sanitized = e.target.value.replace(/[^a-zA-Z]/g, '').slice(0, 4).toUpperCase();
                setInputCode(sanitized);
              }}
              className="flex-1 bg-slate-900 border border-slate-700 px-4 py-2.5 rounded-xl text-slate-100 placeholder:text-slate-300 font-mono font-black text-lg sm:text-xl uppercase tracking-widest text-center focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
            />
            <button
              type="submit"
              disabled={inputCode.trim().length !== 4}
              className="py-2.5 px-5 rounded-xl bg-gradient-to-r from-amber-400 to-yellow-400 hover:from-amber-300 hover:to-yellow-300 disabled:opacity-30 disabled:cursor-not-allowed text-slate-950 font-black text-xs sm:text-sm tracking-wide shadow-md transition active:scale-95 flex items-center justify-center shrink-0"
              title="Enter Room"
            >
              Enter Room
            </button>
          </form>
          <div className="text-[10px] text-slate-300 mt-1.5 text-center">
            Ask the host on another device for their 4-letter code
          </div>
        </div>

        {/* Bottom Menu: Rules */}
        <div className="pt-2 border-t border-slate-800">
          <button
            onClick={onOpenRules}
            className="w-full py-2.5 px-3 rounded-xl bg-slate-800/70 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold flex items-center justify-center gap-2 border border-slate-700 transition"
          >
            <BookOpen size={16} className="text-emerald-400" />
            <span>Game Rules</span>
          </button>
        </div>
      </div>

      {/* Create Room Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-md rounded-3xl bg-slate-900 border border-slate-700 p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-slate-100 mb-1">Create Match Room</h3>
            <p className="text-xs text-slate-300 mb-5">Customize match length and player capacity (2-10 players)</p>

            {/* Player Capacity (2 to 10 players) */}
            <div className="mb-5">
              <label className="text-xs font-semibold text-slate-300 block mb-2">
                Max Players: <span className="text-amber-400 font-bold">{customMaxPlayers} Players</span>
              </label>
              <div className="grid grid-cols-5 gap-1.5">
                {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                  <button
                    key={num}
                    onClick={() => setCustomMaxPlayers(num)}
                    className={`py-2 rounded-xl border text-center font-bold text-xs transition ${
                      customMaxPlayers === num
                        ? 'bg-amber-400/20 border-amber-400 text-amber-300 ring-1 ring-amber-400'
                        : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-750'
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>

            {/* Match Length Selection */}
            <div className="mb-5">
              <label className="text-xs font-semibold text-slate-300 block mb-2">Round Count</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { count: 5, label: '5 Rounds', desc: 'Quick' },
                  { count: 8, label: '8 Rounds', desc: 'Standard' },
                  { count: 13, label: '13 Rounds', desc: 'Classic' },
                ].map((item) => (
                  <button
                    key={item.count}
                    onClick={() => setCustomRounds(item.count as 5 | 8 | 13)}
                    className={`p-3 rounded-xl border text-center transition ${
                      customRounds === item.count
                        ? 'bg-amber-400/20 border-amber-400 text-amber-300 ring-1 ring-amber-400'
                        : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-750'
                    }`}
                  >
                    <div className="font-bold text-sm">{item.label}</div>
                    <div className="text-[10px] text-slate-300">{item.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Smart AI Bot Backfill Toggle */}
            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-800/60 border border-slate-700 mb-6">
              <div>
                <div className="text-xs font-bold text-slate-200">Auto-Fill Empty Seats with Bots</div>
                <div className="text-[10px] text-slate-300">Fills up to {customMaxPlayers} seats when starting</div>
              </div>
              <input
                type="checkbox"
                aria-label="Auto-fill empty seats with bots"
                checked={autoBotFill}
                onChange={(e) => setAutoBotFill(e.target.checked)}
                className="w-5 h-5 accent-amber-400 cursor-pointer"
              />
            </div>

            {(createError || (!isConnected && isCreatingRoom)) && (
              <div className="mb-4 px-3 py-2 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-200 text-xs">
                {createError || 'Connecting to game server...'}
              </div>
            )}

            {/* Actions */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={isCreatingRoom}
                onClick={() => {
                  setCreateError(null);
                  setShowCreateModal(false);
                }}
                className="py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-40 font-bold text-xs transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isCreatingRoom}
                onClick={() => {
                  setCreateError(null);
                  setIsCreatingRoom(true);
                  onCreateRoom({
                    roundCount: customRounds,
                    maxPlayers: customMaxPlayers,
                    autoBotFill,
                  });
                }}
                className="py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 disabled:opacity-60 text-slate-950 font-bold text-xs transition"
              >
                {isCreatingRoom ? 'Creating Room...' : 'Create Room'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
