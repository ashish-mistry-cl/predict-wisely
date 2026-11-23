import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, GameRoomState, RoomSettings } from './types/game';
import { LobbyView } from './components/LobbyView';
import { GameTable } from './components/GameTable';
import { RulesModal } from './components/RulesModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { sound } from './utils/audio';
import { AlertCircle, Volume2, VolumeX, BookOpen } from 'lucide-react';

const getSessionTokenKey = (code: string) =>
  `kachuful_token_${code.replace(/[^a-zA-Z]/g, '').toUpperCase()}`;

const getStoredToken = (code?: string | null): string | undefined => {
  if (!code) return undefined;
  const clean = code.replace(/[^a-zA-Z]/g, '').toUpperCase();
  if (!clean) return undefined;
  return localStorage.getItem(getSessionTokenKey(clean)) || undefined;
};

const setStoredToken = (code: string, token: string) => {
  const clean = code.replace(/[^a-zA-Z]/g, '').toUpperCase();
  if (!clean || !token) return;
  localStorage.setItem(getSessionTokenKey(clean), token);
};

const removeStoredToken = (code?: string | null) => {
  if (!code) return;
  const clean = code.replace(/[^a-zA-Z]/g, '').toUpperCase();
  if (!clean) return;
  localStorage.removeItem(getSessionTokenKey(clean));
};

