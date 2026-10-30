/* Odds provider. Points game only — these decimals are not cash prices and are never described as live bookmaker odds.
   Order: admin-entered price for that option, else 1/probability with a small margin.
   A remote provider (for example The Odds API, env ODDS_API_KEY) can replace quote() later; without a mapper it falls back to the local provider. */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.Odds = factory(); })(this, function () {
  const MARGIN = 0.05, MIN = 1.05, MAX = 15;
  const NAMES = { '1X2': 'Match Result', DC: 'Double Chance', OU05: 'Over/Under 0.5', OU15: 'Over/Under 1.5', OU25: 'Over/Under 2.5', OU35: 'Over/Under 3.5', BTTS: 'Both Teams To Score', DNB: 'Draw No Bet', HT1X2: '1st Half Result' };
  const SEL = { '1': 'Home', '2': 'Away', X: 'Draw', '1X': 'Home or Draw', '12': 'Home or Away', X2: 'Draw or Away', Y: 'Yes (GG)', N: 'No (NG)', O: 'Over', U: 'Under' };
  const LINES = { OU05: 0.5, OU15: 1.5, OU25: 2.5, OU35: 3.5 };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const round2 = n => Math.round(Number(n) * 100) / 100;

  function priceFromProb(p) {
    const fair = !(p > 0) ? MAX : (1 / p) / (1 + MARGIN);
    return round2(Math.min(MAX, Math.max(MIN, fair)));
  }
  function parseOdds(text) {
    if (!text) return {};
    if (typeof text === 'object') return text;
    try { const o = JSON.parse(text); return o && typeof o === 'object' ? o : {}; } catch { return {}; }
  }
  function sourceLabel(source) { return source === 'admin' ? 'Set by admin' : 'Estimated'; }
  function shortSource(source) { return source === 'admin' ? 'Admin' : 'Est.'; }
  function selLabel(market, sel) {
    if (LINES[market]) return (sel === 'O' ? 'Over ' : 'Under ') + LINES[market];
    return SEL[sel] || sel;
  }

  function createLocalProvider(assess) {
    return {
      id: 'local',
      quote(fixture, market, selection) {
        const admin = parseOdds(fixture && fixture.option_odds);
        const raw = admin[market] && admin[market][selection];
        const n = Number(raw);
        if (raw != null && String(raw).trim() !== '' && Number.isFinite(n) && n >= MIN && n <= MAX) return { decimal: round2(n), source: 'admin' };
        const info = assess(fixture || {});
        const p = info.probs[market] && info.probs[market][selection];
        return { decimal: priceFromProb(p), source: 'estimated' };
      }
    };
  }

  /* Extension point. Wire The Odds API here later (GET /v4/sports/{sport}/odds?apiKey=ODDS_API_KEY).
     Until that mapper exists, every quote uses the local provider so no key is required. */
  function createRemoteProvider({ apiKey, fallback }) {
    return {
      id: 'the-odds-api',
      configured: !!apiKey,
      quote(fixture, market, selection) { return fallback.quote(fixture, market, selection); }
    };
  }

  function createOddsProvider({ assess, env } = {}) {
    const local = createLocalProvider(assess || (() => ({ probs: {} })));
    const key = env && env.ODDS_API_KEY;
    return key ? createRemoteProvider({ apiKey: key, fallback: local }) : local;
  }

  function product(nums) {
    if (!nums.length) return 0;
    return round2(nums.reduce((a, n) => a * Number(n), 1));
  }

  function settleTicket(stake, legs) {
    let factor = 1;
    for (const leg of legs) {
      if (leg.status == null || leg.status === 'pending') return { status: 'open', payout: 0, factor: null };
      if (leg.status === 'lost') return { status: 'lost', payout: 0, factor: 0 };
      factor *= leg.status === 'void' ? 1 : Number(leg.odds);
    }
    const allVoid = legs.length > 0 && legs.every(l => l.status === 'void');
    return { status: allVoid ? 'void' : 'won', payout: Math.round(Number(stake) * factor), factor: round2(factor) };
  }

  function collectAdminOdds(get, order, markets) {
    const out = {};
    for (const k of order) {
      const opts = markets[k] && markets[k].opts || [];
      for (const [sel] of opts) {
        const raw = get('odd_' + k + '_' + sel);
        if (raw == null || String(raw).trim() === '') continue;
        const n = Number(raw);
        if (!Number.isFinite(n) || n < MIN || n > MAX) return { error: 'Odds must be between 1.05 and 15, or left blank.' };
        (out[k] ||= {})[sel] = round2(n);
      }
    }
    return { odds: out, json: Object.keys(out).length ? JSON.stringify(out) : null };
  }

  function renderSlip(o) {
    const loggedIn = !!o.loggedIn;
    const legs = o.legs || [];
    const balance = o.balance == null ? 0 : o.balance;
    const mult = product(legs.map(l => l.decimal));
    const stake0 = Math.min(10, Math.max(balance, 0)) || 0;
    const demo = !!o.demo;
    const rows = legs.map(l => `<div class="slip-leg"><div class="grow"><b>${esc(l.home_team)} vs ${esc(l.away_team)}</b><div class="small muted">${esc(l.marketName || NAMES[l.market] || l.market)} · ${esc(l.selLabel || selLabel(l.market, l.selection))}</div><div class="small">${Number(l.decimal).toFixed(2)} <span class="odd-src">${esc(shortSource(l.source))}</span></div></div><form ${demo ? `action="#" data-action="slip-remove" data-fid="${esc(l.fixture_id)}" data-market="${esc(l.market)}"` : 'method="post" action="/slip/remove"'}><input type="hidden" name="fixture_id" value="${esc(l.fixture_id)}"><input type="hidden" name="market" value="${esc(l.market)}"><button class="icon-btn" type="submit" title="Remove">✕</button></form></div>`).join('');
    const note = legs.some(l => l.source === 'admin') && legs.some(l => l.source !== 'admin')
      ? 'Some prices were set by an admin. The rest are estimated — not live bookmaker prices.'
      : (legs.some(l => l.source === 'admin') ? 'Prices on this slip were set by an admin — not live bookmaker prices.' : 'Estimated prices — not live bookmaker prices.');
    const body = !loggedIn
      ? '<p class="small muted">Log in to build a combined slip. Points only — no real money.</p>'
      : !legs.length
        ? '<p class="small muted">Tap a price to add it. One option per market on each match. Points only — no real money.</p>'
        : `<div class="slip-legs">${rows}</div><div class="row between"><span class="small">Combined odds</span><b>${mult.toFixed(2)}×</b></div><form class="slip-stake" ${demo ? 'action="#" data-action="slip-place"' : 'method="post" action="/slip/place"'} data-mult="${mult}"><label>Stake<input type="number" name="stake" min="1" max="${balance}" step="1" value="${stake0 || 1}" data-stake ${balance < 1 ? 'disabled' : ''}></label><div class="row between"><span class="small">Potential return</span><b data-return>${Math.round((stake0 || 0) * mult)}</b></div><button class="btn block" type="submit" ${balance < 1 ? 'disabled' : ''}>Place slip</button></form><p class="small muted">${esc(note)} A losing leg loses the stake. A void leg (such as Draw No Bet on a draw) counts as 1.00.</p>`;
    const bar = loggedIn && legs.length ? `<button type="button" class="slip-bar" data-slip-open><span>Slip · ${legs.length}</span><b>${mult.toFixed(2)}×</b></button>` : '';
    return `<div class="slip-dock" data-slip>${bar}<aside class="slip-panel card"><div class="row between slip-head"><div><b>Combined slip</b><div class="small muted">Balance ${balance} pts</div></div><button type="button" class="icon-btn slip-close" data-slip-close aria-label="Close slip">✕</button></div>${body}</aside></div>`;
  }

  return { MARGIN, MIN, MAX, priceFromProb, parseOdds, sourceLabel, shortSource, createLocalProvider, createRemoteProvider, createOddsProvider, product, settleTicket, collectAdminOdds, renderSlip, selLabel, NAMES };
});
