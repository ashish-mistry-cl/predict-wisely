import 'dotenv/config';
import express from 'express';
import http from 'http';
import helmet from 'helmet';
import compression from 'compression';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import {
  Card,
  GameRoomState,
  Player,
  RoomSettings,
  TRUMP_CYCLE,
} from './src/types/game.js';
import {
  calculateForbiddenDealerBid,
  calculateRoundPoints,
  createDeck,
  evaluateBotBid,
  evaluateTrickWinner,
  getLegalCards,
  selectBotCardToPlay,
  shuffleDeck,
} from './src/utils/gameRules.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '3000', 10);
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim().replace(/\/+$/, ''))
  .filter(Boolean);
const allowedOriginWsEntries = allowedOrigins.flatMap((origin) => {
  const entries = [origin];
  if (origin.startsWith('https://')) {
    entries.push(`wss://${origin.slice('https://'.length)}`);
  } else if (origin.startsWith('http://')) {
    entries.push(`ws://${origin.slice('http://'.length)}`);
  }
  return entries;
});

const getSameOriginHost = (req: http.IncomingMessage): string => {
  const forwardedHost = req.headers['x-forwarded-host'];
  const rawHost = Array.isArray(forwardedHost)
    ? forwardedHost[0]
    : forwardedHost || req.headers.host || '';
  const candidate = rawHost.split(',')[0].trim();
  return /^(\[[a-fA-F0-9:]+\]|[a-zA-Z0-9.-]+)(:\d+)?$/.test(candidate) ? candidate : '';
};

const app = express();
app.disable('x-powered-by');
app.use(compression());
app.use(
  helmet({
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    xFrameOptions: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: [
          "'self'",
          (req) => {
            const host = getSameOriginHost(req);
            return host ? `ws://${host} wss://${host}` : 'ws: wss:';
          },
          ...allowedOriginWsEntries,
        ],
        frameAncestors: [
          "'self'",
          'https://aistudio.google.com',
          'https://*.google.com',
          'https://*.googleusercontent.com',
          ...allowedOrigins,
        ],
        upgradeInsecureRequests: null,
      },
    },
  })
);
app.use(express.json());

function getClientIp(req: http.IncomingMessage): string {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim().length > 0) {
    const first = xff.split(',')[0].trim();
    if (first) return first;
  } else if (Array.isArray(xff) && xff.length > 0) {
    const first = xff[0].split(',')[0].trim();
    if (first) return first;
  }
  return req.socket?.remoteAddress || 'unknown';
}

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
const openConnectionsByIp = new Map<string, Set<ExtWebSocket>>();
const roomCreateTimestampsByIp = new Map<string, number[]>();

// Safe execution wrapper for message handlers and timer bodies
function safe<T extends (...args: any[]) => any>(
  fn: T,
  context = 'anonymous'
): (...args: Parameters<T>) => ReturnType<T> | undefined {
  return (...args: Parameters<T>) => {
    try {
      return fn(...args);
    } catch (err) {
      console.error(`[SAFE_HANDLER ERROR in ${context}]:`, err);
      return undefined;
    }
  };
}

// Log-only process error handlers (prevent server crashes)
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION - LOG ONLY]:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION - LOG ONLY]:', reason);
});

export interface ExtWebSocket extends WebSocket {
  isAlive?: boolean;
  boundPlayerId?: string | null;
  boundRoomCode?: string | null;
  clientIp?: string;
}

// Server State
interface InternalRoom {
  state: GameRoomState;
  hands: Map<string, Card[]>; // playerId -> private hand
  connections: Map<string, ExtWebSocket>; // local playerId -> ws
  playerTokens: Map<string, string>; // playerId -> secret session token (never broadcast or logged)
  botTimer?: NodeJS.Timeout;
  turnTimer?: NodeJS.Timeout;
  roundSummaryTimer?: NodeJS.Timeout;
}

const rooms = new Map<string, InternalRoom>();

function deleteLocalRoom(code: string) {
  const room = rooms.get(code);
  if (room) {
    if (room.botTimer) clearTimeout(room.botTimer);
    if (room.turnTimer) clearTimeout(room.turnTimer);
    if (room.roundSummaryTimer) clearTimeout(room.roundSummaryTimer);
    rooms.delete(code);
  }
}

// If host leaves or is disconnected > 20s, migrate hostId to first connected human
function checkAndMigrateHost(room: InternalRoom) {
  const currentHost = room.state.players.find((p) => p.id === room.state.hostId);
  const now = Date.now();
  const hostIsDisconnectedLong =
    !currentHost ||
    (!currentHost.isConnected && currentHost.disconnectedAt && now - currentHost.disconnectedAt > 20000);

  if (hostIsDisconnectedLong) {
    const firstConnectedHuman = room.state.players.find((p) => !p.isBot && p.isConnected);
    if (firstConnectedHuman && firstConnectedHuman.id !== room.state.hostId) {
      console.log(
        `[HOST MIGRATION] Migrating host in room ${room.state.code} to ${firstConnectedHuman.name} (${firstConnectedHuman.id})`
      );
      room.state.hostId = firstConnectedHuman.id;
    }
  }
}

// Delete a LOBBY room when it has no human players
function cleanLobbyIfNoHumans(room: InternalRoom): boolean {
  if (room.state.phase === 'LOBBY') {
    const hasHumans = room.state.players.some((p) => !p.isBot);
    if (!hasHumans) {
      console.log(`[LOBBY] Room ${room.state.code} has no human players, deleting.`);
      deleteLocalRoom(room.state.code);
      return true;
    }
  }
  return false;
}

// 10 Bot Names & Avatars
const BOT_PROFILES = [
  { name: 'Arjun (AI)', avatar: '🤖' },
  { name: 'Priya (AI)', avatar: '🦾' },
  { name: 'Karan (AI)', avatar: '🧠' },
  { name: 'Meera (AI)', avatar: '💻' },
  { name: 'Kabir (AI)', avatar: '🦁' },
  { name: 'Ananya (AI)', avatar: '🦉' },
  { name: 'Rohan (AI)', avatar: '🐺' },
  { name: 'Riya (AI)', avatar: '🦊' },
  { name: 'Dev (AI)', avatar: '🐼' },
  { name: 'Zara (AI)', avatar: '🌸' },
];

