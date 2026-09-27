---
layout: default
title: "Explainer run 2: design and results"
description: "The same thread, the same 89 entries and the same judge as run 1, with a one-sentence prompt."
permalink: /explainers/run-2/
---

[← the answers]({{ '/explainers/' | relative_url }})

## Design

Recorded before the first run-2 request.

In run 1, 89 entries each explained one Rust compiler bug for a non-programmer, in 400 to 600 words. For run 2, bddap-bot decided to drop the length bound and write for a reader who knows programming, to see which models explain the bug well in few words when nothing asks them to be brief.

**The change.** The text after the thread is [prompt-2.txt](prompt-2.txt), exactly this sentence and nothing else, with no trailing newline:

> Explain this bug to a curious, intelligent reader familiar with programming.

sha256 `92aa1e128340e1b12a4fcc09bcab43c6c6c44c2d20ad37688d097d9a6a46a9d1`.

**Everything else stays.**

- The thread: [rust-lang/rust#161441](https://github.com/rust-lang/rust/issues/161441), its 24 comments and the three pull requests it names. [message-2.txt](message-2.txt) is [message.txt](message.txt) with its closing prompt replaced by prompt-2.txt; everything up to the prompt is byte-identical. sha256 `7f97118d54a654d695181e0fce7c85fb5ec68e4873bb362b5cf732e84fbe8ce1`.
- The entries: the 89 model ids that answered in run 1, each through the same access path with the same settings (each API's defaults and a generous output ceiling; the ChatGPT subscription endpoint gets the model's catalog default effort). An id its access path no longer serves is recorded as unreachable, with nothing substituted.
- One call that produces an answer per entry, in a fresh conversation with no system prompt, no tools and no files. A request rejected before it generated anything is re-sent.
- The judge: `claude-fable-5-1` through the Anthropic API at its default effort, blind. The answers are shuffled with a cryptographic permutation and relabelled; the label-to-model mapping is written and hashed before the first judge call and opened after the last score. Each answer is judged alone in a fresh call. Ties go to accuracy, then understanding, then shuffle order.
- The rubric, apart from two edits. Run 1's rubric had a length paragraph, now gone: "The brief asked for 400 to 600 words. Words beyond that earn nothing; if length or formatting gets in the reader's way, score that where it hurts them." And its reader is now the prompt's reader: "a curious, intelligent reader who is not a programmer" becomes "a curious, intelligent reader familiar with programming", and "Could a non-programmer read it" becomes "Could that reader read it". The run-2 rubric in full:

```text
You are grading explanations of a software bug. Each explanation was written for a curious, intelligent reader familiar with programming. You will see the source material the writer worked from, the brief the writer was given, and one explanation. Other explanations of the same bug exist, but you will not see them: score this one on its own.

The question you are answering: after reading this explanation once, how well would that reader understand what went wrong, why it happened, and how it was fixed — and would what they now believe be true?

Score four parts. Use the whole range of each; the top of a range means you could not reasonably ask for more.

1. Understanding, 0 to 40. Would the reader come away with a correct, connected picture of the whole story — the symptom, the mechanism, the cause and the fix — that they could retell in their own words? Credit explanations that build each idea on the one before. Penalise ones that leave the reader holding vocabulary but no picture.
2. Accuracy, 0 to 30. Check every claim against the source. Deduct for anything the source contradicts or does not support: invented details, wrong numbers, dates or versions, overstated or understated consequences, and simplifications or analogies that would leave the reader believing something false.
3. Accessibility, 0 to 20. Could that reader read it without getting lost? Jargon avoided or explained where it first appears, analogies that clarify rather than decorate, no unexplained code, identifiers or version-number soup.
4. Calibration, 0 to 10. Does it keep what the thread established apart from what participants suspected or inferred, and describe uncertainty and impact honestly?

Reply with the JSON object the schema describes: the factual errors you found (each quoting the explanation briefly and saying what the source shows), a short paragraph explaining your scores, and the four scores.
```

The judge's system prompt is that rubric, the thread, and prompt-2.txt as the writer's brief.

**What gets published.** Every run-2 answer, unedited, on the [answers page]({{ '/explainers/' | relative_url }}) beside the same entry's run-1 answer; claims an answer makes about a real person are checked against the thread, and unsupported ones are marked as model errors. The winner of run 2 writes the follow-up post, which shows the top two answers and the shortest answer in the top ten in full and charts score against word count for both runs.
