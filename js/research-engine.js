// Indizilla Research — simulation engine (MOCK).
// Every function here is a pure, swappable stand-in for what a server-side LLM
// (Supabase Edge Function) will eventually produce. Nothing here is billed or
// trusted: credit deduction and persistence happen server-side (see research-db.js
// → RPCs). Output is seeded from the study inputs so a given study is stable.
//
// To go live later: replace generateSurvey / simulatePanel / synthesizeMemo /
// followupAnswer with Edge Function calls. The shapes returned here are the
// contract the UI depends on — keep them.

window.ResearchEngine = (() => {

  /* ---- tiny seeded PRNG so results are deterministic per study ---- */
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  }
  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

  const VAGUE = ['thing', 'stuff', 'better', 'good', 'nice', 'some', 'improve', 'platform', 'solution', 'app'];

  /* ---- 1. Study Fit: a lightweight input linter before spending credits ---- */
  function studyFit(idea, decision) {
    idea = (idea || '').trim();
    decision = (decision || '').trim();
    const issues = [];
    if (idea.length < 40) issues.push('Your idea is very short — add who it is for and what problem it solves so personas can react to something concrete.');
    if (!decision) issues.push('No decision question yet. Personas answer best when you tell us the one call you are trying to make.');
    else if (decision.length < 20) issues.push('The decision question is thin — spell out the specific choice (e.g. “Should we launch at ₹X or ₹Y?”).');
    const words = idea.toLowerCase().split(/\W+/);
    const vagueHits = VAGUE.filter(v => words.includes(v));
    if (vagueHits.length >= 2) issues.push('The description leans on broad words (' + vagueHits.slice(0, 3).join(', ') + '). More specifics make the panel sharper.');
    if (!/\b(found(er|ing)?|pm|product manager|ceo|cto|manager|owner|team|user|customer|consumer|shopper|buyer|client|student|pupil|smb|enterprise|b2b|b2c|professional|patient|subscriber|member)/i.test(idea + ' ' + decision)) {
      issues.push('No clear audience is implied. You can refine it on the next step, but naming a rough audience helps.');
    }
    return { ok: issues.length === 0, level: issues.length === 0 ? 'good' : 'review', issues };
  }

  /* ---- 2. Audience inference from the free-text idea ---- */
  const ROLE_HINTS = [
    [/found|startup|saas|mrr|churn/i, ['Founder', 'Product Manager']],
    [/shop|retail|store|d2c|ecommerce|catalog/i, ['Consumer', 'Small Business Owner']],
    [/student|college|campus|exam|course/i, ['Student']],
    [/enterprise|b2b|procurement|it team|cto/i, ['CTO', 'IT Manager', 'Procurement Lead']],
    [/market|campaign|ad|brand|content/i, ['Marketing Manager', 'Founder']]
  ];
  const INDUSTRY_HINTS = [
    [/health|clinic|patient|wellness/i, 'Healthcare'],
    [/fin|bank|invest|payment|upi/i, 'Fintech'],
    [/food|restaurant|grocery|kitchen/i, 'Food & Beverage'],
    [/edu|learn|course|tutor/i, 'Education'],
    [/travel|hotel|trip|booking/i, 'Travel']
  ];
  function inferAudience(idea, decision) {
    const text = (idea || '') + ' ' + (decision || '');
    let roles = ['Founder', 'Product Manager'];
    for (const [re, r] of ROLE_HINTS) if (re.test(text)) { roles = r; break; }
    let industry = 'General / Cross-industry';
    for (const [re, ind] of INDUSTRY_HINTS) if (re.test(text)) { industry = ind; break; }
    const b2b = /\b(b2b|enterprise|procurement|saas|team|cto|it)\b/i.test(text);
    return {
      markets: /india|₹|inr|bharat/i.test(text) ? ['India'] : ['India', 'United States'],
      ages: b2b ? ['25-34', '35-44'] : ['18-24', '25-34', '35-44'],
      roles,
      company: b2b ? 'Small to mid-size teams (10–200 people)' : '',
      industry,
      attitude: { tech: b2b ? 65 : 45, skeptics: 40, pushback: 6 },
      diversity: 'Balanced across gender; mixed income bands',
      notes: '',
      inferred: true
    };
  }

  /* ---- 3. Survey generation ---- */
  function generateSurvey(idea, decision, audience) {
    const r = rng(hash('survey' + idea + decision));
    const q = (text, type) => ({ id: 'q_' + Math.floor(r() * 1e6).toString(36), text, type });
    const openers = [
      'When you first read this idea, what is your gut reaction in one line?',
      'What problem — if any — does this solve for someone like you?'
    ];
    const middles = [
      'How are you handling this today, and what does it cost you (time, money, hassle)?',
      'What would have to be true for you to switch to something new?',
      'Which single feature would make this a clear “yes” for you?'
    ];
    const closers = [
      'If this existed today, how likely are you to try it? (1 = never, 5 = today)',
      'What is the strongest reason you would NOT use this?'
    ];
    return [
      q(pick(r, openers), 'open'),
      q(pick(r, middles), 'open'),
      q('Would you pay for this? If yes, what feels fair per month?', 'open'),
      q(pick(r, middles), 'open'),
      q(pick(r, closers), 'scale'),
      q(pick(r, closers.concat('What would you call this in your own words?')), 'open')
    ];
  }

  /* ---- 4. Persona panel simulation ---- */
  const FIRST = ['Aarav', 'Diya', 'Kabir', 'Meera', 'Rohan', 'Sara', 'Ishaan', 'Priya', 'Neel', 'Ananya', 'Vikram', 'Zoya', 'Arjun', 'Nisha', 'Dev', 'Tara'];
  const SENTIMENTS = ['positive', 'positive', 'neutral', 'skeptical', 'skeptical'];
  const POS = [
    'This would genuinely save me time — I have wanted something like it for a while.',
    'The value is obvious in the first ten seconds. I would try it this week.',
    'Finally. I currently duct-tape three tools to do this.'
  ];
  const NEU = [
    'Interesting, but I would need to see it work on my own data first.',
    'I get the idea; the question is whether it is meaningfully better than what I do now.',
    'Could be useful — depends entirely on the price and how much setup it needs.'
  ];
  const SKEP = [
    'I do not trust results I cannot verify. What is the catch?',
    'This feels like a nice-to-have, not something I would pay for.',
    'My current workaround is free. You would have to be dramatically better.'
  ];
  const OBJECTIONS = [
    'Not sure the output is trustworthy enough to bet a real decision on.',
    'Price is a real barrier for early-stage teams.',
    'Setup and onboarding effort could kill it before it proves value.',
    'Too similar to just asking a general AI chatbot — needs a clearer edge.',
    'Data privacy — I would want to know exactly what happens to my inputs.'
  ];

  function simulatePanel(study) {
    const { idea = '', decision_q = '', audience = {}, respondents = 50 } = study;
    const r = rng(hash('panel' + idea + decision_q + respondents));
    const skew = clamp((audience.attitude && audience.attitude.skeptics) || 40, 0, 100);
    const n = respondents;
    let pos = 0, neu = 0, skp = 0, scoreSum = 0;
    const shown = [];
    for (let i = 0; i < n; i++) {
      // Skepticism setting biases the sentiment mix.
      const roll = r() * 100;
      let sentiment;
      if (roll > skew + 25) sentiment = 'positive';
      else if (roll > skew - 10) sentiment = 'neutral';
      else sentiment = 'skeptical';
      if (sentiment === 'positive') pos++; else if (sentiment === 'neutral') neu++; else skp++;
      const score = sentiment === 'positive' ? 4 + Math.round(r()) : sentiment === 'neutral' ? 3 : 1 + Math.round(r());
      scoreSum += score;
      if (shown.length < 12) {
        const bank = sentiment === 'positive' ? POS : sentiment === 'neutral' ? NEU : SKEP;
        shown.push({
          name: pick(r, FIRST) + ' ' + pick(r, ['M.', 'K.', 'R.', 'S.', 'P.', 'V.']),
          role: pick(r, (audience.roles && audience.roles.length ? audience.roles : ['Founder'])),
          sentiment,
          score,
          quote: pick(r, bank)
        });
      }
    }
    return { n, pos, neu, skp, avgScore: +(scoreSum / n).toFixed(1), shown, seed: hash(idea + decision_q) };
  }

  /* ---- 5. Decision Memo synthesis ---- */
  function synthesizeMemo(study, panel) {
    const r = rng(panel.seed);
    const posPct = Math.round((panel.pos / panel.n) * 100);
    const skpPct = Math.round((panel.skp / panel.n) * 100);
    let verdict, headline;
    if (posPct >= 55 && panel.avgScore >= 3.6) {
      verdict = 'go';
      headline = 'The panel leans clearly positive — there is a real signal worth pursuing.';
    } else if (posPct >= 35) {
      verdict = 'conditional';
      headline = 'A promising core, but conditional — the idea works for a segment, not everyone.';
    } else {
      verdict = 'no';
      headline = 'Weak pull as framed — reshape the idea or the audience before investing more.';
    }
    const segRoles = (study.audience && study.audience.roles) || ['Founders'];
    const segment = {
      name: pick(r, segRoles) + 's in ' + (((study.audience || {}).markets || ['India'])[0]),
      pct: clamp(posPct + Math.round(r() * 12), 20, 92)
    };
    const objection = pick(r, OBJECTIONS);
    const nextTests = [
      'Run a 5-person live interview with the strongest segment to pressure-test the top objection.',
      'Put a fake-door landing page in front of 200 visitors and measure click-to-signup.',
      'Test two price points with a smaller Pulse study to find the ceiling.',
      'Reframe the headline around the winning segment and re-run to confirm lift.'
    ];
    return {
      verdict,
      headline,
      confidence: verdict === 'go' ? 'High' : verdict === 'conditional' ? 'Medium' : 'Low',
      stats: [
        { value: posPct + '%', label: 'reacted positively' },
        { value: panel.avgScore + '/5', label: 'mean intent to try' },
        { value: skpPct + '%', label: 'were hard skeptics' }
      ],
      segment,
      objection,
      nextTest: pick(r, nextTests),
      generatedAt: new Date().toISOString()
    };
  }

  /* ---- 6. Follow-up chat answer (mock) ---- */
  function followupAnswer(study, question) {
    const r = rng(hash((question || '') + (study.id || '')));
    const memo = study.memo || {};
    const frames = [
      'Across the panel, the pattern is consistent: ',
      'If you segment by intent, the picture is: ',
      'The honest read from the simulated respondents: '
    ];
    const bodies = [
      'the people who liked it did so for a concrete time-saving, while the skeptics kept circling back to trust and price.',
      'your strongest segment (' + ((memo.segment || {}).name || 'the core audience') + ') is meaningfully more receptive than the average respondent.',
      'the top objection — “' + (memo.objection || 'is it trustworthy?') + '” — shows up even among people who otherwise liked the idea.'
    ];
    return pick(r, frames) + pick(r, bodies) + ' (Simulated panel — validate the strongest signal with a small real-world test.)';
  }

  return { studyFit, inferAudience, generateSurvey, simulatePanel, synthesizeMemo, followupAnswer };
})();
