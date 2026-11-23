import { Card, PlayedCard, Suit } from '../types/game';

export function createDeck(deckCount: number = 1): Card[] {
  const suits: Suit[] = ['S', 'D', 'C', 'H'];
  const deck: Card[] = [];
  for (let d = 0; d < deckCount; d++) {
    for (const suit of suits) {
      for (let rank = 2; rank <= 14; rank++) {
        deck.push({
          id: `${suit}-${rank}-${d}`,
          suit,
          rank,
        });
      }
    }
  }
  return deck;
}

export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Calculates the hook rule forbidden bid for the dealer.
 * The dealer cannot make the total bids equal the number of cards in the round.
 */
export function calculateForbiddenDealerBid(cardsInRound: number, priorBids: number[]): number | null {
  const sumPrior = priorBids.reduce((acc, b) => acc + b, 0);
  const forbidden = cardsInRound - sumPrior;
  if (forbidden >= 0 && forbidden <= cardsInRound) {
    return forbidden;
  }
  return null;
}

/**
 * Returns the subset of cards from hand that are legal to play in the current trick.
 * Must follow lead suit if possible.
 */
export function getLegalCards(hand: Card[], currentTrick: PlayedCard[]): Card[] {
  if (hand.length === 0) return [];
  if (currentTrick.length === 0) {
    // Leading: any card is valid
    return hand;
  }

  const leadSuit = currentTrick[0].card.suit;
  const cardsInLeadSuit = hand.filter((c) => c.suit === leadSuit);

  if (cardsInLeadSuit.length > 0) {
    return cardsInLeadSuit;
  }

  // Void in lead suit: can play trumps or any off-suit card
  return hand;
}

/**
 * Evaluates the winning card and player in a trick.
 */
export function evaluateTrickWinner(trick: PlayedCard[], trumpSuit: Suit | 'NONE'): PlayedCard {
  if (trick.length === 0) throw new Error('Cannot evaluate empty trick');

  const leadSuit = trick[0].card.suit;
  let winningPlayed = trick[0];

  for (let i = 1; i < trick.length; i++) {
    const candidate = trick[i];
    const winCard = winningPlayed.card;
    const canCard = candidate.card;

    const isWinTrump = trumpSuit !== 'NONE' && winCard.suit === trumpSuit;
    const isCanTrump = trumpSuit !== 'NONE' && canCard.suit === trumpSuit;

    if (isCanTrump) {
      if (!isWinTrump) {
        winningPlayed = candidate;
      } else if (canCard.rank > winCard.rank) {
        winningPlayed = candidate;
      }
    } else if (!isWinTrump) {
      if (canCard.suit === leadSuit && canCard.rank > winCard.rank) {
        winningPlayed = candidate;
      }
    }
  }

  return winningPlayed;
}

/**
 * Classic Kachuful scoring:
 * Exact bid match = 10 + bid
 * Miss = 0
 */
export function calculateRoundPoints(bid: number, won: number): number {
  return bid === won ? 10 + bid : 0;
}

/**
 * Smart Bot Bid Evaluator
 */
export function evaluateBotBid(
  hand: Card[],
  cardsInRound: number,
  trumpSuit: Suit | 'NONE',
  isDealer: boolean,
  forbiddenBid: number | null
): number {
  let expectedTricks = 0;

  for (const card of hand) {
    const isTrump = trumpSuit !== 'NONE' && card.suit === trumpSuit;
    if (isTrump) {
      if (card.rank >= 12) expectedTricks += 1;
      else if (card.rank >= 9) expectedTricks += 0.6;
      else expectedTricks += 0.3;
    } else {
      if (card.rank === 14) expectedTricks += 0.9;
      else if (card.rank === 13) expectedTricks += 0.6;
      else if (card.rank === 12) expectedTricks += 0.3;
    }
  }

  let bid = Math.round(expectedTricks);
  if (bid > cardsInRound) bid = cardsInRound;
  if (bid < 0) bid = 0;

  // Handle Hook Rule for Dealer
  if (isDealer && forbiddenBid !== null && bid === forbiddenBid) {
    // If forbidden, shift up or down based on confidence
    if (bid > 0 && expectedTricks < forbiddenBid) {
      bid = forbiddenBid - 1;
    } else if (bid < cardsInRound) {
      bid = forbiddenBid + 1;
    } else {
      bid = Math.max(0, forbiddenBid - 1);
    }
  }

  return bid;
}

/**
 * Smart Bot Card Play Decision
 */
export function selectBotCardToPlay(
  hand: Card[],
  currentTrick: PlayedCard[],
  trumpSuit: Suit | 'NONE',
  botBid: number,
  tricksWon: number
): Card {
  const legalCards = getLegalCards(hand, currentTrick);
  if (legalCards.length === 1) return legalCards[0];

  const needsTricks = tricksWon < botBid;

  // Sort legal cards lowest to highest rank
  const sorted = [...legalCards].sort((a, b) => a.rank - b.rank);

  // If leading
  if (currentTrick.length === 0) {
    if (needsTricks) {
      // Lead an Ace or high trump
      const highCard = sorted[sorted.length - 1];
      return highCard;
    } else {
      // Lead lowest safe card
      return sorted[0];
    }
  }

  // If following
  const currentWinner = evaluateTrickWinner(currentTrick, trumpSuit);

  if (needsTricks) {
    // Find smallest card that can beat currentWinner
    const winningCards = sorted.filter((c) => {
      const trialTrick: PlayedCard[] = [...currentTrick, { playerId: 'bot', playerName: 'Bot', card: c }];
      return evaluateTrickWinner(trialTrick, trumpSuit).card.id === c.id;
    });

    if (winningCards.length > 0) {
      // Play the lowest card that still wins
      return winningCards[0];
    } else {
      // Cannot win, discard lowest card
      return sorted[0];
    }
  } else {
    // Wants to lose / duck trick:
    // Filter cards that do NOT win
    const losingCards = sorted.filter((c) => {
      const trialTrick: PlayedCard[] = [...currentTrick, { playerId: 'bot', playerName: 'Bot', card: c }];
      return evaluateTrickWinner(trialTrick, trumpSuit).card.id !== c.id;
    });

    if (losingCards.length > 0) {
      // Play highest losing card to discard high unwanted rank safely!
      return losingCards[losingCards.length - 1];
    } else {
      // Forced to win or only have winners, play lowest
      return sorted[0];
    }
  }
}
