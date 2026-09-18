import { ChessReplay } from './chess-game';
import { START_FEN, hasBareKing, materialLeft, parseUci, sideToMove } from './notation';

describe('ChessReplay', () => {
  it('starts from the initial position with twenty legal moves', () => {
    const position = new ChessReplay().sync([]);
    expect(position.fen).toBe(START_FEN);
    expect(position.turn).toBe('white');
    expect(position.legal).toHaveLength(20);
    expect(position.dests.get('g1')).toEqual(['f3', 'h3']);
    expect(position.lastMove).toBeNull();
  });

  it('follows a game incrementally and records SAN', () => {
    const replay = new ChessReplay();
    replay.sync(['e2e4']);
    const position = replay.sync(['e2e4', 'e7e5', 'g1f3']);
    expect(position.history).toEqual(['e4', 'e5', 'Nf3']);
    expect(position.turn).toBe('black');
    expect(position.lastMove).toEqual(['g1', 'f3']);
  });

  it('rebuilds when the move list is replaced', () => {
    const replay = new ChessReplay();
    replay.sync(['e2e4', 'e7e5']);
    const position = replay.sync(['d2d4']);
    expect(position.history).toEqual(['d4']);
  });

  it('detects checkmate for the side that delivered it', () => {
    const position = new ChessReplay().sync(['f2f3', 'e7e5', 'g2g4', 'd8h4']);
    expect(position.check).toBe(true);
    expect(position.outcome).toEqual({ result: 'black', reason: 'checkmate' });
    expect(position.legal).toHaveLength(0);
    expect(position.dests.size).toBe(0);
  });

  it('previews a move without keeping it', () => {
    const replay = new ChessReplay();
    replay.sync(['f2f3', 'e7e5', 'g2g4']);
    const mate = replay.preview({ from: 'd8', to: 'h4' });
    expect(mate).toMatchObject({ uci: 'd8h4', san: 'Qh4#', check: true });
    expect(mate?.outcome?.reason).toBe('checkmate');
    expect(replay.preview('Qh4')?.uci).toBe('d8h4');
    expect(replay.sync(['f2f3', 'e7e5', 'g2g4']).history).toHaveLength(3);
    expect(replay.preview({ from: 'e8', to: 'e6' })).toBeNull();
  });

  it('requires a piece for promotions', () => {
    const replay = new ChessReplay();
    const moves = ['h2h4', 'g7g5', 'h4g5', 'h7h6', 'g5h6', 'g8f6', 'h6h7', 'f6g8'];
    replay.sync(moves);
    expect(replay.isPromotion('h7', 'g8')).toBe(true);
    expect(replay.isPromotion('a2', 'a3')).toBe(false);
    expect(replay.preview({ from: 'h7', to: 'g8' })).toBeNull();
    expect(replay.preview({ from: 'h7', to: 'g8', promotion: 'n' })?.uci).toBe('h7g8n');
    const promoted = replay.sync([...moves, 'h7g8n']);
    expect(promoted.lastPromotion).toEqual({ piece: 'n', color: 'white', square: 'g8' });
    expect(promoted.lastCapture).toEqual({ piece: 'n', color: 'black', square: 'g8' });
  });

  it('draws on threefold repetition', () => {
    const shuffle = ['g1f3', 'g8f6', 'f3g1', 'f6g8'];
    const position = new ChessReplay().sync([...shuffle, ...shuffle]);
    expect(position.outcome).toEqual({ result: 'draw', reason: 'threefold' });
  });

  it('stops at an illegal move', () => {
    const position = new ChessReplay().sync(['e2e4', 'e2e4', 'e7e5']);
    expect(position.validPlies).toBe(1);
    expect(position.dests.size).toBe(0);
  });

  it('tracks the material balance and the last capture', () => {
    const position = new ChessReplay().sync(['e2e4', 'd7d5', 'e4d5']);
    expect(position.material).toBe(1);
    expect(position.imbalance).toEqual({ white: ['p'], black: [] });
    expect(position.lastCapture).toEqual({ piece: 'p', color: 'black', square: 'd5' });
    expect(position.kingSquare).toBe('e8');
  });

  it('places an en passant capture on the taken pawn', () => {
    const position = new ChessReplay().sync(['e2e4', 'a7a6', 'e4e5', 'd7d5', 'e5d6']);
    expect(position.lastCapture).toEqual({ piece: 'p', color: 'black', square: 'd5' });
  });
});

describe('chess helpers', () => {
  it('counts the material left on the board', () => {
    expect(materialLeft(START_FEN)).toBe(78);
    expect(materialLeft('8/8/8/4k3/8/8/4K3/8 w - - 0 1')).toBe(0);
    expect(materialLeft('8/8/8/3qk3/8/8/4K1R1/8 w - - 0 1')).toBe(14);
  });

  it('parses UCI moves', () => {
    expect(parseUci('e7e8q')).toEqual({ from: 'e7', to: 'e8', promotion: 'q' });
    expect(parseUci('e2e4')?.promotion).toBeUndefined();
    expect(parseUci('e9e4')).toBeNull();
  });

  it('knows whose turn it is', () => {
    expect(sideToMove(0)).toBe('white');
    expect(sideToMove(3)).toBe('black');
  });

  it('spots a bare king', () => {
    expect(hasBareKing('8/8/4k3/8/8/8/4K3/7R w - - 0 1', 'black')).toBe(true);
    expect(hasBareKing('8/8/4k3/8/8/8/4K3/7R w - - 0 1', 'white')).toBe(false);
  });
});
