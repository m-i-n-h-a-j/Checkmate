import { isRoomCode, pairId, roomCode, sanitizeRoomCode } from './ids';

describe('room codes', () => {
  it('generates valid 6-character codes without look-alike characters', () => {
    for (let i = 0; i < 200; i++) {
      const code = roomCode();
      expect(isRoomCode(code)).toBe(true);
      expect(code).not.toMatch(/[01IO]/);
    }
  });

  it('sanitizes typed input', () => {
    expect(sanitizeRoomCode('ab c-2o1z9xyz')).toBe('ABC2Z9');
  });
});

describe('pairId', () => {
  it('is the same regardless of order', () => {
    expect(pairId('bob', 'alice')).toBe('alice_bob');
    expect(pairId('alice', 'bob')).toBe('alice_bob');
  });
});
