import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = new URL('./', import.meta.url);
const repo = new URL('../', here);
const { judge, answers } = JSON.parse(fs.readFileSync(new URL('results.json', here), 'utf8'));
const personChecks = JSON.parse(fs.readFileSync(new URL('person-checks.json', here), 'utf8'));
const flat = s => s.replace(/\s+/g, ' ');
for (const [key, checks] of Object.entries(personChecks)) {
  const text = flat(answers.find(a => a.key === key).text);
  for (const q of checks.flatMap(c => c.quotes)) if (!text.includes(q)) throw new Error(`${key}: not in the answer: ${q}`);
}

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
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

const W = 900, rowH = 17, left = 250, bottom = 44;

function chart({ title, subtitle, top, rows, panels }) {
  const H = top + rows.length * rowH + bottom, end = top + rows.length * rowH;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="DejaVu Sans, system-ui, sans-serif">`,
    `<rect width="${W}" height="${H}" fill="#fcfcfb"/>`,
    `<text x="24" y="32" font-size="18" font-weight="600" fill="#0b0b0b">${esc(title)}</text>`,
    ...subtitle.map((s, i) => `<text x="24" y="${54 + 18 * i}" font-size="13" fill="#52514e">${esc(s)}</text>`),
  ];
  const ly = 66 + 18 * (subtitle.length - 1);
  let lx = 24;
  for (const [maker, c] of Object.entries(COLOR)) {
    parts.push(`<rect x="${lx}" y="${ly}" width="12" height="12" rx="2" fill="${c}"/>`,
      `<text x="${lx + 18}" y="${ly + 10}" font-size="12" fill="#52514e">${maker}</text>`);
    lx += 18 + maker.length * 8 + 22;
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
      parts.push(`<line x1="${x(0)}" y1="${cy}" x2="${x(v)}" y2="${cy}" stroke="${c}" stroke-width="2" stroke-opacity="0.45"/>`,
        r.provider === 'codex'
          ? `<circle cx="${x(v)}" cy="${cy}" r="4.5" fill="#fcfcfb" stroke="${c}" stroke-width="2.5"/>`
          : `<circle cx="${x(v)}" cy="${cy}" r="5" fill="${c}" stroke="#fcfcfb" stroke-width="2"/>`,
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
  subtitle: [`One answer per entry, judged by ${judge} without names. Hollow dot: ChatGPT subscription path.`],
  top: 86,
  rows: answers,
  panels: [{ x0: left, width: 590, max: 100, ticks: [0, 20, 40, 60, 80, 100], value: a => a.total }],
}), 'explainer-scores.png');

png(chart({
  title: "Length of each entry's explanation, in words and in output tokens",
  subtitle: ['Sorted by words; the prompt asked for 400 to 600 (shaded). Hollow dot: ChatGPT subscription path.',
    "Output tokens: each API's own count, hidden reasoning included; tokenizers differ even within one maker."],
  top: 132,
  rows: [...answers].sort((a, b) => b.words - a.words),
  panels: [
    { x0: left, width: 270, max: 800, ticks: [0, 200, 400, 600, 800], band: [400, 600], header: 'Words in the answer', value: a => a.words },
    { x0: 575, width: 265, max: 3500, ticks: [0, 1000, 2000, 3000], header: 'Output tokens', value: a => outputTokens(a.usage) },
  ],
}), 'explainer-verbosity.png');

const answersUrl = "{{ '/explainers/' | relative_url }}";
fs.writeFileSync(new URL('_includes/explainer-table.md', repo), [
  '| Rank | Model | Access path | Effort | Score | Parts | Words |',
  '|---:|---|---|---|---:|:---:|---:|',
  ...answers.map(a => `| ${a.rank} | [${a.model}](${answersUrl}#${a.key}) | ${PATH[a.provider]} | ${effort(a)} | **${a.total}** | ${a.understanding} · ${a.accuracy} · ${a.accessibility} · ${a.calibration} | ${a.words} |`),
].join('\n') + '\n');

const code = s => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');
const flags = checks => `<div class="explainer-flag"><p><strong>Model errors about a real person</strong>: claims the thread does not support.</p><ul>`
  + checks.map(c => `<li>${c.quotes.map(q => `“${esc(q)}”`).join(', ')}: ${esc(c.note)}</li>`).join('') + '</ul></div>';
const entry = a => {
  const out = outputTokens(a.usage), reasoning = reasoningTokens(a.usage);
  return [
    `<h2 id="${a.key}">${a.rank}. ${a.model} · ${PATH[a.provider]}</h2>`,
    '',
    `<p><strong>${a.total}</strong>/100: understanding ${a.understanding}/40 · accuracy ${a.accuracy}/30 · accessibility ${a.accessibility}/20 · calibration ${a.calibration}/10<br>`
      + `${a.words} words · ${num(out)} output tokens${reasoning ? ` (${num(reasoning)} reported as reasoning)` : ''} · effort: ${effort(a)}</p>`,
    '',
    ...(personChecks[a.key] ? [flags(personChecks[a.key]), ''] : []),
    '<div class="explainer-text" markdown="1">',
    '',
    a.text.trim().replace(/</g, '&lt;'),
    '',
    '</div>',
    '',
    `<details><summary>The judge's notes, also model output: ${a.errors.length ? `${a.errors.length} error${a.errors.length > 1 ? 's' : ''} listed` : 'no errors listed'}</summary>`
      + (a.errors.length ? `<ul>${a.errors.map(e => `<li>${code(e)}</li>`).join('')}</ul>` : '')
      + `<p>${code(a.reasoning)}</p></details>`,
    '',
  ].join('\n');
};

fs.writeFileSync(new URL('index.md', here), [
  '---',
  'layout: default',
  'title: "Eighty-nine explanations of one Rust bug"',
  `description: "Every answer from Eighty-Nine Ways to Explain a Hole in a Table, in score order, unedited."`,
  '---',
  '',
  "[← the post]({{ '/2026/09/25/eighty-nine-ways-to-explain-a-hole-in-a-table/' | relative_url }})",
  '',
  `Each entry received [this message](message.txt), which ends with [this prompt](prompt.txt), as its only input. The answers below are unedited and rendered as Markdown; [results.json](results.json) holds each one's raw text, token usage, scores and the judge's notes. Scores are the blind judge's (${judge}); the parts are understanding, accuracy, accessibility and calibration. Effort is each API's default (for OpenAI, the reasoning effort the API reported); \\* marks entries reached through a ChatGPT subscription (ChatGPT sub), which were sent the model's catalog default explicitly. Claims the answers make about people in the thread were checked against it, and those it does not support are marked as model errors above the answer. The judge's notes are model output too: where they say more about a person than the thread does, such as calling the reporter “he” or calling a name invented that the thread merely lacks, that is the judge's error.`,
  '',
  ...answers.map(entry),
].join('\n'));