export default function App() {
  const [playerName, setPlayerName] = useState(() => {
    return localStorage.getItem('kachuful_name') || `Player_${Math.floor(100 + Math.random() * 900)}`;
  });
  const [avatar, setAvatar] = useState(() => {
    return localStorage.getItem('kachuful_avatar') || '🦁';
  });
  const [playerId] = useState(() => {
    const saved = localStorage.getItem('kachuful_player_id');
    if (saved) return saved;
    const newId = `p-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    localStorage.setItem('kachuful_player_id', newId);
    return newId;
  });

  const [cachedRoomCode, setCachedRoomCode] = useState<string | null>(() => {
    return localStorage.getItem('kachuful_room_code');
  });

  const [room, setRoom] = useState<GameRoomState | null>(null);
  const [myHand, setMyHand] = useState<Card[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [isMuted, setIsMuted] = useState(sound.getMuted());
  const [isConnected, setIsConnected] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const handleToggleFullscreen = () => {
    try {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.().catch(() => {});
      } else {
        document.exitFullscreen?.().catch(() => {});
      }
    } catch {
      // In case of iframe permissions policy or unsupported browser
    }
  };

  const RECONNECT_BACKOFF_MS = [500, 1000, 2000, 5000] as const;

  const [isHandLocked, setIsHandLocked] = useState(false);
  const [isBidSubmitting, setIsBidSubmitting] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const lastSeenRoomSeqRef = useRef<{ code: string; seq: number } | null>(null);
  const pendingPlayRef = useRef<{ card: Card; prevHand: Card[] } | null>(null);
  const pendingMessagesRef = useRef<object[]>([]);
  const playerNameRef = useRef(playerName);
  const avatarRef = useRef(avatar);
  const roomRef = useRef(room);
  const myHandRef = useRef(myHand);
  const pendingSessionTokenRef = useRef<string | null>(null);

  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  useEffect(() => {
    myHandRef.current = myHand;
  }, [myHand]);

  // Sync profile storage
  useEffect(() => {
    playerNameRef.current = playerName;
    localStorage.setItem('kachuful_name', playerName);
    avatarRef.current = avatar;
    localStorage.setItem('kachuful_avatar', avatar);
  }, [playerName, avatar]);

  // Connect WebSocket
  const connectWebSocket = useCallback(() => {
    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    const configuredWsUrl = (import.meta.env.VITE_WS_URL || '').trim();
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = configuredWsUrl || `${protocol}//${host}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (wsRef.current !== ws) return;
      reconnectAttemptRef.current = 0;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      setIsConnected(true);

      // Check for direct ?room=XXXX invite link first
      const params = new URLSearchParams(window.location.search);
      const inviteCode = params.get('room')?.replace(/[^a-zA-Z]/g, '').toUpperCase();
      if (inviteCode && inviteCode.length === 4) {
        pendingMessagesRef.current = [];
        pendingSessionTokenRef.current = null;
        const inviteToken = getStoredToken(inviteCode);
        ws.send(
          JSON.stringify({
            type: 'JOIN_LOBBY',
            playerName: playerNameRef.current,
            avatar: avatarRef.current,
            playerId,
            roomCode: inviteCode,
            ...(inviteToken ? { token: inviteToken } : {}),
          })
        );
        // Clean URL param so refreshing later doesn't re-trigger old invite
        window.history.replaceState({}, '', window.location.pathname);
        return;
      }

      const queued = [...pendingMessagesRef.current];
      pendingMessagesRef.current = [];

      const hasSessionBindMsg = queued.some(
        (m: any) => m?.type === 'JOIN_LOBBY' || m?.type === 'REJOIN_GAME'
      );

      // Ensure socket is bound to active room BEFORE flushing any queued PLAY_CARD / PLACE_BID messages
      const activeCode = roomRef.current?.code || localStorage.getItem('kachuful_room_code');
      if (activeCode && !hasSessionBindMsg) {
        const storedToken = getStoredToken(activeCode);
        ws.send(
          JSON.stringify({
            type: 'REJOIN_GAME',
            roomCode: activeCode,
            playerId,
            ...(storedToken ? { token: storedToken } : {}),
            playerName: playerNameRef.current,
            isSilentProbe: !roomRef.current,
          })
        );
      }

      queued.forEach((msg) => {
        ws.send(JSON.stringify(msg));
      });
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        switch (data.type) {
          case 'SESSION': {
            const token = typeof data.token === 'string' ? data.token : '';
            if (!token) break;
            const activeCode = roomRef.current?.code || localStorage.getItem('kachuful_room_code');
            if (activeCode) {
              setStoredToken(activeCode, token);
              pendingSessionTokenRef.current = null;
            } else {
              pendingSessionTokenRef.current = token;
            }
            break;
          }
          case 'ROOM_UPDATE': {
            const nextRoom: GameRoomState = data.room;
            const nextSeq = typeof nextRoom?.seq === 'number' ? nextRoom.seq : 0;
            const lastSeen = lastSeenRoomSeqRef.current;
            if (lastSeen && lastSeen.code === nextRoom.code && nextSeq <= lastSeen.seq) {
              break;
            }
            lastSeenRoomSeqRef.current = { code: nextRoom.code, seq: nextSeq };
            pendingPlayRef.current = null;
            setIsHandLocked(false);
            setIsBidSubmitting(false);
            roomRef.current = nextRoom;
            setRoom(nextRoom);
            if (data.myHand) {
              setMyHand(data.myHand);
            }
            if (nextRoom.code) {
              setCachedRoomCode(nextRoom.code);
              localStorage.setItem('kachuful_room_code', nextRoom.code);
              if (pendingSessionTokenRef.current) {
                setStoredToken(nextRoom.code, pendingSessionTokenRef.current);
                pendingSessionTokenRef.current = null;
              }
            }
            break;
          }
          case 'REJOIN_FAILED': {
            const activeCode = roomRef.current?.code;
            if (activeCode && data.roomCode && data.roomCode !== activeCode) {
              break;
            }
            const failedCode = data.roomCode || activeCode || localStorage.getItem('kachuful_room_code');
            removeStoredToken(failedCode);
            const wasViewingRoom = !!roomRef.current;
            lastSeenRoomSeqRef.current = null;
            pendingPlayRef.current = null;
            setIsHandLocked(false);
            setIsBidSubmitting(false);
            roomRef.current = null;
            setRoom(null);
            setMyHand([]);
            setCachedRoomCode(null);
            localStorage.removeItem('kachuful_room_code');
            if (!data.isSilent || wasViewingRoom) {
              setErrorMessage(data.message || 'Room expired or ended. Please create or join a room.');
              setTimeout(() => setErrorMessage(null), 4000);
            }
            break;
          }
          case 'ERROR': {
            if (pendingPlayRef.current) {
              const pending = pendingPlayRef.current;
              pendingPlayRef.current = null;
              setIsHandLocked(false);
              setMyHand((prev) =>
                prev.some((c) => c.id === pending.card.id) ? prev : pending.prevHand
              );
            }
            setIsBidSubmitting(false);
            setErrorMessage(data.message);
            setTimeout(() => setErrorMessage(null), 5000);
            break;
          }
        }
      } catch {
        // message parse error
      }
    };

    ws.onclose = () => {
      if (wsRef.current !== ws) return;
      setIsConnected(false);
      wsRef.current = null;
      const attempt = reconnectAttemptRef.current;
      const delay = RECONNECT_BACKOFF_MS[Math.min(attempt, RECONNECT_BACKOFF_MS.length - 1)];
      reconnectAttemptRef.current = Math.min(attempt + 1, RECONNECT_BACKOFF_MS.length - 1);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = setTimeout(() => {
        reconnectTimeoutRef.current = null;
        connectWebSocket();
      }, delay);
    };

    ws.onerror = () => {
      if (wsRef.current !== ws) return;
      setIsConnected(false);
      ws.close();
    };
  }, [playerId]);

  useEffect(() => {
    connectWebSocket();

    const reconnectImmediately = () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      connectWebSocket();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        reconnectImmediately();
      }
    };

    const handleOnline = () => {
      reconnectImmediately();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        const oldWs = wsRef.current;
        wsRef.current = null;
        oldWs.close();
      }
    };
  }, [connectWebSocket]);

  const sendWs = (msg: object) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify(msg));
        return;
      } catch {
        // Fall through to queue and reconnect if send failed mid-close
      }
    }
    pendingMessagesRef.current.push(msg);
    connectWebSocket();
  };

  // Lobby actions
  const handleQuickMatch = () => {
    pendingSessionTokenRef.current = null;
    lastSeenRoomSeqRef.current = null;
    sendWs({
      type: 'JOIN_LOBBY',
      playerName,
      avatar,
      playerId,
      isQuickMatch: true,
    });
  };

  const handleCreateRoom = (settings: Partial<RoomSettings>) => {
    pendingSessionTokenRef.current = null;
    lastSeenRoomSeqRef.current = null;
    sendWs({
      type: 'JOIN_LOBBY',
      playerName,
      avatar,
      playerId,
      customSettings: settings,
    });
  };

  const handleJoinRoom = (code: string) => {
    pendingSessionTokenRef.current = null;
    lastSeenRoomSeqRef.current = null;
    const cleanCode = code.trim().toUpperCase();
    const token = getStoredToken(cleanCode);
    sendWs({
      type: 'JOIN_LOBBY',
      playerName,
      avatar,
      playerId,
      roomCode: cleanCode,
      ...(token ? { token } : {}),
    });
  };

  const handleRejoinRecent = (code: string) => {
    const cleanCode = code.replace(/[^a-zA-Z]/g, '').toUpperCase();
    const token = getStoredToken(cleanCode);
    sendWs({
      type: 'REJOIN_GAME',
      roomCode: cleanCode,
      playerId,
      ...(token ? { token } : {}),
      playerName,
      isSilentProbe: false,
    });
  };

  const handleStartGame = () => {
    if (!room) return;
    sendWs({
      type: 'START_GAME',
      roomCode: room.code,
    });
  };

  const handleAddBot = () => {
    if (!room) return;
    sendWs({
      type: 'ADD_BOT',
      roomCode: room.code,
    });
  };

  const handleRemoveBot = (botId: string) => {
    if (!room) return;
    sendWs({
      type: 'REMOVE_BOT',
      roomCode: room.code,
      botId,
    });
  };

  const handleLeaveRoom = () => {
    if (room) {
      if (room.phase === 'LOBBY') {
        removeStoredToken(room.code);
      }
      sendWs({
        type: 'LEAVE_ROOM',
        roomCode: room.code,
      });
    }
    pendingSessionTokenRef.current = null;
    lastSeenRoomSeqRef.current = null;
    pendingPlayRef.current = null;
    setIsHandLocked(false);
    setIsBidSubmitting(false);
    roomRef.current = null;
    setRoom(null);
    setMyHand([]);
    setCachedRoomCode(null);
    localStorage.removeItem('kachuful_room_code');
  };

  // Table In-Game actions
  const handlePlaceBid = (bid: number) => {
    if (!room || isBidSubmitting) return;
    setIsBidSubmitting(true);
    sendWs({
      type: 'PLACE_BID',
      roomCode: room.code,
      bid,
    });
  };

  const handlePlayCard = (cardId: string) => {
    if (!room || pendingPlayRef.current) return;
    const prevHand = myHandRef.current;
    const playedCard = prevHand.find((c) => c.id === cardId);
    if (playedCard) {
      pendingPlayRef.current = { card: playedCard, prevHand };
      setIsHandLocked(true);
      setMyHand((prev) => prev.filter((c) => c.id !== cardId));
    }
    sendWs({
      type: 'PLAY_CARD',
      roomCode: room.code,
      cardId,
    });
  };

  const handleReadyNextRound = () => {
    if (!room) return;
    sendWs({
      type: 'READY_NEXT_ROUND',
      roomCode: room.code,
    });
  };

  const handlePlayAgain = () => {
    if (!room) return;
    sendWs({
      type: 'START_GAME',
      roomCode: room.code,
    });
  };

  const handleSendMessage = (text: string) => {
    if (!room) return;
    sendWs({
      type: 'CHAT_MESSAGE',
      roomCode: room.code,
      text,
    });
  };

  const toggleSound = () => {
    const next = sound.toggleMute();
    setIsMuted(next);
  };

  const handleBoundaryReconnect = () => {
    const code = room?.code || cachedRoomCode || localStorage.getItem('kachuful_room_code');
    setRoom(null);
    setMyHand([]);
    if (code) {
      const cleanCode = code.replace(/[^a-zA-Z]/g, '').toUpperCase();
      const token = getStoredToken(cleanCode);
      sendWs({
        type: 'REJOIN_GAME',
        roomCode: cleanCode,
        playerId,
        ...(token ? { token } : {}),
        playerName,
        isSilentProbe: false,
      });
    } else {
      connectWebSocket();
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none overflow-x-hidden">
      {/* Toast Notification */}
      {errorMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-rose-950/90 border border-rose-500 px-4 py-2.5 rounded-2xl text-rose-200 text-xs shadow-2xl backdrop-blur-md animate-bounce">
          <AlertCircle size={16} className="text-rose-400 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Top Navbar when in Lobby */}
      {(!room || room.phase === 'LOBBY') && (
        <header className="h-16 border-b border-slate-800 bg-slate-900/60 backdrop-blur-md px-4 sm:px-8 flex items-center justify-between z-20 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-yellow-300 flex items-center justify-center text-slate-950 font-black shadow-lg shadow-amber-500/20">
              <span className="font-display font-extrabold text-lg">K</span>
            </div>
            <div>
              <h1 className="font-display font-extrabold text-base sm:text-lg tracking-wide text-slate-100 flex items-center gap-1.5">
                <span>KACHUFUL</span>
                <span className="text-amber-400 text-xs sm:text-sm font-sans font-bold">Judgement</span>
              </h1>
              <div className="flex items-center gap-2 text-[10px] text-slate-400 font-semibold tracking-wider">
                <span className="text-slate-200">♠</span> Ka
                <span className="text-rose-500">♦</span> Chu
                <span className="text-slate-200">♣</span> Fu
                <span className="text-rose-500">♥</span> La
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Server Connection Status */}
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                isConnected
                  ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300'
                  : 'bg-amber-950/50 border-amber-500/40 text-amber-300 animate-pulse'
              }`}
              title={isConnected ? 'Connected to Game Server' : 'Connecting to Server...'}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isConnected ? 'bg-emerald-400' : 'bg-amber-400 animate-ping'
                }`}
              />
              <span className="hidden sm:inline">{isConnected ? 'Server Live' : 'Connecting...'}</span>
            </div>

            <button
              onClick={() => setShowRules(true)}
              className="p-2 sm:px-3 sm:py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-750 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 border border-slate-700 transition"
              title="Game Rules"
            >
              <BookOpen size={16} className="text-emerald-400" />
              <span className="hidden sm:inline">Rules</span>
            </button>

            <button
              onClick={toggleSound}
              className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-700 transition"
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
          </div>
        </header>
      )}

      {/* Main Container wrapped in ErrorBoundary */}
      <ErrorBoundary onReconnect={handleBoundaryReconnect}>
        <main className="flex-1 flex flex-col relative">
          {!room || room.phase === 'LOBBY' ? (
            <LobbyView
              playerName={playerName}
              setPlayerName={setPlayerName}
              avatar={avatar}
              setAvatar={setAvatar}
              currentRoom={room}
              myPlayerId={playerId}
              cachedRoomCode={cachedRoomCode}
              isConnected={isConnected}
              errorMessage={errorMessage}
              onQuickMatch={handleQuickMatch}
              onCreateRoom={handleCreateRoom}
              onJoinRoom={handleJoinRoom}
              onRejoinRecent={handleRejoinRecent}
              onStartGame={handleStartGame}
              onAddBot={handleAddBot}
              onRemoveBot={handleRemoveBot}
              onLeaveRoom={handleLeaveRoom}
              onOpenRules={() => setShowRules(true)}
            />
          ) : (
            <GameTable
              room={room}
              myPlayerId={playerId}
              myHand={myHand}
              isConnected={isConnected}
              isHandLocked={isHandLocked}
              isBidSubmitting={isBidSubmitting}
              isFullscreen={isFullscreen}
              onToggleFullscreen={handleToggleFullscreen}
              onPlaceBid={handlePlaceBid}
              onPlayCard={handlePlayCard}
              onReadyNextRound={handleReadyNextRound}
              onPlayAgain={handlePlayAgain}
              onLeaveRoom={handleLeaveRoom}
              onSendMessage={handleSendMessage}
              onOpenRules={() => setShowRules(true)}
            />
          )}
        </main>
      </ErrorBoundary>

      {/* Rules Modal */}
      {showRules && (
        <RulesModal onClose={() => setShowRules(false)} />
      )}
    </div>
  );
}
