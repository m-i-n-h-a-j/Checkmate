import { REACTIONS, isReaction, reactionLabel } from './reactions';

describe('reactions', () => {
  it('names every reaction for screen readers', () => {
    expect(REACTIONS.every((r) => r.label.length > 2)).toBe(true);
    expect(reactionLabel('🔥')).toBe('On fire');
    expect(reactionLabel('🥔')).toBe('Reaction');
  });

  it('only recognizes emoji from the list', () => {
    expect(isReaction('👏')).toBe(true);
    expect(isReaction('🥔')).toBe(false);
    expect(isReaction('')).toBe(false);
  });
});