function generateRoomCode(): string | null {
  // 4 letters only: clear alphabet (excluding I and O to avoid confusion with 1 and 0)
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (let attempts = 0; attempts < 100; attempts++) {
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += letters.charAt(Math.floor(Math.random() * letters.length));
    }
    if (!rooms.has(code)) {
      return code;
    }
  }
  return null;
}

// Case-insensitive, whitespace-trimmed, letter-only room search
function findRoom(code?: string): InternalRoom | undefined {
  if (!code) return undefined;
  const clean = code.toString().replace(/[^a-zA-Z]/g, '').toUpperCase();
  if (!clean) return undefined;
  if (rooms.has(clean)) return rooms.get(clean);
  for (const [key, val] of rooms.entries()) {
    if (key.replace(/[^a-zA-Z]/g, '').toUpperCase() === clean) {
      return val;
    }
  }
  return undefined;
}

function broadcastRoom(room: InternalRoom) {
  room.state.seq = (room.state.seq ?? 0) + 1;
  const roomState = room.state;

  // Send to local WebSocket connections
  room.connections.forEach((ws, playerId) => {
    if (ws.readyState === WebSocket.OPEN) {
      const myHand = room.hands.get(playerId) || [];
      ws.send(
        JSON.stringify({
          type: 'ROOM_UPDATE',
          room: roomState,
          myPlayerId: playerId,
          myHand,
        })
      );
    }
  });
}

