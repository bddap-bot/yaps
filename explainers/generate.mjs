import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = new URL('./', import.meta.url);
const repo = new URL('../', here);
const read = name => fs.readFileSync(new URL(name, here));
const sha = name => crypto.createHash('sha256').update(read(name)).digest('hex');
const flat = s => s.replace(/\s+/g, ' ');

function load(n) {
  const suffix = n === 1 ? '' : `-${n}`;
  const run = JSON.parse(read(`results${suffix}.json`));
  if (sha(`prompt${suffix}.txt`) !== run.prompt_sha256 || sha(`message${suffix}.txt`) !== run.message_sha256)
    throw new Error(`run ${n}: prompt or message file differs from the recorded hash`);
  const personChecks = JSON.parse(read(`person-checks${suffix}.json`));
  for (const [key, checks] of Object.entries(personChecks)) {
    const text = flat(run.answers.find(a => a.key === key).text);
    for (const q of checks.flatMap(c => c.quotes)) if (!text.includes(q)) throw new Error(`run ${n}, ${key}: not in the answer: ${q}`);
  }
  if (run.answers.some((a, i) => a.rank !== i + 1)) throw new Error(`run ${n}: answers are not in rank order`);
  return { n, ...run, personChecks };
}
const [run1, run2] = [load(1), load(2)];
const [m1, p1, m2, p2] = ['message.txt', 'prompt.txt', 'message-2.txt', 'prompt-2.txt'].map(read);
if (!m1.subarray(m1.length - p1.length).equals(p1) || !Buffer.concat([m1.subarray(0, m1.length - p1.length), p2]).equals(m2))
  throw new Error('run 2 did not send run 1\'s thread with its own prompt');
const keys = run => run.answers.map(a => a.key).sort().join();
if (keys(run1) !== keys(run2) || run1.judge !== run2.judge) throw new Error('run 2 must answer each run-1 entry exactly once, under the same judge');
const run1By = Object.fromEntries(run1.answers.map(a => [a.key, a]));

const MAKER = { anthropic: 'Anthropic', openai: 'OpenAI', codex: 'OpenAI', moonshot: 'Moonshot' };
const PATH = { anthropic: 'Anthropic API', openai: 'OpenAI API', codex: 'ChatGPT sub', moonshot: 'Moonshot API' };
const COLOR = { Anthropic: '#2a78d6', OpenAI: '#eb6834', Moonshot: '#1baf7a' };
const ANTHROPIC_EFFORT = {
  'API default: adaptive thinking, effort medium': 'adaptive, medium',
  'API default: adaptive thinking, effort high': 'adaptive, high',
  'API default: adaptive thinking (always on), effort high': 'adaptive, high',
  'API default: no extended thinking, effort high': 'no thinking, high',
  'API default: no extended thinking (no effort setting)': 'no thinking',
};

function effort(a) {
  switch (a.provider) {
    case 'anthropic': return ANTHROPIC_EFFORT[a.effort];
    case 'openai': return a.effort_reported_by_api ?? 'no reasoning mode';
    case 'codex': return `${a.effort_reported_by_api}*`;
    case 'moonshot': return 'thinking on';
  }
}

const outputTokens = u => u.output_tokens ?? u.completion_tokens;
const reasoningTokens = u => {
  const d = u.output_tokens_details ?? u.completion_tokens_details;
  return d?.reasoning_tokens ?? d?.thinking_tokens ?? 0;
};
const num = n => n.toLocaleString('en-US');
const signed = n => n > 0 ? `+${num(n)}` : n < 0 ? `−${num(-n)}` : '±0';
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

const W = 900, rowH = 17, left = 250, bottom = 44;
const dot = (cx, cy, c, hollow) => hollow
  ? `<circle cx="${cx}" cy="${cy}" r="4.5" fill="#fcfcfb" stroke="${c}" stroke-width="2.5"/>`
  : `<circle cx="${cx}" cy="${cy}" r="5" fill="${c}" stroke="#fcfcfb" stroke-width="2"/>`;

