// Guided self-check: signals public metadata cannot see.
// Answers are stored with the audit and ALWAYS shown separately, labelled self-reported.
export const SELF_CHECK_QUESTIONS = [
  { key: "stock", label: "How much of a typical video is stock footage or other people's clips?", options: ["Mostly my own footage / original", "A mix, with my commentary throughout", "Mostly stock / third-party clips", "Entire videos are re-used from elsewhere"] },
  { key: "voice", label: "What voice is used?", options: ["My own recorded voice", "A hired voice actor", "AI text-to-speech, varied per video", "The same AI voice on every video"] },
  { key: "commentary", label: "Does each video add original commentary, analysis or a story?", options: ["Yes — substantial original commentary", "Some — a short intro/outro", "Very little", "No — content is presented as-is"] },
  { key: "template", label: "How similar is the structure from video to video?", options: ["Structure changes with the topic", "Same loose format, different content", "Same segments in the same order", "Identical template, only the topic changes"] },
  { key: "edits", label: "If you use third-party material, how is it transformed?", options: ["Heavy editing, new graphics, new angle", "Moderate edits and cuts", "Light edits (crop, zoom, captions)", "Uploaded mostly unchanged"] },
] as const;

export function selfCheckFlags(answers: Record<string, string>): string[] {
  const flags: string[] = [];
  const risky: Record<string, string[]> = {
    stock: ["Mostly stock / third-party clips", "Entire videos are re-used from elsewhere"],
    voice: ["The same AI voice on every video"],
    commentary: ["Very little", "No — content is presented as-is"],
    template: ["Identical template, only the topic changes"],
    edits: ["Uploaded mostly unchanged", "Light edits (crop, zoom, captions)"],
  };
  for (const q of SELF_CHECK_QUESTIONS) {
    const a = answers[q.key];
    if (a && risky[q.key]?.includes(a)) flags.push(`${q.label} → "${a}" (self-reported)`);
  }
  return flags;
}
