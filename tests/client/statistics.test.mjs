import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  statisticsView,
  statDisplay,
} from '../../src/client/shared/match-statistics.js';
test('statistics preserve zero and missing values, percentages and team identity while comparing the correct proportions', () => {
  const dom = new JSDOM(
    statisticsView(
      [
        { label: 'Posse', home: '24', away: '76%', unit: '%' },
        { label: 'Chutes', home: 0, away: 0 },
        { label: 'Faltas', home: null, away: 7 },
      ],
      { name: 'Casa <teste>', logo: 'https://example.com/home.png' },
      { name: 'Visitante', logo: 'https://example.com/away.png' },
    ),
  );
  try {
    const rows = dom.window.document.querySelectorAll('.comparison-row');
    assert.equal(rows.length, 3);
    assert.equal(rows[0].classList.contains('lead-away'), true);
    assert.equal(
      rows[0].querySelector('.comparison-track .home').style.width,
      '24%',
    );
    assert.equal(
      rows[0].querySelector('.comparison-values .away').textContent,
      '76%',
    );
    assert.equal(
      rows[1].querySelector('.comparison-values .home').textContent,
      '0',
    );
    assert.ok(rows[1].querySelector('.empty-track'));
    assert.equal(
      rows[2].querySelector('.comparison-values .home').textContent,
      '—',
    );
    assert.equal(rows[2].querySelector('.comparison-track'), null);
    assert.equal(dom.window.document.querySelectorAll('img').length, 2);
    assert.match(dom.window.document.body.textContent, /Casa <teste>/);
    assert.equal(statDisplay(0, '%'), '0%');
  } finally {
    dom.window.close();
  }
});

test('pass counts with thousands separators retain their proper proportion', () => {
  const dom = new JSDOM(
    statisticsView(
      [{ label: 'Passes', home: '1,200', away: 800 }],
      { name: 'Casa' },
      { name: 'Fora' },
    ),
  );
  try {
    assert.equal(
      dom.window.document.querySelector('.comparison-track .home').style.width,
      '60%',
    );
  } finally {
    dom.window.close();
  }
});