function sendToPlayer(room: InternalRoom, playerId: string, data: object) {
  const ws = room.connections.get(playerId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function clearTurnTimers(room: InternalRoom) {
  clearTimeout(room.botTimer);
  clearTimeout(room.turnTimer);
  room.state.turnDeadline = null;
}

function startRound(room: InternalRoom) {
  clearTimeout(room.roundSummaryTimer);
  clearTurnTimers(room);

  const state = room.state;
  state.phase = 'BIDDING';
  state.cardsInRound = state.currentRound;

  const trumpIndex = (state.currentRound - 1) % TRUMP_CYCLE.length;
  state.trumpSuit = TRUMP_CYCLE[trumpIndex];

  state.dealerIndex = (state.currentRound - 1) % state.players.length;
  state.leadPlayerIndex = (state.dealerIndex + 1) % state.players.length;
  state.currentTurnPlayerIndex = state.leadPlayerIndex;

  state.currentTrick = [];
  state.lastTrickWinner = undefined;
  state.forbiddenDealerBid = null;
  state.totalBidsPlaced = 0;

  state.players.forEach((p) => {
    p.currentBid = null;
    p.tricksWon = 0;
    p.cardCount = state.cardsInRound;
  });

  const totalCardsNeeded = state.players.length * state.cardsInRound;
  const deckCount = Math.max(1, Math.ceil(totalCardsNeeded / 52));
  const deck = shuffleDeck(createDeck(deckCount));
  state.players.forEach((player, idx) => {
    const hand = deck.slice(idx * state.cardsInRound, (idx + 1) * state.cardsInRound);
    hand.sort((a, b) => {
      if (a.suit !== b.suit) return a.suit.localeCompare(b.suit);
      return b.rank - a.rank;
    });
    room.hands.set(player.id, hand);
  });

  updateDealerForbiddenBid(room);
  triggerNextTurnBotIfNeeded(room);
  broadcastRoom(room);
}

function updateDealerForbiddenBid(room: InternalRoom) {
  const state = room.state;
  const bidsSoFar = state.players
    .filter((_p, i) => i !== state.dealerIndex && _p.currentBid !== null)
    .map((p) => p.currentBid as number);

  if (bidsSoFar.length === state.players.length - 1) {
    state.forbiddenDealerBid = calculateForbiddenDealerBid(state.cardsInRound, bidsSoFar);
  } else {
    state.forbiddenDealerBid = null;
  }
}

function handleBidPlaced(room: InternalRoom, playerId: string, bid: number) {
  const state = room.state;
  if (state.phase !== 'BIDDING') return;

  const currentPlayer = state.players[state.currentTurnPlayerIndex];
  if (!currentPlayer || currentPlayer.id !== playerId) return;

  if (!Number.isInteger(bid) || bid < 0 || bid > state.cardsInRound) return;

  if (state.currentTurnPlayerIndex === state.dealerIndex) {
    if (state.forbiddenDealerBid !== null && bid === state.forbiddenDealerBid) {
      sendToPlayer(room, playerId, {
        type: 'ERROR',
        message: `Forbidden dealer bid! The sum of all bids cannot equal total tricks (${state.cardsInRound}).`,
      });
      return;
    }
  }

  clearTurnTimers(room);

  currentPlayer.currentBid = bid;
  state.totalBidsPlaced += 1;

  if (state.totalBidsPlaced >= state.players.length) {
    state.phase = 'PLAYING';
    state.currentTurnPlayerIndex = state.leadPlayerIndex;
    triggerNextTurnBotIfNeeded(room);
    broadcastRoom(room);
  } else {
    state.currentTurnPlayerIndex = (state.currentTurnPlayerIndex + 1) % state.players.length;
    updateDealerForbiddenBid(room);
    triggerNextTurnBotIfNeeded(room);
    broadcastRoom(room);
  }
}

function handleCardPlayed(room: InternalRoom, playerId: string, cardId: string) {
  const state = room.state;
  if (state.phase !== 'PLAYING') return;

  const currentPlayer = state.players[state.currentTurnPlayerIndex];
  if (!currentPlayer || currentPlayer.id !== playerId) return;

  const playerHand = room.hands.get(playerId) || [];
  const card = playerHand.find((c) => c.id === cardId);
  if (!card) return;

  const legalCards = getLegalCards(playerHand, state.currentTrick);
  const isLegal = legalCards.some((c) => c.id === cardId);
  if (!isLegal) {
    sendToPlayer(room, playerId, {
      type: 'ERROR',
      message: `Illegal card! You must follow the lead suit (${state.currentTrick[0].card.suit}) if you have it.`,
    });
    return;
  }

  clearTurnTimers(room);

  const newHand = playerHand.filter((c) => c.id !== cardId);
  room.hands.set(playerId, newHand);
  currentPlayer.cardCount = newHand.length;

  state.currentTrick.push({
    playerId,
    card,
    playerName: currentPlayer.name,
  });

  if (state.currentTrick.length === state.players.length) {
    state.phase = 'TRICK_RESOLVE';
    broadcastRoom(room);

    setTimeout(
      safe(() => {
        resolveTrick(room);
      }, 'resolveTrickTimeout'),
      1400
    );
  } else {
    state.currentTurnPlayerIndex = (state.currentTurnPlayerIndex + 1) % state.players.length;
    triggerNextTurnBotIfNeeded(room);
    broadcastRoom(room);
  }
}

function resolveTrick(room: InternalRoom) {
  const state = room.state;
  if (state.currentTrick.length === 0) return;

  const winner = evaluateTrickWinner(state.currentTrick, state.trumpSuit);

  const winningPlayer = state.players.find((p) => p.id === winner.playerId);
  if (winningPlayer) {
    winningPlayer.tricksWon += 1;
  }

  state.lastTrickWinner = {
    playerId: winner.playerId,
    playerName: winner.playerName,
    trick: [...state.currentTrick],
  };

  const winnerIndex = state.players.findIndex((p) => p.id === winner.playerId);
  state.currentTurnPlayerIndex = winnerIndex >= 0 ? winnerIndex : 0;
  state.leadPlayerIndex = state.currentTurnPlayerIndex;
  state.currentTrick = [];

  const remainingCards = room.hands.get(state.players[0].id)?.length ?? 0;

  if (remainingCards === 0) {
    clearTurnTimers(room);
    state.players.forEach((player) => {
      const bid = player.currentBid ?? 0;
      const won = player.tricksWon;
      const points = calculateRoundPoints(bid, won);
      player.totalScore += points;

      player.scoreHistory.push({
        round: state.currentRound,
        bid,
        won,
        points,
        totalScore: player.totalScore,
      });
    });

    if (state.currentRound >= state.totalRounds) {
      state.phase = 'GAME_OVER';
      broadcastRoom(room);
    } else {
      state.phase = 'ROUND_SUMMARY';
      clearTimeout(room.roundSummaryTimer);
      const completedRound = state.currentRound;
      room.roundSummaryTimer = setTimeout(
        safe(() => {
          if (room.state.phase === 'ROUND_SUMMARY' && room.state.currentRound === completedRound) {
            room.state.currentRound += 1;
            startRound(room);
          }
        }, 'roundSummaryAutoAdvance'),
        8000
      );
      broadcastRoom(room);
    }
  } else {
    state.phase = 'PLAYING';
    triggerNextTurnBotIfNeeded(room);
    broadcastRoom(room);
  }
}

function triggerNextTurnBotIfNeeded(room: InternalRoom) {
  clearTimeout(room.botTimer);
  clearTimeout(room.turnTimer);

  const state = room.state;
  if (state.phase !== 'BIDDING' && state.phase !== 'PLAYING') {
    state.turnDeadline = null;
    return;
  }

  const currentPlayer = state.players[state.currentTurnPlayerIndex];
  if (!currentPlayer) {
    state.turnDeadline = null;
    return;
  }

  if (currentPlayer.isBot) {
    state.turnDeadline = null;
    room.botTimer = setTimeout(
      safe(() => {
        executeBotTurn(room, currentPlayer);
      }, 'botTimerTimeout'),
      950
    );
    return;
  }

  if (!currentPlayer.isConnected) {
    state.turnDeadline = null;
    const elapsed = currentPlayer.disconnectedAt ? Date.now() - currentPlayer.disconnectedAt : 0;
    const graceDelay = Math.max(950, 10000 - elapsed);
    room.botTimer = setTimeout(
      safe(() => {
        const active = room.state.players[room.state.currentTurnPlayerIndex];
        if (
          (room.state.phase === 'BIDDING' || room.state.phase === 'PLAYING') &&
          active?.id === currentPlayer.id &&
          !active.isConnected
        ) {
          executeBotTurn(room, active);
        }
      }, 'disconnectedGraceBotTimeout'),
      graceDelay
    );
    return;
  }

  // Connected human turn: set turnDeadline and arm expiry timer
  const timeoutMs = Math.max(1000, (state.settings.turnTimeoutSeconds || 15) * 1000);
  state.turnDeadline = Date.now() + timeoutMs;
  const turnRound = state.currentRound;
  const turnPhase = state.phase;
  const turnPlayerId = currentPlayer.id;

  room.turnTimer = setTimeout(
    safe(() => {
      const active = room.state.players[room.state.currentTurnPlayerIndex];
      if (
        room.state.phase === turnPhase &&
        room.state.currentRound === turnRound &&
        active?.id === turnPlayerId
      ) {
        executeBotTurn(room, active);
      }
    }, 'turnTimerTimeout'),
    timeoutMs
  );

  // Auto-play for human players when they have 1 card left in hand
  // or only 1 (last) card matching the lead suit/shape
  if (state.phase === 'PLAYING') {
    const hand = room.hands.get(currentPlayer.id) || [];
    const legalCards = getLegalCards(hand, state.currentTrick);
    if (hand.length === 1 || legalCards.length === 1) {
      const autoCard = legalCards[0];
      if (autoCard) {
        room.botTimer = setTimeout(
          safe(() => {
            const active = room.state.players[room.state.currentTurnPlayerIndex];
            if (room.state.phase === 'PLAYING' && active?.id === currentPlayer.id) {
              handleCardPlayed(room, currentPlayer.id, autoCard.id);
            }
          }, 'autoPlaySingleCardTimeout'),
          650
        );
      }
    }
  }
}

function executeBotTurn(room: InternalRoom, botPlayer: Player) {
  const state = room.state;
  if (state.phase === 'BIDDING') {
    const hand = room.hands.get(botPlayer.id) || [];
    const isDealer = state.currentTurnPlayerIndex === state.dealerIndex;
    const bid = evaluateBotBid(
      hand,
      state.cardsInRound,
      state.trumpSuit,
      isDealer,
      state.forbiddenDealerBid
    );
    handleBidPlaced(room, botPlayer.id, bid);
  } else if (state.phase === 'PLAYING') {
    const hand = room.hands.get(botPlayer.id) || [];
    if (hand.length === 0) return;
    const card = selectBotCardToPlay(
      hand,
      state.currentTrick,
      state.trumpSuit,
      botPlayer.currentBid ?? 0,
      botPlayer.tricksWon
    );
    handleCardPlayed(room, botPlayer.id, card.id);
  }
}

function bindPlayerConnection(room: InternalRoom, playerId: string, localWs: ExtWebSocket) {
  room.connections.set(playerId, localWs);
  localWs.boundPlayerId = playerId;
  localWs.boundRoomCode = room.state.code;
}

function sendErrorToJoiner(message: string, localWs: ExtWebSocket) {
  if (localWs.readyState === WebSocket.OPEN) {
    localWs.send(JSON.stringify({ type: 'ERROR', message }));
  }
}

function sendSessionToken(localWs: ExtWebSocket, token: string) {
  if (localWs.readyState === WebSocket.OPEN) {
    localWs.send(JSON.stringify({ type: 'SESSION', token }));
  }
}

function joinTargetRoom(
  targetRoom: InternalRoom,
  playerId: string,
  playerName: string,
  avatar: string,
  localWs: ExtWebSocket,
  token?: string
) {
  if (targetRoom.state.phase !== 'LOBBY') {
    const reconnectPlayer = targetRoom.state.players.find((p) => p.id === playerId);
    if (reconnectPlayer) {
      const expectedToken = targetRoom.playerTokens.get(playerId);
      if (!token || !expectedToken || token !== expectedToken) {
        sendErrorToJoiner('Invalid or missing session token for reconnect.', localWs);
        return;
      }
      reconnectPlayer.isConnected = true;
      reconnectPlayer.disconnectedAt = undefined;
      bindPlayerConnection(targetRoom, reconnectPlayer.id, localWs);
      if (targetRoom.state.players[targetRoom.state.currentTurnPlayerIndex]?.id === reconnectPlayer.id) {
        clearTimeout(targetRoom.botTimer);
        triggerNextTurnBotIfNeeded(targetRoom);
      }
      broadcastRoom(targetRoom);
      return;
    }

    sendErrorToJoiner('Match is already in progress and all seats are active.', localWs);
    return;
  }

  const existingPlayer = targetRoom.state.players.find((p) => p.id === playerId);
  if (existingPlayer) {
    const expectedToken = targetRoom.playerTokens.get(playerId);
    if (!token || !expectedToken || token !== expectedToken) {
      sendErrorToJoiner('Invalid or missing session token for reconnect.', localWs);
      return;
    }
    existingPlayer.isConnected = true;
    existingPlayer.disconnectedAt = undefined;
    if (playerName) existingPlayer.name = playerName;
    if (avatar) existingPlayer.avatar = avatar;
    bindPlayerConnection(targetRoom, playerId, localWs);
    broadcastRoom(targetRoom);
    return;
  }

  if (targetRoom.state.players.length >= targetRoom.state.settings.maxPlayers) {
    const botIndex = targetRoom.state.players.findIndex((p) => p.isBot);
    if (botIndex !== -1) {
      targetRoom.state.players.splice(botIndex, 1);
      targetRoom.state.players.forEach((p, idx) => {
        p.seatIndex = idx;
      });
    } else {
      sendErrorToJoiner(`Room is full (max ${targetRoom.state.settings.maxPlayers} players).`, localWs);
      return;
    }
  }

  const newPlayer: Player = {
    id: playerId,
    name: playerName || `Player ${targetRoom.state.players.length + 1}`,
    avatar: avatar || '🐯',
    seatIndex: targetRoom.state.players.length,
    isBot: false,
    isConnected: true,
    currentBid: null,
    tricksWon: 0,
    totalScore: 0,
    scoreHistory: [],
    cardCount: 0,
  };

  const sessionToken = randomUUID();
  targetRoom.playerTokens.set(playerId, sessionToken);
  targetRoom.state.players.push(newPlayer);
  bindPlayerConnection(targetRoom, playerId, localWs);
  console.log(
    `[JOIN_LOBBY] Player ${newPlayer.name} (${newPlayer.id}) joined room ${targetRoom.state.code}. Total players: ${targetRoom.state.players.length}`
  );
  broadcastRoom(targetRoom);
  sendSessionToken(localWs, sessionToken);
}

function createNewLocalRoom(
  ws: ExtWebSocket,
  playerId: string,
  playerName: string,
  avatar: string,
  customSettings: any,
  defaultPublic: boolean
): boolean {
  const code = generateRoomCode();
  if (!code) {
    sendErrorToJoiner('Server busy, try again', ws);
    return false;
  }
  const maxPlayers = Math.min(10, Math.max(2, Number.isInteger(customSettings?.maxPlayers) ? customSettings.maxPlayers : 4));
  const roundCount: 5 | 8 | 13 =
    customSettings?.roundCount === 8 || customSettings?.roundCount === 13 ? customSettings.roundCount : 5;

  const settings: RoomSettings = {
    roundCount,
    maxPlayers,
    autoBotFill: typeof customSettings?.autoBotFill === 'boolean' ? customSettings.autoBotFill : true,
    turnTimeoutSeconds: 15,
    isPublic: typeof customSettings?.isPublic === 'boolean' ? customSettings.isPublic : defaultPublic,
  };

  const newRoomState: GameRoomState = {
    code,
    hostId: playerId,
    phase: 'LOBBY',
    players: [
      {
        id: playerId,
        name: playerName || 'Player 1',
        avatar: avatar || '🦁',
        seatIndex: 0,
        isBot: false,
        isConnected: true,
        currentBid: null,
        tricksWon: 0,
        totalScore: 0,
        scoreHistory: [],
        cardCount: 0,
      },
    ],
    currentRound: 1,
    totalRounds: settings.roundCount,
    cardsInRound: 1,
    trumpSuit: 'S',
    dealerIndex: 0,
    leadPlayerIndex: 1,
    currentTurnPlayerIndex: 1,
    currentTrick: [],
    forbiddenDealerBid: null,
    totalBidsPlaced: 0,
    turnDeadline: null,
    seq: 0,
    settings,
    chatMessages: [],
  };

  const sessionToken = randomUUID();
  const targetRoom: InternalRoom = {
    state: newRoomState,
    hands: new Map(),
    connections: new Map([[playerId, ws]]),
    playerTokens: new Map([[playerId, sessionToken]]),
  };

  ws.boundPlayerId = playerId;
  ws.boundRoomCode = code;

  rooms.set(code, targetRoom);
  console.log(`[ROOM_CREATED] Room ${code} created by ${playerName || 'Player 1'} (${playerId}). Active rooms: ${rooms.size}`);
  broadcastRoom(targetRoom);
  sendSessionToken(ws, sessionToken);
  return true;
}

function handleRoomAction(room: InternalRoom, playerId: string, msg: any, localWs?: ExtWebSocket) {
  switch (msg.type) {
    case 'ADD_BOT': {
      if (room.state.phase !== 'LOBBY') return;
      if (room.state.players.length === 0) return;
      if (room.state.hostId !== playerId) return;
      if (room.state.players.length >= room.state.settings.maxPlayers) return;

      const botIdx = room.state.players.length;
      const botProfile = BOT_PROFILES[(botIdx - 1) % BOT_PROFILES.length];
      const botPlayer: Player = {
        id: `bot-${Date.now()}-${botIdx}`,
        name: botProfile.name,
        avatar: botProfile.avatar,
        seatIndex: botIdx,
        isBot: true,
        isConnected: true,
        currentBid: null,
        tricksWon: 0,
        totalScore: 0,
        scoreHistory: [],
        cardCount: 0,
      };

      room.state.players.push(botPlayer);
      broadcastRoom(room);
      break;
    }

    case 'REMOVE_BOT': {
      if (room.state.phase !== 'LOBBY') return;
      if (room.state.hostId !== playerId) return;

      const { botId } = msg;
      room.state.players = room.state.players.filter((p) => p.id !== botId);
      room.state.players.forEach((p, idx) => {
        p.seatIndex = idx;
      });

      broadcastRoom(room);
      break;
    }

    case 'UPDATE_SETTINGS': {
      if (room.state.phase !== 'LOBBY') return;
      if (room.state.hostId !== playerId) return;

      const raw = msg.settings;
      if (raw && typeof raw === 'object') {
        if (Number.isInteger(raw.maxPlayers) && raw.maxPlayers >= 2 && raw.maxPlayers <= 10) {
          room.state.settings.maxPlayers = raw.maxPlayers;
        }
        if (raw.roundCount === 5 || raw.roundCount === 8 || raw.roundCount === 13) {
          room.state.settings.roundCount = raw.roundCount;
          room.state.totalRounds = raw.roundCount;
        }
        if (typeof raw.autoBotFill === 'boolean') {
          room.state.settings.autoBotFill = raw.autoBotFill;
        }
        if (typeof raw.isPublic === 'boolean') {
          room.state.settings.isPublic = raw.isPublic;
        }
      }
      broadcastRoom(room);
      break;
    }

    case 'START_GAME': {
      if (room.state.phase !== 'LOBBY' && room.state.phase !== 'GAME_OVER') return;
      if (room.state.hostId !== playerId) return;

      if (room.state.phase === 'GAME_OVER') {
        clearTimeout(room.roundSummaryTimer);
        clearTurnTimers(room);

        const keptPlayers: Player[] = [];
        for (const p of room.state.players) {
          if (p.isBot || p.isConnected) {
            keptPlayers.push(p);
          } else {
            room.hands.delete(p.id);
            room.playerTokens.delete(p.id);
          }
        }

        if (keptPlayers.length < 2 && !room.state.settings.autoBotFill) {
          room.state.players = keptPlayers;
          room.state.players.forEach((p, idx) => {
            p.seatIndex = idx;
          });
          sendToPlayer(room, playerId, {
            type: 'ERROR',
            message: 'Need at least 2 players to start game.',
          });
          broadcastRoom(room);
          return;
        }

        room.state.players = keptPlayers;
        room.state.players.forEach((p, idx) => {
          p.seatIndex = idx;
          p.totalScore = 0;
          p.scoreHistory = [];
          p.currentBid = null;
          p.tricksWon = 0;
          p.cardCount = 0;
        });
      } else if (room.state.players.length < 2) {
        sendToPlayer(room, playerId, {
          type: 'ERROR',
          message: 'Need at least 2 players to start game.',
        });
        return;
      }

      if (room.state.settings.autoBotFill && room.state.players.length < room.state.settings.maxPlayers) {
        while (room.state.players.length < room.state.settings.maxPlayers) {
          const botIdx = room.state.players.length;
          const botProfile = BOT_PROFILES[(botIdx - 1) % BOT_PROFILES.length];
          room.state.players.push({
            id: `bot-${Date.now()}-${botIdx}`,
            name: botProfile.name,
            avatar: botProfile.avatar,
            seatIndex: botIdx,
            isBot: true,
            isConnected: true,
            currentBid: null,
            tricksWon: 0,
            totalScore: 0,
            scoreHistory: [],
            cardCount: 0,
          });
        }
      }

      if (room.state.players.length < 2) {
        sendToPlayer(room, playerId, {
          type: 'ERROR',
          message: 'Need at least 2 players to start game.',
        });
        return;
      }

      room.state.currentRound = 1;
      startRound(room);
      break;
    }

    case 'PLACE_BID': {
      if (!Number.isInteger(msg.bid) || msg.bid < 0 || msg.bid > room.state.cardsInRound) return;
      handleBidPlaced(room, playerId, msg.bid);
      break;
    }

    case 'PLAY_CARD': {
      handleCardPlayed(room, playerId, msg.cardId);
      break;
    }

    case 'READY_NEXT_ROUND': {
      if (room.state.phase !== 'ROUND_SUMMARY') return;
      if (room.state.hostId !== playerId) return;
      if (msg.round !== room.state.currentRound) return;
      clearTimeout(room.roundSummaryTimer);
      room.state.currentRound += 1;
      startRound(room);
      break;
    }

    case 'CHAT_MESSAGE': {
      const player = room.state.players.find((p) => p.id === playerId);
      if (!player) return;
      if (typeof msg.text !== 'string' || !msg.text.trim()) return;

      const newChat = {
        id: randomUUID(),
        sender: player.name,
        text: msg.text.substring(0, 100),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      room.state.chatMessages.push(newChat);
      if (room.state.chatMessages.length > 25) {
        room.state.chatMessages.shift();
      }

      broadcastRoom(room);
      break;
    }

    case 'LEAVE_ROOM': {
      if (localWs && room.connections.get(playerId) === localWs) {
        room.connections.delete(playerId);
      }

      if (room.state.phase === 'LOBBY') {
        room.state.players = room.state.players.filter((p) => p.id !== playerId);
        room.playerTokens.delete(playerId);
        room.state.players.forEach((p, idx) => {
          p.seatIndex = idx;
        });
        if (cleanLobbyIfNoHumans(room)) {
          return;
        }
        checkAndMigrateHost(room);
        broadcastRoom(room);
      } else {
        const player = room.state.players.find((p) => p.id === playerId);
        if (player) {
          player.isConnected = false;
          player.disconnectedAt = Date.now();
          checkAndMigrateHost(room);
          if (
            (room.state.phase === 'BIDDING' || room.state.phase === 'PLAYING') &&
            room.state.players[room.state.currentTurnPlayerIndex]?.id === player.id
          ) {
            triggerNextTurnBotIfNeeded(room);
          }
          broadcastRoom(room);
        }
      }
      break;
    }
  }
}

// REST API Endpoints
app.get('/healthz', (_req, res) => {
  res.json({
    ok: true,
    rooms: rooms.size,
  });
});

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    activeRooms: rooms.size,
  });
});

