// ─────────────────────────────────────────────────────────────────────────────
// ts-fsrs — Free Spaced Repetition Scheduler
// The algorithm Anki now uses by default. Outperforms SM-2 by ~35% recall.
// ─────────────────────────────────────────────────────────────────────────────
import { createEmptyCard, fsrs, generatorParameters, Rating, State } from 'ts-fsrs';

const scheduler = fsrs(generatorParameters({ enable_fuzz: true, maximum_interval: 365 }));

export const RATINGS = {
  Again: Rating.Again,
  Hard:  Rating.Hard,
  Good:  Rating.Good,
  Easy:  Rating.Easy,
};

/** Schedule a card review. Returns updated card with new FSRS state. */
export function scheduleCard(card, ratingKey) {
  const rating   = RATINGS[ratingKey] || Rating.Good;
  const fsrsCard = card.fsrsState ? { ...card.fsrsState, due: new Date(card.fsrsState.due || Date.now()), last_review: card.fsrsState.last_review ? new Date(card.fsrsState.last_review) : undefined } : createEmptyCard();
  const result   = scheduler.repeat(fsrsCard, new Date());
  const next     = result[rating].card;
  return {
    ...card,
    fsrsState: {
      ...next,
      due:         next.due.getTime(),
      last_review: next.last_review?.getTime(),
    },
    due:       next.due.getTime(),
    stability: next.stability,
    difficulty:next.difficulty,
    state:     next.state,
    interval:  next.scheduled_days,
  };
}

/** Check if a card is due for review now. */
export function isDue(card) {
  if (!card.due) return true; // new card
  return card.due <= Date.now();
}

/** Get human-readable next review time. */
export function nextReviewLabel(card) {
  if (!card.due) return 'New';
  const diff = card.due - Date.now();
  if (diff <= 0)                       return 'Due now';
  const mins  = Math.ceil(diff / 60000);
  const hours = Math.ceil(diff / 3600000);
  const days  = Math.ceil(diff / 86400000);
  if (mins  < 60)  return `${mins}m`;
  if (hours < 24)  return `${hours}h`;
  if (days  < 7)   return `${days}d`;
  if (days  < 30)  return `${Math.ceil(days/7)}w`;
  return `${Math.ceil(days/30)}mo`;
}

/** Get retrievability (probability of recall) as a percentage. */
export function getRetainability(card) {
  if (!card.stability || !card.due || !card.fsrsState?.last_review) return null;
  const elapsed = (Date.now() - card.fsrsState.last_review) / 86400000; // days
  const r = Math.exp(Math.log(0.9) * elapsed / card.stability);
  return Math.round(r * 100);
}

/** Filter cards that are due for review. */
export function getDueCards(cards) {
  return cards.filter(isDue);
}

/** Sort cards: due first, then by stability (hardest first). */
export function sortForStudy(cards) {
  return [...cards].sort((a, b) => {
    const aDue = isDue(a) ? 0 : 1;
    const bDue = isDue(b) ? 0 : 1;
    if (aDue !== bDue) return aDue - bDue;
    return (a.stability || 0) - (b.stability || 0);
  });
}

export const STATE_LABELS = {
  [State.New]:      { label: 'New',      color: '#8b5cf6' },
  [State.Learning]: { label: 'Learning', color: '#f59e0b' },
  [State.Review]:   { label: 'Review',   color: '#10b981' },
  [State.Relearning]:{ label: 'Relearning', color: '#f43f5e' },
};
