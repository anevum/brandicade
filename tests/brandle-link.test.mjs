import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/app.mjs', import.meta.url), 'utf8');
const URL = 'https://brandle-glimmer-grove.devonakins.workers.dev/';
const cards = [...html.matchAll(/<a class="game-card brandle-card[^>]*>[\s\S]*?<\/a>/g)].map(m => m[0]);

test('Brandle has one directly accessible launcher on home and library', () => {
  assert.equal(cards.length, 2);
  assert.match(html, /<section[^>]*id="home"[^>]*>[\s\S]*?<a class="game-card brandle-card/);
  assert.match(html, /<section[^>]*id="library"[^>]*>[\s\S]*?<a class="game-card brandle-card/);
});

test('each launcher uses a safe native link to the existing game origin', () => {
  for (const card of cards) {
    assert.ok(card.includes(`href="${URL}"`));
    assert.match(card, /target="_blank"/);
    assert.match(card, /rel="noopener noreferrer"/);
    assert.match(card, /aria-label="Play Brandle[^"]*opens the original game/);
    assert.match(card, /data-game-launch="brandle"/);
    assert.doesNotMatch(card, /data-action="brandle"/);
    assert.match(card, /BRANDLE/);
  }
});

test('does not embed the cross-origin game or silently move its browser saves', () => {
  assert.doesNotMatch(html, /<iframe\b/i);
  assert.doesNotMatch(html, /<form[^>]*action="[^"]*brandle/i);
  assert.match(html, /existing progress stays on the original Brandle site/i);
  assert.match(app, /progress stays on its original web address/i);
  assert.match(app, /BRANDLE does not claim its achievements yet/);
});

test('direct launcher stays functional if Brandicade JavaScript fails', () => {
  assert.match(html, /<a class="game-card brandle-card/);
  assert.doesNotMatch(html, /<button class="game-card brandle-card/);
  assert.equal((html.match(/data-game-launch="brandle"/g) || []).length, 2);
});