app.get('/api/room/:code', (req, res) => {
  const cleanCode = req.params.code.toString().replace(/[^a-zA-Z]/g, '').toUpperCase();
  const room = findRoom(cleanCode);
  if (room) {
    return res.json({
      code: room.state.code,
      phase: room.state.phase,
      playerCount: room.state.players.length,
      maxPlayers: room.state.settings.maxPlayers,
      players: room.state.players.map((p) => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        isBot: p.isBot,
      })),
    });
  }

  return res.status(404).json({ error: 'Room not found' });
});

// Heartbeat: ping every 15s, terminate sockets with no pong in 30s
const heartbeatInterval = setInterval(
  safe(() => {
    wss.clients.forEach((client) => {
      const ws = client as ExtWebSocket;
      if (ws.isAlive === false) {
        console.log('[HEARTBEAT] Socket unresponsive (no pong in 30s), terminating.');
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 'heartbeatInterval'),
  15000
);

let isShuttingDown = false;

// WebSocket Upgrade Rate Limiting (max 20 open WebSocket connections per IP) and Origin Check
server.on('upgrade', (req, socket, head) => {
  if (isShuttingDown) {
    socket.write(
      'HTTP/1.1 503 Service Unavailable\r\n' +
        'Content-Type: text/plain\r\n' +
        'Connection: close\r\n' +
        '\r\n' +
        'Server shutting down.'
    );
    socket.destroy();
    return;
  }

  if (allowedOrigins.length > 0) {
    const rawOrigin = typeof req.headers.origin === 'string' ? req.headers.origin.trim() : '';
    const normalizedOrigin = rawOrigin.replace(/\/+$/, '');
    if (!normalizedOrigin || !allowedOrigins.includes(normalizedOrigin)) {
      socket.write(
        'HTTP/1.1 403 Forbidden\r\n' +
          'Content-Type: text/plain\r\n' +
          'Connection: close\r\n' +
          '\r\n' +
          'Origin not allowed.'
      );
      socket.destroy();
      return;
    }
  }

  const ip = getClientIp(req);
  const activeSockets = openConnectionsByIp.get(ip);
  if (activeSockets && activeSockets.size >= 20) {
    socket.write(
      'HTTP/1.1 429 Too Many Requests\r\n' +
        'Content-Type: text/plain\r\n' +
        'Connection: close\r\n' +
        '\r\n' +
        'Too many open WebSocket connections from this IP.'
    );
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (rawWs) => {
    const ws = rawWs as ExtWebSocket;
    ws.clientIp = ip;
    let ipSet = openConnectionsByIp.get(ip);
    if (!ipSet) {
      ipSet = new Set();
      openConnectionsByIp.set(ip, ipSet);
    }
    ipSet.add(ws);
    wss.emit('connection', ws, req);
  });
});

// WebSocket Connection Management
wss.on('connection', (rawWs, req) => {
  const ws = rawWs as ExtWebSocket;
  const clientIp = ws.clientIp || getClientIp(req);
  ws.clientIp = clientIp;
  ws.isAlive = true;
  ws.boundPlayerId = null;
  ws.boundRoomCode = null;

  let ipSet = openConnectionsByIp.get(clientIp);
  if (!ipSet) {
    ipSet = new Set();
    openConnectionsByIp.set(clientIp, ipSet);
  }
  ipSet.add(ws);

  const msgTimestamps: number[] = [];
  let excessStartedAt: number | null = null;
  let lastExcessAt: number | null = null;
  const chatTimestamps: number[] = [];
  const roomCreateTimestamps: number[] = [];

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on(
    'message',
    safe((data) => {
      const now = Date.now();
      while (msgTimestamps.length > 0 && now - msgTimestamps[0] >= 1000) {
        msgTimestamps.shift();
      }
      if (msgTimestamps.length >= 20) {
        if (excessStartedAt === null || (lastExcessAt !== null && now - lastExcessAt > 1500)) {
          excessStartedAt = now;
        }
        lastExcessAt = now;
        if (now - excessStartedAt >= 5000) {
          ws.close(1008, 'Rate limit exceeded');
        }
        return;
      }
      if (lastExcessAt !== null && now - lastExcessAt > 1500) {
        excessStartedAt = null;
        lastExcessAt = null;
      }
      msgTimestamps.push(now);

      const msg = JSON.parse(data.toString());

      switch (msg.type) {
        case 'JOIN_LOBBY': {
          const {
            playerName,
            avatar,
            playerId: requestedPlayerId,
            token,
            roomCode: rawCode,
            isQuickMatch,
            customSettings,
          } = msg;
          const playerId =
            typeof requestedPlayerId === 'string' && requestedPlayerId.trim().length > 0
              ? requestedPlayerId.trim()
              : `p-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
          const providedToken = typeof token === 'string' ? token : undefined;

          let targetRoom: InternalRoom | undefined;

          if (isQuickMatch) {
            for (const [, r] of rooms) {
              if (
                r.state.phase === 'LOBBY' &&
                r.state.settings.isPublic === true &&
                r.state.players.length < r.state.settings.maxPlayers
              ) {
                targetRoom = r;
                break;
              }
            }
          } else if (rawCode) {
            const cleanCode = rawCode.toString().replace(/[^a-zA-Z]/g, '').toUpperCase();
            targetRoom = findRoom(cleanCode);
            if (!targetRoom) {
              ws.send(
                JSON.stringify({
                  type: 'ERROR',
                  message: 'Room not found',
                })
              );
              return;
            }
          }

          if (!targetRoom) {
            const createNow = Date.now();
            while (roomCreateTimestamps.length > 0 && createNow - roomCreateTimestamps[0] >= 60000) {
              roomCreateTimestamps.shift();
            }
            if (roomCreateTimestamps.length >= 3) {
              ws.send(
                JSON.stringify({
                  type: 'ERROR',
                  message: 'Room creation limit reached (max 3 rooms per minute).',
                })
              );
              return;
            }

            const ipCreateTimestamps = roomCreateTimestampsByIp.get(clientIp) || [];
            while (ipCreateTimestamps.length > 0 && createNow - ipCreateTimestamps[0] >= 10 * 60 * 1000) {
              ipCreateTimestamps.shift();
            }
            if (ipCreateTimestamps.length === 0) {
              roomCreateTimestampsByIp.delete(clientIp);
            }
            if (ipCreateTimestamps.length >= 10) {
              ws.send(
                JSON.stringify({
                  type: 'ERROR',
                  message: 'Room creation limit reached for this IP (max 10 rooms per 10 minutes).',
                })
              );
              return;
            }

            const created = createNewLocalRoom(
              ws,
              playerId,
              playerName,
              avatar,
              customSettings,
              !!isQuickMatch
            );
            if (created) {
              roomCreateTimestamps.push(createNow);
              ipCreateTimestamps.push(createNow);
              roomCreateTimestampsByIp.set(clientIp, ipCreateTimestamps);
            }
          } else {
            joinTargetRoom(targetRoom, playerId, playerName, avatar, ws, providedToken);
          }
          break;
        }

        case 'REJOIN_GAME': {
          const { roomCode: rawCode, playerId, token, isSilentProbe } = msg;
          const cleanCode = rawCode ? rawCode.toString().replace(/[^a-zA-Z]/g, '').toUpperCase() : '';

          const room = findRoom(cleanCode);
          if (!room) {
            ws.send(
              JSON.stringify({
                type: 'REJOIN_FAILED',
                roomCode: cleanCode || rawCode,
                isSilent: !!isSilentProbe,
                message: 'Room not found',
              })
            );
            return;
          }

          const validPlayerId = typeof playerId === 'string' && playerId.trim().length > 0 ? playerId.trim() : '';
          const existingPlayer = validPlayerId ? room.state.players.find((p) => p.id === validPlayerId) : undefined;
          if (!existingPlayer) {
            ws.send(
              JSON.stringify({
                type: 'REJOIN_FAILED',
                roomCode: room.state.code,
                isSilent: !!isSilentProbe,
                message: 'Player ID not found in this room.',
              })
            );
            return;
          }

          const expectedToken = room.playerTokens.get(existingPlayer.id);
          const providedToken = typeof token === 'string' ? token : '';
          if (!providedToken || !expectedToken || providedToken !== expectedToken) {
            ws.send(
              JSON.stringify({
                type: 'REJOIN_FAILED',
                roomCode: room.state.code,
                isSilent: !!isSilentProbe,
                message: 'Invalid or missing session token.',
              })
            );
            return;
          }

          existingPlayer.isConnected = true;
          existingPlayer.disconnectedAt = undefined;
          bindPlayerConnection(room, existingPlayer.id, ws);
          if (room.state.players[room.state.currentTurnPlayerIndex]?.id === existingPlayer.id) {
            triggerNextTurnBotIfNeeded(room);
          }
          broadcastRoom(room);
          break;
        }

        case 'CHAT_MESSAGE': {
          if (!ws.boundRoomCode || !ws.boundPlayerId) return;
          if (typeof msg.text !== 'string' || !msg.text.trim()) return;

          const chatNow = Date.now();
          while (chatTimestamps.length > 0 && chatNow - chatTimestamps[0] >= 10000) {
            chatTimestamps.shift();
          }
          const lastChatAt = chatTimestamps[chatTimestamps.length - 1];
          if ((lastChatAt !== undefined && chatNow - lastChatAt < 1000) || chatTimestamps.length >= 5) {
            return;
          }
          chatTimestamps.push(chatNow);

          const room = findRoom(ws.boundRoomCode);
          if (!room) return;
          handleRoomAction(room, ws.boundPlayerId, msg, ws);
          break;
        }

        case 'ADD_BOT':
        case 'REMOVE_BOT':
        case 'UPDATE_SETTINGS':
        case 'START_GAME':
        case 'PLACE_BID':
        case 'PLAY_CARD':
        case 'READY_NEXT_ROUND':
        case 'LEAVE_ROOM': {
          if (!ws.boundRoomCode || !ws.boundPlayerId) return;

          const room = findRoom(ws.boundRoomCode);
          if (!room) return;
          handleRoomAction(room, ws.boundPlayerId, msg, ws);
          if (msg.type === 'LEAVE_ROOM') {
            ws.boundRoomCode = null;
          }
          break;
        }
      }
    }, 'ws.on(message)')
  );

  ws.on(
    'close',
    safe(() => {
      const trackedSet = openConnectionsByIp.get(clientIp);
      if (trackedSet) {
        trackedSet.delete(ws);
        if (trackedSet.size === 0) {
          openConnectionsByIp.delete(clientIp);
        }
      }

      if (ws.boundRoomCode && ws.boundPlayerId) {
        const room = findRoom(ws.boundRoomCode);
        if (room) {
          if (room.connections.get(ws.boundPlayerId) === ws) {
            room.connections.delete(ws.boundPlayerId);
            const player = room.state.players.find((p) => p.id === ws.boundPlayerId);
            if (player) {
              player.isConnected = false;
              player.disconnectedAt = Date.now();
              checkAndMigrateHost(room);
              if (
                (room.state.phase === 'BIDDING' || room.state.phase === 'PLAYING') &&
                room.state.players[room.state.currentTurnPlayerIndex]?.id === player.id
              ) {
                triggerNextTurnBotIfNeeded(room);
              }
              broadcastRoom(room);
            }
          }
        }
      }
    }, 'ws.on(close)')
  );
});

// Clean up expired rooms and migrate host if disconnected > 20s
const maintenanceInterval = setInterval(
  safe(() => {
    const now = Date.now();

    for (const [ip, timestamps] of roomCreateTimestampsByIp.entries()) {
      while (timestamps.length > 0 && now - timestamps[0] >= 10 * 60 * 1000) {
        timestamps.shift();
      }
      if (timestamps.length === 0) {
        roomCreateTimestampsByIp.delete(ip);
      }
    }

    for (const [code, room] of rooms.entries()) {
      if (cleanLobbyIfNoHumans(room)) {
        continue;
      }
      if (room.state.phase === 'LOBBY') {
        const connectedHumans = room.state.players.filter((p) => !p.isBot && p.isConnected);
        if (connectedHumans.length > 0) {
          const beforeCount = room.state.players.length;
          const keptPlayers: Player[] = [];
          for (const p of room.state.players) {
            if (p.isBot || p.isConnected || !p.disconnectedAt || now - p.disconnectedAt <= 2 * 60 * 1000) {
              keptPlayers.push(p);
            } else {
              room.playerTokens.delete(p.id);
            }
          }
          room.state.players = keptPlayers;
          if (room.state.players.length !== beforeCount) {
            room.state.players.forEach((p, idx) => {
              p.seatIndex = idx;
            });
            checkAndMigrateHost(room);
            broadcastRoom(room);
          }
        }
      }
      checkAndMigrateHost(room);
      const allDisconnected = room.state.players.every((p) => !p.isConnected || p.isBot);
      const timeout = room.state.phase === 'LOBBY' ? 5 * 60 * 1000 : 15 * 60 * 1000;
      if (allDisconnected && room.state.players.some((p) => p.disconnectedAt && now - p.disconnectedAt > timeout)) {
        console.log(`[CLEANUP] Purging inactive room ${code}`);
        deleteLocalRoom(code);
      }
    }
  }, 'roomMaintenanceInterval'),
  5000
);

// Mounting Vite in development or static in production
async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    const distDir = path.join(__dirname, 'dist');
    const distAssetsDir = path.join(distDir, 'assets');
    const distIndexHtml = path.join(distDir, 'index.html');

    app.use(
      '/assets',
      express.static(distAssetsDir, {
        immutable: true,
        maxAge: 31536000 * 1000,
        setHeaders: (res) => {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        },
      })
    );

    app.use(
      express.static(distDir, {
        setHeaders: (res, filePath) => {
          if (path.basename(filePath) === 'index.html') {
            res.setHeader('Cache-Control', 'no-cache');
          }
        },
      })
    );

    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(distIndexHtml, { cacheControl: false });
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

function handleShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[SHUTDOWN] Received ${signal}, stopping server and closing sockets...`);

  clearInterval(heartbeatInterval);
  clearInterval(maintenanceInterval);

  for (const room of rooms.values()) {
    clearTurnTimers(room);
    if (room.roundSummaryTimer) clearTimeout(room.roundSummaryTimer);
  }

  const forceExitTimer = setTimeout(() => {
    wss.clients.forEach((client) => {
      try {
        client.terminate();
      } catch {
        // ignore
      }
    });
    process.exit(0);
  }, 9000);
  forceExitTimer.unref();

  wss.clients.forEach((client) => {
    try {
      if (client.readyState === WebSocket.OPEN || client.readyState === WebSocket.CONNECTING) {
        client.close(1012, 'Server shutting down');
      } else {
        client.terminate();
      }
    } catch {
      // ignore
    }
  });

  server.close(() => {
    clearTimeout(forceExitTimer);
    process.exit(0);
  });
  server.closeIdleConnections?.();
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));

startServer();
