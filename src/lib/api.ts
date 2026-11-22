import type { CharacterSpec } from '../game/types';
import { sanitizeSpec } from '../game/spec';

export async function checkHealth(): Promise<{ ai: boolean; model: string }> {
  try {
    const r = await fetch('/api/health');
    if (!r.ok) return { ai: false, model: '' };
    return await r.json();
  } catch {
    return { ai: false, model: '' };
  }
}

export async function analyze(image: string, hash: string): Promise<{ spec: CharacterSpec; model: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);
  try {
    const r = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image, hash }),
      signal: ctrl.signal,
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
    return { spec: sanitizeSpec(data.spec), model: data.model };
  } finally {
    clearTimeout(timer);
  }
}
