import { TestBed } from '@angular/core/testing';
import { MusicService } from './music.service';

describe('MusicService', () => {
  let music: MusicService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    music = TestBed.inject(MusicService);
  });

  it('stays quiet through the middlegame', () => {
    music.scene({ live: true, material: 62, timeLeftMs: 300_000 });
    expect(music.cue()).toBeNull();
  });

  it('plays the tension loop once the endgame is reached', () => {
    music.scene({ live: true, material: 20, timeLeftMs: 300_000 });
    expect(music.cue()).toBe('tension');
  });

  it('switches to the clock loop when time runs low, whatever is left on the board', () => {
    music.scene({ live: true, material: 20, timeLeftMs: 29_000 });
    expect(music.cue()).toBe('time');
    music.scene({ live: true, material: 70, timeLeftMs: 5_000 });
    expect(music.cue()).toBe('time');
  });

  it('keeps the clock loop until there is real time again', () => {
    music.scene({ live: true, material: 70, timeLeftMs: 20_000 });
    expect(music.cue()).toBe('time');
    // An increment nudges the clock over the trigger, which is no reason to change the music.
    music.scene({ live: true, material: 70, timeLeftMs: 33_000 });
    expect(music.cue()).toBe('time');
    music.scene({ live: true, material: 70, timeLeftMs: 50_000 });
    expect(music.cue()).toBeNull();
  });

  it('ignores the clock in an untimed game', () => {
    music.scene({ live: true, material: 70, timeLeftMs: null });
    expect(music.cue()).toBeNull();
  });

  it('stops the loops when the game ends', () => {
    music.scene({ live: true, material: 12, timeLeftMs: 8_000 });
    expect(music.cue()).toBe('time');
    music.scene({ live: false, material: 12, timeLeftMs: 8_000 });
    expect(music.cue()).toBeNull();
  });

  it('plays nothing while music is switched off', () => {
    music.toggle();
    expect(music.on()).toBe(false);
    music.scene({ live: true, material: 10, timeLeftMs: 5_000 });
    expect(music.cue()).toBeNull();
  });

  it('remembers the choice', () => {
    music.toggle();
    expect(localStorage.getItem('checkmate.music')).toBe('off');
  });
});
