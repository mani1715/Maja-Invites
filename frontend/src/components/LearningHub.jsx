// LearningHub (Phase 5) — curated photographer learning center.
// Static, curated resources + AI-tools directory with search + filters.
// No backend, storage, auth or payment. "Recommended by Pixora" badges per spec.
import React, { useMemo, useState } from 'react';
import { Search, ExternalLink, BadgeCheck, GraduationCap, Sparkles, Clock } from 'lucide-react';
import { AI_TOOL_GROUPS, LEARNING_RESOURCES, LEARNING_CATEGORIES } from '@/data/learningResources';

const DIFFS = ['beginner', 'intermediate', 'advanced'];
const COSTS = ['free', 'paid'];
const CAT_COLOR = {
  photography: '#E8C97A', editing: '#7FB5FF', business: '#3ECf8E',
  marketing: '#C08CFF', ai_tools: '#FF9F7F', gear: '#8AD0C7',
};

function Recommended() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full shrink-0"
      style={{ background: 'rgba(212,175,55,0.14)', color: '#E8C97A' }}>
      <BadgeCheck className="w-3 h-3" /> Recommended by Pixora
    </span>
  );
}

function ResourceCard({ r }) {
  const color = CAT_COLOR[r.category] || '#E8C97A';
  return (
    <a href={r.link} target="_blank" rel="noreferrer"
      className="lux-glass p-4 flex flex-col gap-2 hover:scale-[1.01] transition-transform"
      data-testid={`learn-card-${r.id}`}>
      {/* thumbnail = category-tinted tile (no external images → never broken) */}
      <div className="rounded-lg h-24 flex items-center justify-center"
        style={{ background: `linear-gradient(135deg, ${color}22, ${color}0A)`, border: `1px solid ${color}33` }}>
        <GraduationCap className="w-7 h-7" style={{ color }} />
      </div>
      <div className="flex items-start justify-between gap-2">
        <span className="font-display text-base leading-tight" style={{ color: 'var(--lux-text)' }}>{r.title}</span>
        {r.recommended && <Recommended />}
      </div>
      {r.desc && <p className="text-xs" style={{ color: 'var(--lux-text-muted)' }}>{r.desc}</p>}
      <div className="flex items-center gap-2 mt-auto pt-1 text-[10px] uppercase tracking-wide" style={{ color: 'var(--lux-text-faint)' }}>
        <span style={{ color }}>{(LEARNING_CATEGORIES.find((c) => c.key === r.category) || {}).label}</span>
        <span>· {r.difficulty}</span>
        <span>· {r.cost}</span>
        <ExternalLink className="w-3 h-3 ml-auto" />
      </div>
    </a>
  );
}

