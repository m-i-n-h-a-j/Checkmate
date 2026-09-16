import { cleanDisplayName, normalizeUsername, usernameIdeas, usernameProblem } from './username';

describe('usernames', () => {
  it('normalizes what players type', () => {
    expect(normalizeUsername('  @Queen Bee ')).toBe('queen_bee');
  });

  it('explains invalid usernames', () => {
    expect(usernameProblem('ab')).toContain('at least 3');
    expect(usernameProblem('a'.repeat(21))).toContain('20 characters');
    expect(usernameProblem('no-dashes')).toContain('lowercase letters');
    expect(usernameProblem('admin')).toContain('reserved');
    expect(usernameProblem('rook_42')).toBeNull();
  });

  it('suggests only valid ideas from a display name', () => {
    const ideas = usernameIdeas('Ada Lovelace', () => 0);
    expect(ideas).toContain('ada_lovelace');
    expect(ideas.every((idea) => usernameProblem(idea) === null)).toBe(true);
  });

  it('cleans display names', () => {
    expect(cleanDisplayName('   ')).toBe('Player');
    expect(cleanDisplayName('A  very   long name that keeps going on')).toHaveLength(24);
  });
});