function chart({ title, subtitle, rows, panels, width = W }) {
  const ly = 66 + 18 * (subtitle.length - 1), top = ly + (panels.some(p => p.header) ? 48 : 20);
  const H = top + rows.length * rowH + bottom, end = top + rows.length * rowH;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${H}" viewBox="0 0 ${width} ${H}" font-family="DejaVu Sans, system-ui, sans-serif">`,
    `<rect width="${width}" height="${H}" fill="#fcfcfb"/>`,
    `<text x="24" y="32" font-size="18" font-weight="600" fill="#0b0b0b">${esc(title)}</text>`,
    ...subtitle.map((s, i) => `<text x="24" y="${54 + 18 * i}" font-size="13" fill="#52514e">${esc(s)}</text>`),
  ];
  let lx = 24;
  for (const [maker, c] of Object.entries(COLOR)) {
    parts.push(`<rect x="${lx}" y="${ly}" width="12" height="12" rx="2" fill="${c}"/>`,
      `<text x="${lx + 18}" y="${ly + 10}" font-size="12" fill="#52514e">${maker}</text>`);
    lx += 18 + maker.length * 8 + 22;
  }
  if (panels.some(p => p.from))
    for (const [label, hollow] of [['run 1', true], ['run 2', false]]) {
      parts.push(dot(lx + 6, ly + 6, hollow ? '#898781' : '#52514e', hollow), `<text x="${lx + 18}" y="${ly + 10}" font-size="12" fill="#52514e">${label}</text>`);
      lx += 18 + label.length * 8 + 22;
    }
  const scale = p => v => p.x0 + (v / p.max) * p.width;
  for (const p of panels) {
    const x = scale(p);
    if (p.band) parts.push(`<rect x="${x(p.band[0])}" y="${top - 6}" width="${x(p.band[1]) - x(p.band[0])}" height="${end - top + 6}" fill="#eeede6"/>`);
    if (p.header) parts.push(`<text x="${p.x0}" y="${top - 14}" font-size="12.5" font-weight="600" fill="#0b0b0b">${esc(p.header)}</text>`);
    for (const v of p.ticks)
      parts.push(`<line x1="${x(v)}" y1="${top - 6}" x2="${x(v)}" y2="${end}" stroke="#e1e0d9" stroke-width="1"/>`,
        `<text x="${x(v)}" y="${H - 18}" font-size="12" fill="#898781" text-anchor="middle">${num(v)}</text>`);
  }
  rows.forEach((r, i) => {
    const cy = top + i * rowH + rowH / 2, c = COLOR[MAKER[r.provider]];
    const label = `${i + 1}. ${r.model}${r.provider === 'codex' ? ' (subscription)' : ''}`;
    parts.push(`<text x="${left - 10}" y="${cy + 4}" font-size="11.5" fill="#0b0b0b" text-anchor="end">${esc(label)}</text>`);
    for (const p of panels) {
      const x = scale(p), v = p.value(r);
      if (p.from) {
        const v0 = p.from(r);
        parts.push(`<line x1="${x(v0)}" y1="${cy}" x2="${x(v)}" y2="${cy}" stroke="${c}" stroke-width="2" stroke-opacity="0.45"/>`,
          dot(x(v0), cy, '#898781', true),
          dot(x(v), cy, c, false),
          `<text x="${x(Math.max(v, v0)) + 10}" y="${cy + 4}" font-size="11.5" fill="#52514e">${num(v)} <tspan fill="#898781">(${signed(v - v0)})</tspan></text>`);
        continue;
      }
      parts.push(`<line x1="${x(0)}" y1="${cy}" x2="${x(v)}" y2="${cy}" stroke="${c}" stroke-width="2" stroke-opacity="0.45"/>`,
        dot(x(v), cy, c, r.provider === 'codex'),
        `<text x="${x(v) + 10}" y="${cy + 4}" font-size="11.5" fill="#52514e">${num(v)}</text>`);
    }
  });
  parts.push('</svg>');
  return parts.join('\n');
}

function png(svg, name) {
  const out = fileURLToPath(new URL(`assets/${name}`, repo));
  execFileSync('rsvg-convert', ['-z', '2', '-o', out], { input: svg });
  execFileSync('oxipng', ['-q', '-o', '4', '--strip', 'safe', out]);
}