function AiToolsDirectory({ query }) {
  const q = query.trim().toLowerCase();
  const groups = AI_TOOL_GROUPS
    .map((g) => ({ ...g, tools: g.tools.filter((t) => !q || t.name.toLowerCase().includes(q) || t.desc.toLowerCase().includes(q) || t.useCases.toLowerCase().includes(q)) }))
    .filter((g) => g.tools.length);
  if (!groups.length) return <div className="lux-glass p-8 text-center" style={{ color: 'var(--lux-text-muted)' }}>No AI tools match “{query}”.</div>;
  return (
    <div className="space-y-6" data-testid="learn-ai-tools">
      {groups.map((g) => (
        <div key={g.group}>
          <div className="lux-eyebrow mb-3" style={{ color: '#FF9F7F' }}>◆ {g.group}</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {g.tools.map((t) => (
              <a key={t.name} href={t.link} target="_blank" rel="noreferrer"
                className="lux-glass p-4 hover:scale-[1.01] transition-transform" data-testid={`ai-tool-${t.name.toLowerCase().replace(/\s+/g, '-')}`}>
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="font-display text-lg" style={{ color: 'var(--lux-text)' }}>{t.name}</span>
                  {t.recommended && <Recommended />}
                </div>
                <p className="text-sm mb-2" style={{ color: 'var(--lux-text-muted)' }}>{t.desc}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px]" style={{ color: 'var(--lux-text-faint)' }}>
                  <div><b style={{ color: 'var(--lux-text-muted)' }}>Pricing:</b> {t.pricing}</div>
                  <div><b style={{ color: 'var(--lux-text-muted)' }}>Use cases:</b> {t.useCases}</div>
                </div>
                <div className="flex items-center gap-1 mt-2 text-[11px]" style={{ color: '#FF9F7F' }}>
                  <ExternalLink className="w-3 h-3" /> Official site
                </div>
              </a>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// category prop optionally pre-scopes the hub (from the sidebar sub-nav).
export default function LearningHub({ category = null }) {
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState(category);
  const [diff, setDiff] = useState('');
  const [cost, setCost] = useState('');

  // keep in sync when the sidebar sub-item changes
  const activeCat = category !== null ? category : cat;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return LEARNING_RESOURCES.filter((r) =>
      (!activeCat || r.category === activeCat) &&
      (!diff || r.difficulty === diff) &&
      (!cost || r.cost === cost) &&
      (!q || r.title.toLowerCase().includes(q) || (r.desc || '').toLowerCase().includes(q))
    );
  }, [query, activeCat, diff, cost]);

  const isAiTools = activeCat === 'ai_tools';

  return (
    <div className="space-y-5" data-testid="learning-hub">
      <div className="lux-glass p-5">
        <div className="flex items-center gap-1.5 mb-3">
          <Sparkles className="w-4 h-4" style={{ color: '#E8C97A' }} />
          <span className="lux-eyebrow">Photographer Learning Center · curated by Pixora</span>
        </div>
        {/* search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--lux-text-muted)' }} />
          <input value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tutorials, tools, gear…" data-testid="learn-search"
            className="w-full pl-10 pr-3 py-2.5 rounded-lg bg-transparent outline-none text-sm"
            style={{ color: 'var(--lux-text)', border: '1px solid var(--lux-border)' }} />
        </div>
        {/* filters */}
        <div className="flex flex-wrap gap-2">
          {category === null && (
            <FilterGroup label="Category" value={cat || ''} onSet={(v) => setCat(v || null)}
              options={[['', 'All'], ...LEARNING_CATEGORIES.map((c) => [c.key, c.label])]} />
          )}
          {!isAiTools && <FilterGroup label="Level" value={diff} onSet={setDiff} options={[['', 'Any'], ...DIFFS.map((d) => [d, d])]} />}
          {!isAiTools && <FilterGroup label="Cost" value={cost} onSet={setCost} options={[['', 'Any'], ...COSTS.map((c) => [c, c])]} />}
        </div>
      </div>

      {isAiTools ? (
        <AiToolsDirectory query={query} />
      ) : filtered.length === 0 ? (
        <div className="lux-glass p-10 text-center" data-testid="learn-empty">
          <Clock className="w-7 h-7 mx-auto mb-2" style={{ color: '#E8C97A' }} />
          <div className="text-sm" style={{ color: 'var(--lux-text-muted)' }}>No resources match your filters yet. More curated content is added regularly.</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((r) => <ResourceCard key={r.id} r={r} />)}
        </div>
      )}
    </div>
  );
}

function FilterGroup({ label, value, onSet, options }) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      <span className="text-[10px] uppercase tracking-wide mr-1" style={{ color: 'var(--lux-text-faint)' }}>{label}:</span>
      {options.map(([v, l]) => {
        const on = value === v;
        return (
          <button key={v || 'all'} onClick={() => onSet(v)} data-testid={`learn-filter-${label}-${v || 'all'}`}
            className="px-2.5 py-1 rounded-full text-[11px] capitalize"
            style={{ border: `1px solid ${on ? '#D4AF37' : 'var(--lux-border)'}`,
                     background: on ? 'rgba(212,175,55,0.12)' : 'transparent',
                     color: on ? '#E8C97A' : 'var(--lux-text-muted)' }}>
            {l}
          </button>
        );
      })}
    </div>
  );
}
