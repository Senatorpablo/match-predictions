/* Shared market definitions + settlement. Points-only game: no odds, no money. Works in Node and the browser. */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.Markets = factory(); })(this, function () {
  const sgn = n => Math.sign(n);
  const res = (h, a) => (h > a ? '1' : h < a ? '2' : 'X');
  const ou = line => ({ name: `Over/Under ${line}`, short: `O/U ${line}`, opts: [['O', `Over ${line}`], ['U', `Under ${line}`]], def: 1,
    settle: (s, f) => ((f.home_score + f.away_score > line) === (s === 'O') ? 'won' : 'lost') });
  const MARKETS = {
    '1X2': { name: 'Match Result', short: '1X2', opts: [['1', 'Home'], ['X', 'Draw'], ['2', 'Away']], def: 2,
      settle: (s, f) => (s === res(f.home_score, f.away_score) ? 'won' : 'lost') },
    DC: { name: 'Double Chance', short: 'DC', opts: [['1X', 'Home or Draw'], ['12', 'Home or Away'], ['X2', 'Draw or Away']], def: 1,
      settle: (s, f) => (s.includes(res(f.home_score, f.away_score)) ? 'won' : 'lost') },
    OU05: ou(0.5), OU15: ou(1.5), OU25: ou(2.5), OU35: ou(3.5),
    BTTS: { name: 'Both Teams To Score', short: 'GG/NG', opts: [['Y', 'Yes (GG)'], ['N', 'No (NG)']], def: 1,
      settle: (s, f) => (((f.home_score > 0 && f.away_score > 0) === (s === 'Y')) ? 'won' : 'lost') },
    DNB: { name: 'Draw No Bet', short: 'DNB', opts: [['1', 'Home'], ['2', 'Away']], def: 1,
      settle: (s, f) => (f.home_score === f.away_score ? 'void' : s === res(f.home_score, f.away_score) ? 'won' : 'lost') },
    HT1X2: { name: '1st Half Result', short: 'HT 1X2', opts: [['1', 'Home'], ['X', 'Draw'], ['2', 'Away']], def: 2, needsHT: true,
      settle: (s, f) => (f.ht_home == null || f.ht_away == null ? 'void' : s === res(f.ht_home, f.ht_away) ? 'won' : 'lost') },
    CS: { name: 'Correct Score', short: 'CS', score: true, def: 5 }
  };
  const ORDER = ['1X2', 'DC', 'OU05', 'OU15', 'OU25', 'OU35', 'BTTS', 'DNB', 'HT1X2', 'CS'];
  const DEFAULT = ['1X2', 'DC', 'OU25', 'BTTS', 'CS'];
  const list = str => { const s = String(str || '').split(',').map(x => x.trim()).filter(k => MARKETS[k]); return s.length ? ORDER.filter(k => s.includes(k)) : DEFAULT.slice(); };
  const valid = (m, sel) => !!MARKETS[m] && !MARKETS[m].score && MARKETS[m].opts.some(o => o[0] === sel);
  const settled = f => f.home_score != null && f.away_score != null;
  /** Returns { status: 'won'|'lost'|'void'|null, points } for a one-click pick. pts = { [market]: points } */
  function settle(m, sel, f, pts) {
    if (!settled(f) || !MARKETS[m] || MARKETS[m].score) return { status: null, points: null };
    const status = MARKETS[m].settle(sel, f);
    return { status, points: status === 'won' ? (pts && pts[m] != null ? +pts[m] : MARKETS[m].def) : 0 };
  }
  const label = (m, sel) => { const o = MARKETS[m] && MARKETS[m].opts && MARKETS[m].opts.find(x => x[0] === sel); return o ? o[1] : sel; };
  const escH = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  /** SportyBet-style option grid for one fixture. picks = { [market]: { selection, status, points } }.
   *  o = { open: bool (can pick), action: url for the pick form, pts: points map, loggedIn: bool } */
  function render(f, picks, o) {
    picks = picks || {}; const done = settled(f);
    const blocks = list(f.markets).filter(k => k !== 'CS').map(k => {
      const m = MARKETS[k], mine = picks[k];
      let win = null; if (done) { const t = m.opts.find(x => m.settle(x[0], f) === 'won'); win = t ? t[0] : null; }
      const btns = m.opts.map(([v, l]) => {
        const on = mine && mine.selection === v, cls = ['opt', on ? 'on' : '', on && mine.status ? mine.status : '', win === v ? 'hit' : ''].filter(Boolean).join(' ');
        return `<button class="${cls}" name="selection" value="${escH(v)}" ${o.open ? '' : 'disabled'} aria-pressed="${on ? 'true' : 'false'}" title="${escH(m.name + ': ' + l)}"><b>${escH(v === 'Y' ? 'GG' : v === 'N' ? 'NG' : v)}</b><span>${escH(l)}</span></button>`;
      }).join('');
      const st = mine && mine.status ? `<span class="pill ${mine.status === 'won' ? 'green' : mine.status === 'void' ? '' : 'red'} xs">${mine.status === 'won' ? '+' + mine.points + ' pts' : mine.status === 'void' ? 'Void' : 'Lost'}</span>` : '';
      const pts = o.pts && o.pts[k] != null ? o.pts[k] : m.def;
      return `<form method="post" action="${escH(o.action)}" class="mkt" data-market="${k}"><input type="hidden" name="market" value="${k}"><div class="mkt-h"><span>${escH(m.name)}</span>${st || `<span class="mkt-pts">${pts} pt${pts == 1 ? '' : 's'}</span>`}</div><div class="opts n${m.opts.length}">${btns}</div></form>`;
    });
    return blocks.length ? `<div class="mkts${o.open ? '' : ' closed'}">${blocks.join('')}</div>` : '';
  }
  return { render, MARKETS, ORDER, DEFAULT, list, valid, settle, label, res };
});
