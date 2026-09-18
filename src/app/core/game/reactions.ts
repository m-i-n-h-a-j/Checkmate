/**
 * The reactions players can send each other mid-game. The same list is spelled out in
 * firestore.rules, which is what actually decides whether a reaction is allowed, so the two must
 * stay in step.
 */
export const REACTIONS = [
  { emoji: '👏', label: 'Nice move' },
  { emoji: '🔥', label: 'On fire' },
  { emoji: '😂', label: 'Laughing' },
  { emoji: '😮', label: 'Surprised' },
  { emoji: '😅', label: 'Phew' },
  { emoji: '🧠', label: 'Clever' },
  { emoji: '😭', label: 'Crying' },
  { emoji: '🤝', label: 'Good game' },
] as const;

export type ReactionEmoji = (typeof REACTIONS)[number]['emoji'];

const LABELS = new Map<string, string>(REACTIONS.map((r) => [r.emoji, r.label]));

export function isReaction(emoji: string): emoji is ReactionEmoji {
  return LABELS.has(emoji);
}

/** What a screen reader says when a reaction lands. */
export function reactionLabel(emoji: string): string {
  return LABELS.get(emoji) ?? 'Reaction';
}

/** Players share one reaction slot, so this is how long anyone waits after any reaction. */
export const REACTION_COOLDOWN_MS = 1500;