png(chart({
  title: "Blind judge score for each entry's explanation (out of 100)",
  subtitle: [`One answer per entry, judged by ${run1.judge} without names. Hollow dot: ChatGPT subscription path.`],
  rows: run1.answers,
  panels: [{ x0: left, width: 590, max: 100, ticks: [0, 20, 40, 60, 80, 100], value: a => a.total }],
}), 'explainer-scores.png');

png(chart({
  title: "Length of each entry's explanation, in words and in output tokens",
  subtitle: ['Sorted by words; the prompt asked for 400 to 600 (shaded). Hollow dot: ChatGPT subscription path.',
    "Output tokens: each API's own count, hidden reasoning included; tokenizers differ even within one maker."],
  rows: [...run1.answers].sort((a, b) => b.words - a.words),
  panels: [
    { x0: left, width: 270, max: 800, ticks: [0, 200, 400, 600, 800], band: [400, 600], header: 'Words in the answer', value: a => a.words },
    { x0: 575, width: 265, max: 3500, ticks: [0, 1000, 2000, 3000], header: 'Output tokens', value: a => outputTokens(a.usage) },
  ],
}), 'explainer-verbosity.png');

const wordsMax = Math.ceil(Math.max(...[run1, run2].flatMap(r => r.answers.map(a => a.words))) / 500) * 500;
png(chart({
  title: 'Words and score for each entry, from run 1 to run 2',
  subtitle: [`Grey ring: run 1. Dot: run 2, with its value and the change from run 1. Sorted by run-2 score; both runs judged blind by ${run2.judge}.`,
    'Run 1 asked for 400 to 600 words for a non-programmer; run 2 asked for no length, for a programmer.'],
  rows: run2.answers,
  width: 1060,
  panels: [
    { x0: left, width: 290, max: wordsMax, ticks: Array.from({ length: wordsMax / 500 + 1 }, (_, i) => i * 500), header: 'Words in the answer',
      from: a => run1By[a.key].words, value: a => a.words },
    { x0: 680, width: 300, max: 100, ticks: [0, 20, 40, 60, 80, 100], header: 'Score out of 100', from: a => run1By[a.key].total, value: a => a.total },
  ],
}), 'explainer-words-scores-2.png');

const answersUrl = "{{ '/explainers/' | relative_url }}";
const scoreParts = a => `${a.understanding} · ${a.accuracy} · ${a.accessibility} · ${a.calibration}`;
fs.writeFileSync(new URL('_includes/explainer-table.md', repo), [
  '| Rank | Model | Access path | Effort | Score | Parts | Words |',
  '|---:|---|---|---|---:|:---:|---:|',
  ...run1.answers.map(a => `| ${a.rank} | [${a.model}](${answersUrl}#${a.key}) | ${PATH[a.provider]} | ${effort(a)} | **${a.total}** | ${scoreParts(a)} | ${a.words} |`),
].join('\n') + '\n');

fs.writeFileSync(new URL('_includes/explainer-table-2.md', repo), [
  '| Rank | Model | Access path | Effort | Score | Parts | Words | Run 1 |',
  '|---:|---|---|---|---:|:---:|---:|---|',
  ...run2.answers.map(a => `| ${a.rank} | [${a.model}](${answersUrl}#${a.key}--run-2) | ${PATH[a.provider]} | ${effort(a)} | **${a.total}** | ${scoreParts(a)} | ${a.words} | [${run1By[a.key].total} · ${run1By[a.key].words} words](${answersUrl}#${a.key}--run-1) |`),
].join('\n') + '\n');

function escapeHtmlOutsideCode(text) {
  let fence = null, indented = false, blank = true;
  const out = text.trim().split('\n').map(line => {
    const f = line.match(/^\s*(`{3,}|~{3,})/)?.[1];
    const wasBlank = blank;
    blank = !line.trim();
    if (fence) {
      if (f && f[0] === fence[0] && f.length >= fence.length && !line.trim().slice(f.length)) fence = null;
      return line;
    }
    if (f) { fence = f; return line; }
    indented = /^( {4}|\t)/.test(line) && !/^\s*([-*+]|\d+[.)])\s/.test(line) && (indented || wasBlank);
    return indented ? line : line.replace(/(`+)[^`][\s\S]*?\1(?!`)|</g, (m, ticks) => ticks ? m : '&lt;');
  }).join('\n');
  if (fence) throw new Error(`unclosed code fence in an answer starting: ${text.slice(0, 60)}`);
  return out;
}

