export type Suit = 'S' | 'D' | 'C' | 'H'; // Spades (Ka), Diamonds (Chu), Clubs (Fu), Hearts (La)

export interface Card {
  id: string; // e.g. "S-14"
  suit: Suit;
  rank: number; // 2..14 (11=J, 12=Q, 13=K, 14=A)
}

export type GamePhase = 'LOBBY' | 'BIDDING' | 'PLAYING' | 'TRICK_RESOLVE' | 'ROUND_SUMMARY' | 'GAME_OVER';

export interface PlayerScoreEntry {
  round: number;
  bid: number;
  won: number;
  points: number;
  totalScore: number;
}

export interface Player {
  id: string;
  name: string;
  avatar: string;
  seatIndex: number;
  isBot: boolean;
  isConnected: boolean;
  disconnectedAt?: number; // timestamp
  currentBid: number | null;
  tricksWon: number;
  totalScore: number;
  scoreHistory: PlayerScoreEntry[];
  cardCount: number; // for opponents
}

export interface PlayedCard {
  playerId: string;
  card: Card;
  playerName: string;
}

export interface RoomSettings {
  roundCount: 5 | 8 | 13;
  maxPlayers: number; // 2..10
  autoBotFill: boolean;
  turnTimeoutSeconds: number;
  isPublic?: boolean;
}

export interface GameRoomState {
  code: string;
  hostId: string;
  phase: GamePhase;
  players: Player[];
  currentRound: number; // 1-indexed
  totalRounds: number;
  cardsInRound: number;
  trumpSuit: Suit | 'NONE';
  dealerIndex: number;
  leadPlayerIndex: number;
  currentTurnPlayerIndex: number;
  currentTrick: PlayedCard[];
  lastTrickWinner?: {
    playerId: string;
    playerName: string;
    trick: PlayedCard[];
  };
  forbiddenDealerBid: number | null; // Hook rule forbidden bid
  totalBidsPlaced: number;
  turnDeadline: number | null;
  seq: number;
  settings: RoomSettings;
  chatMessages: { id: string; sender: string; text: string; time: string }[];
}

export const SUIT_NAMES: Record<
  Suit,
  {
    english: string;
    hindi: string;
    indianSuit: string;
    hindiSuit: string;
    symbol: string;
    color: string;
    borderColor: string;
  }
> = {
  S: {
    english: 'Spades',
    hindi: 'Kaali (Ka)',
    indianSuit: 'Hukam',
    hindiSuit: 'हुकुम',
    symbol: '♠',
    color: 'text-stone-900',
    borderColor: 'border-stone-800',
  },
  D: {
    english: 'Diamonds',
    hindi: 'Chukat (Chu)',
    indianSuit: 'Eent',
    hindiSuit: 'ईंट',
    symbol: '♦',
    color: 'text-amber-700',
    borderColor: 'border-amber-600',
  },
  C: {
    english: 'Clubs',
    hindi: 'Fuli (Fu)',
    indianSuit: 'Chidiya',
    hindiSuit: 'चिड़िया',
    symbol: '♣',
    color: 'text-emerald-900',
    borderColor: 'border-emerald-700',
  },
  H: {
    english: 'Hearts',
    hindi: 'Lal (La)',
    indianSuit: 'Paan',
    hindiSuit: 'पान',
    symbol: '♥',
    color: 'text-rose-700',
    borderColor: 'border-rose-600',
  },
};

export const INDIAN_COURT_NAMES: Record<number, { english: string; hindi: string; devanagari: string }> = {
  14: { english: 'Ace', hindi: 'Ikka', devanagari: 'इक्का' },
  13: { english: 'King', hindi: 'Badshah', devanagari: 'बादशाह' },
  12: { english: 'Queen', hindi: 'Begum', devanagari: 'बेगम' },
  11: { english: 'Jack', hindi: 'Ghulam', devanagari: 'गुलाम' },
};

export const DEVANAGARI_NUMBERS: Record<number, string> = {
  2: '२',
  3: '३',
  4: '४',
  5: '५',
  6: '६',
  7: '७',
  8: '८',
  9: '९',
  10: '१०',
  11: '११',
  12: '१२',
  13: '१३',
  14: '१',
};

export const RANK_NAMES: Record<number, string> = {
  2: '2',
  3: '3',
  4: '4',
  5: '5',
  6: '6',
  7: '7',
  8: '8',
  9: '9',
  10: '10',
  11: 'J',
  12: 'Q',
  13: 'K',
  14: 'A',
};

// Cycle: Ka (Spades) -> Chu (Diamonds) -> Fu (Clubs) -> La (Hearts)
export const TRUMP_CYCLE: Suit[] = ['S', 'D', 'C', 'H'];

