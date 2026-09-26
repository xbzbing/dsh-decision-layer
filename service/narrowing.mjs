const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const probability = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;

// Intersect the host-allowed tool set with the model's relevance verdict. Only
// removes tools; never adds. Any missing or invalid noul keeps the tool, and a
// verdict that would strip everything is skipped so the agent is never disabled.
export function narrowTools(allowed, result, { threshold = 0.5 } = {}) {
  const tools = Array.isArray(allowed) ? allowed.filter(name => typeof name === 'string') : [];
  const answers = isObject(result?.answers) ? result.answers : undefined;
  if (tools.length === 0 || !answers) return { applied: false, keep: [...tools], drop: [] };

  const keep = [];
  const drop = [];
  for (const name of tools) {
    const answer = answers[name];
    if (isObject(answer) && answer.type === 'noul' && probability(answer.noul) && answer.noul < threshold) drop.push(name);
    else keep.push(name);
  }
  if (drop.length === 0 || keep.length === 0) return { applied: false, keep: [...tools], drop: [] };
  return { applied: true, keep, drop };
}