const code = s => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');
const flags = checks => `<div class="explainer-flag"><p><strong>Model errors about a real person</strong>: claims the thread does not support.</p><ul>`
  + checks.map(c => `<li>${c.quotes.map(q => `“${esc(q)}”`).join(', ')}: ${esc(c.note)}</li>`).join('') + '</ul></div>';
const answer = (run, a) => {
  const out = outputTokens(a.usage), reasoning = reasoningTokens(a.usage);
  return [
    `<h3 id="${a.key}--run-${run.n}">Run ${run.n}: rank ${a.rank}, ${a.total}/100</h3>`,
    '',
    `<p>understanding ${a.understanding}/40 · accuracy ${a.accuracy}/30 · accessibility ${a.accessibility}/20 · calibration ${a.calibration}/10<br>`
      + `${a.words} words · ${num(out)} output tokens${reasoning ? ` (${num(reasoning)} reported as reasoning)` : ''} · effort: ${effort(a)}</p>`,
    '',
    ...(run.personChecks[a.key] ? [flags(run.personChecks[a.key]), ''] : []),
    '<div class="explainer-text" markdown="1">',
    '',
    escapeHtmlOutsideCode(a.text),
    '',
    '</div>',
    '',
    `<details><summary>The judge's notes, also model output: ${a.errors.length ? `${a.errors.length} error${a.errors.length > 1 ? 's' : ''} listed` : 'no errors listed'}</summary>`
      + (a.errors.length ? `<ul>${a.errors.map(e => `<li>${code(e)}</li>`).join('')}</ul>` : '')
      + `<p>${code(a.reasoning)}</p></details>`,
    '',
  ];
};
const entry = a2 => [`<h2 id="${a2.key}">${a2.model} · ${PATH[a2.provider]}</h2>`, '', ...answer(run1, run1By[a2.key]), ...answer(run2, a2)].join('\n');

fs.writeFileSync(new URL('index.md', here), [
  '---',
  'layout: default',
  'title: "Every explanation of one Rust bug, from two runs"',
  'description: "Every answer from both runs of the explainer experiment, unedited, each entry\'s two answers together."',
  '---',
  '',
  "Posts: [run 1]({{ '/2026/09/25/eighty-nine-ways-to-explain-a-hole-in-a-table/' | relative_url }}) · [run 2]({{ '/2026/09/27/the-same-bug-with-no-word-limit/' | relative_url }}) · [run 2's design and results]({{ '/explainers/run-2/' | relative_url }})",
  '',
  `Each entry received the same bug thread as its only input, in each of two runs. In run 1 [the message](message.txt) ended with [this prompt](prompt.txt), which asked for 400 to 600 words for a reader who is not a programmer. In run 2 [the message](message-2.txt) ended with [one sentence](prompt-2.txt): “${esc(p2.toString().trim())}” Entries appear in run-2 score order, each with its run-1 answer first. The answers are unedited and rendered as Markdown; [results.json](results.json) and [results-2.json](results-2.json) hold each one's raw text, token usage, scores and the judge's notes. Scores are the blind judge's (${run2.judge}, in both runs); the parts are understanding, accuracy, accessibility and calibration. Effort is each API's default (for OpenAI, the reasoning effort the API reported); \\* marks entries reached through a ChatGPT subscription (ChatGPT sub), which were sent the model's catalog default explicitly. Claims the answers make about people in the thread were checked against it, and those it does not support are marked as model errors above the answer. The judge's notes are model output too: where they say more about a person than the thread does, such as calling the reporter “he” or calling a name invented that the thread merely lacks, that is the judge's error.`,
  '',
  '{% raw %}',
  ...run2.answers.map(entry),
  '{% endraw %}',
].join('\n'));
