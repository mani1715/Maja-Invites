import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Sparkles, RefreshCw, MapPin, TrendingDown, FileDown, Loader2 } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

/**
 * PROMPT 16 — Deep analytics: AI Insights, D3 calendar heatmap,
 * RSVP funnel (custom SVG), geography bar chart, PDF export.
 */
const AnalyticsExtrasSection = ({ profileId, profileName }) => {
  const [insights, setInsights] = useState(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [heatmap, setHeatmap] = useState(null);
  const [funnel, setFunnel] = useState(null);
  const [geography, setGeography] = useState(null);
  const heatmapRef = useRef(null);

  const getAuth = () => {
    const token = localStorage.getItem('adminToken') || localStorage.getItem('admin_token') || localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const fetchAll = useCallback(async () => {
    try {
      const [h, f, g] = await Promise.all([
        axios.get(`${API_URL}/api/admin/profiles/${profileId}/analytics/heatmap?days=90`, { headers: getAuth() }),
        axios.get(`${API_URL}/api/admin/profiles/${profileId}/analytics/funnel`, { headers: getAuth() }),
        axios.get(`${API_URL}/api/admin/profiles/${profileId}/analytics/geography`, { headers: getAuth() }),
      ]);
      setHeatmap(h.data);
      setFunnel(f.data);
      setGeography(g.data);
    } catch (e) {
      // silently degrade
    }
  }, [profileId]);

  const fetchInsights = useCallback(async () => {
    setInsightsLoading(true);
    try {
      const r = await axios.post(`${API_URL}/api/admin/profiles/${profileId}/analytics/ai-insights`, {}, { headers: getAuth() });
      setInsights(r.data);
    } catch (e) {
      setInsights({ insights: ['AI insights unavailable right now.'], generated_at: new Date().toISOString() });
    } finally {
      setInsightsLoading(false);
    }
  }, [profileId]);

  useEffect(() => { fetchAll(); fetchInsights(); }, [fetchAll, fetchInsights]);

  // Render D3 heatmap
  useEffect(() => {
    if (!heatmap || !heatmapRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        // Load d3 from CDN (no longer bundled — see Phase 7 dep cleanup).
        // If the CDN fails, fall back to the non-d3 static render in renderHeatmap.
        const d3 = await import(/* webpackIgnore: true */ 'https://cdn.jsdelivr.net/npm/d3@7/+esm')
          .catch(() => null);
        if (cancelled) return;
        renderHeatmap(d3 ? (d3.default || d3) : null, heatmapRef.current, heatmap.data);
      } catch (_) {
        // fallback static render
        renderHeatmap(null, heatmapRef.current, heatmap.data);
      }
    })();
    return () => { cancelled = true; };
  }, [heatmap]);

  const exportPDF = async () => {
    try {
      const { default: jsPDF } = await import('jspdf');
      const autoTableModule = await import('jspdf-autotable');
      const autoTable = autoTableModule.default || autoTableModule;
      const doc = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });

      doc.setFillColor(10, 10, 15);
      doc.rect(0, 0, doc.internal.pageSize.width, 100, 'F');
      doc.setTextColor(212, 175, 55);
      doc.setFontSize(22);
      doc.text('Wedding Analytics Report', 40, 50);
      doc.setFontSize(11);
      doc.setTextColor(255, 248, 220);
      doc.text(profileName || profileId, 40, 75);
      doc.setFontSize(9);
      doc.text(`Generated ${new Date().toLocaleString()}`, 40, 90);

      let y = 130;
      doc.setTextColor(40, 40, 40);
      doc.setFontSize(14);
      doc.text('AI Insights', 40, y); y += 6;
      doc.setDrawColor(212, 175, 55); doc.line(40, y, 555, y); y += 16;
      doc.setFontSize(10);
      (insights?.insights || []).forEach((ins) => {
        const lines = doc.splitTextToSize(`• ${ins}`, 510);
        doc.text(lines, 40, y);
        y += lines.length * 14 + 4;
      });

      y += 10;
      if (funnel?.stages?.length) {
        doc.setFontSize(14); doc.text('RSVP Funnel', 40, y); y += 6;
        doc.line(40, y, 555, y); y += 6;
        autoTable(doc, {
          startY: y,
          head: [['Stage', 'Count', 'vs Top']],
          body: funnel.stages.map((s, i) => [
            s.name, s.count,
            i === 0 ? '100%' : `${((s.count / Math.max(funnel.stages[0].count, 1)) * 100).toFixed(1)}%`,
          ]),
          theme: 'grid',
          styles: { fontSize: 10 },
          headStyles: { fillColor: [212, 175, 55], textColor: [22, 17, 12] },
        });
        y = doc.lastAutoTable.finalY + 25;
      }

      if (geography?.cities?.length) {
        doc.setFontSize(14); doc.text('Top Cities', 40, y); y += 6;
        doc.line(40, y, 555, y); y += 6;
        autoTable(doc, {
          startY: y,
          head: [['City', 'Country', 'Views']],
          body: geography.cities.map((c) => [c.city, c.country || '—', c.count]),
          theme: 'striped',
          styles: { fontSize: 10 },
          headStyles: { fillColor: [212, 175, 55], textColor: [22, 17, 12] },
        });
      }

      doc.save(`analytics_report_${profileId}.pdf`);
    } catch (err) {
      alert('Could not generate PDF: ' + (err.message || 'unknown'));
    }
  };

  const maxFunnel = Math.max(1, funnel?.stages?.[0]?.count || 0);

  return (
    <div className="space-y-6 mb-10" data-testid="analytics-extras">
      {/* AI Insights */}
      <motion.div
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="lux-glass p-6 md:p-7 relative overflow-hidden"
        style={{ border: '1px solid rgba(212,175,55,0.45)' }}
        data-testid="ai-insights-card"
      >
        <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full opacity-30"
          style={{ background: 'radial-gradient(circle, rgba(212,175,55,0.6), transparent 70%)' }} />
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-4 h-4 text-gold" />
              <span className="lux-eyebrow">◆ AI Insights</span>
            </div>
            <h3 className="font-display text-2xl" style={{ color: '#FFF8DC' }}>
              The story <span className="font-script italic text-gold">your data tells</span>
            </h3>
          </div>
          <button onClick={fetchInsights} disabled={insightsLoading}
            className="lux-btn lux-btn-ghost text-xs inline-flex items-center gap-2"
            data-testid="ai-insights-refresh">
            {insightsLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {insightsLoading ? 'Thinking…' : 'Refresh'}
          </button>
        </div>
        {insightsLoading || !insights ? (
          <div className="space-y-2.5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-4 rounded skeleton-shimmer" style={{ background: 'rgba(255,248,220,0.07)' }} />
            ))}
          </div>
        ) : (
          <ul className="space-y-2.5">
            {(insights.insights || []).map((ins, i) => (
              <motion.li key={i}
                initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.08 }}
                className="flex items-start gap-3 text-[0.95rem]"
                style={{ color: 'rgba(255,248,220,0.92)' }}
                data-testid={`ai-insight-${i}`}>
                <span className="mt-1 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#D4AF37' }} />
                <span className="leading-relaxed">{ins}</span>
              </motion.li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex items-center justify-between text-[10px] tracking-[0.25em] uppercase" style={{ color: 'rgba(255,248,220,0.4)' }}>
          <span>{insights?.generated_at ? `Updated ${new Date(insights.generated_at).toLocaleString()}` : ''}</span>
          <button onClick={exportPDF} className="inline-flex items-center gap-1.5 hover:text-gold transition-colors" data-testid="export-pdf-btn">
            <FileDown className="w-3 h-3" /> Export PDF
          </button>
        </div>
        <style>{`@keyframes shimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
          .skeleton-shimmer { background: linear-gradient(90deg, rgba(255,248,220,0.04) 0%, rgba(212,175,55,0.12) 50%, rgba(255,248,220,0.04) 100%); background-size: 200% 100%; animation: shimmer 2s infinite linear; }`}</style>
      </motion.div>

      {/* Calendar heatmap */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="lux-glass p-6 md:p-7" data-testid="heatmap-card">
        <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
          <div>
            <span className="lux-eyebrow block mb-1">◆ 90-day activity</span>
            <h3 className="font-display text-xl" style={{ color: '#FFF8DC' }}>Invitation opens, day by day</h3>
          </div>
          <div className="flex items-center gap-3 text-[10px] tracking-[0.2em] uppercase" style={{ color: 'rgba(255,248,220,0.7)' }}>
            <span>Less</span>
            <div className="flex gap-0.5">
              {['#1A1410', '#3a2e16', '#7a5e1d', '#b08826', '#D4AF37'].map((c) => (
                <div key={c} className="w-3 h-3 rounded-sm" style={{ background: c }} />
              ))}
            </div>
            <span>More</span>
          </div>
        </div>
        <div ref={heatmapRef} className="overflow-x-auto" data-testid="heatmap-svg-container" />
      </motion.div>

      {/* RSVP Funnel */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
        className="lux-glass p-6 md:p-7" data-testid="funnel-card">
        <div className="mb-5">
          <span className="lux-eyebrow block mb-1">◆ RSVP Funnel</span>
          <h3 className="font-display text-xl" style={{ color: '#FFF8DC' }}>From link to lifetime commitment</h3>
        </div>
        {funnel?.stages?.length ? (
          <div className="space-y-3" data-testid="funnel-stages">
            {funnel.stages.map((s, i) => {
              const widthPct = (s.count / maxFunnel) * 100;
              const prev = i > 0 ? funnel.stages[i - 1].count : null;
              const dropPct = prev && prev > 0 ? (((prev - s.count) / prev) * 100) : null;
              return (
                <div key={s.name} data-testid={`funnel-stage-${i}`}>
                  <div className="flex items-baseline justify-between mb-1.5">
                    <span className="text-xs tracking-wide" style={{ color: 'rgba(255,248,220,0.88)' }}>{s.name}</span>
                    <span className="font-display text-lg text-gold">{s.count.toLocaleString()}</span>
                  </div>
                  <div className="h-9 rounded-md overflow-hidden relative" style={{ background: 'rgba(255,248,220,0.06)' }}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${widthPct}%` }}
                      transition={{ duration: 0.9, delay: i * 0.15, ease: [0.22, 1, 0.36, 1] }}
                      className="h-full"
                      style={{
                        background: `linear-gradient(90deg, #D4AF37 0%, #B8941F ${Math.max(widthPct, 5)}%)`,
                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2)',
                      }}
                    />
                  </div>
                  {dropPct !== null && dropPct > 0 && i > 0 && (
                    <div className="flex items-center gap-1.5 mt-1 text-[10px]" style={{ color: '#fca5a5' }}>
                      <TrendingDown className="w-3 h-3" /> {dropPct.toFixed(0)}% drop-off from previous
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-sm py-4" style={{ color: 'rgba(255,248,220,0.7)' }}>No funnel data yet.</div>
        )}
      </motion.div>

      {/* Geography */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
        className="lux-glass p-6 md:p-7" data-testid="geography-card">
        <div className="mb-5 flex items-center gap-2">
          <MapPin className="w-4 h-4 text-gold" />
          <div>
            <span className="lux-eyebrow block mb-1">◆ Geography</span>
            <h3 className="font-display text-xl" style={{ color: '#FFF8DC' }}>Top 10 cities</h3>
          </div>
        </div>
        {geography?.cities?.length ? (
          <ResponsiveContainer width="100%" height={Math.max(220, geography.cities.length * 32)}>
            <BarChart data={geography.cities} layout="vertical" margin={{ left: 10, right: 30 }}>
              <XAxis type="number" stroke="#FFF8DC55" fontSize={11} />
              <YAxis dataKey="city" type="category" stroke="#FFF8DC" fontSize={11} width={120} />
              <Tooltip
                cursor={{ fill: 'rgba(212,175,55,0.05)' }}
                contentStyle={{ background: '#1A1410', border: '1px solid #D4AF37', color: '#FFF8DC' }}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {geography.cities.map((_, i) => (
                  <Cell key={i} fill={`hsl(45, ${60 - i * 4}%, ${55 - i * 2}%)`} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-sm py-4" style={{ color: 'rgba(255,248,220,0.7)' }}>No city data yet.</div>
        )}
      </motion.div>
    </div>
  );
};

// D3 heatmap renderer (with non-d3 fallback)
function renderHeatmap(d3, container, data) {
  container.innerHTML = '';
  const cellSize = 12;
  const cellGap = 3;
  const dayLabelW = 24;
  const weeks = Math.ceil(data.length / 7);
  const width = dayLabelW + weeks * (cellSize + cellGap);
  const height = 7 * (cellSize + cellGap) + 24;

  const maxVal = Math.max(1, ...data.map((d) => d.opens || 0));
  const color = (v) => {
    if (!v) return '#1A1410';
    const t = Math.min(1, v / maxVal);
    if (t < 0.2) return '#3a2e16';
    if (t < 0.4) return '#7a5e1d';
    if (t < 0.7) return '#b08826';
    return '#D4AF37';
  };

  if (d3 && d3.select) {
    const svg = d3.select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .attr('style', 'font: 10px DM Sans, sans-serif; color: #FFF8DC');

    const tooltip = d3.select(container)
      .append('div')
      .attr('class', 'd3-tooltip')
      .style('position', 'absolute')
      .style('pointer-events', 'none')
      .style('background', '#1A1410')
      .style('border', '1px solid #D4AF37')
      .style('color', '#FFF8DC')
      .style('padding', '6px 10px')
      .style('border-radius', '4px')
      .style('font-size', '11px')
      .style('opacity', 0)
      .style('z-index', 50);

    svg.selectAll('rect.day')
      .data(data)
      .enter()
      .append('rect')
      .attr('class', 'day')
      .attr('width', cellSize)
      .attr('height', cellSize)
      .attr('rx', 2)
      .attr('x', (d, i) => dayLabelW + Math.floor(i / 7) * (cellSize + cellGap))
      .attr('y', (d, i) => 14 + (i % 7) * (cellSize + cellGap))
      .attr('fill', (d) => color(d.opens))
      .on('mouseenter', function (event, d) {
        tooltip.style('opacity', 1).html(`<strong>${d.date}</strong><br/>${d.opens} ${d.opens === 1 ? 'open' : 'opens'}`);
        d3.select(this).attr('stroke', '#FFF8DC').attr('stroke-width', 1);
      })
      .on('mousemove', function (event) {
        const rect = container.getBoundingClientRect();
        tooltip.style('left', (event.clientX - rect.left + 8) + 'px')
               .style('top', (event.clientY - rect.top + 8) + 'px');
      })
      .on('mouseleave', function () {
        tooltip.style('opacity', 0);
        d3.select(this).attr('stroke', 'none');
      });

    // Day labels (M W F)
    const days = ['', 'M', '', 'W', '', 'F', ''];
    svg.selectAll('text.day-label')
      .data(days)
      .enter()
      .append('text')
      .attr('class', 'day-label')
      .attr('x', 0)
      .attr('y', (d, i) => 14 + i * (cellSize + cellGap) + cellSize - 2)
      .attr('fill', 'rgba(255,248,220,0.4)')
      .attr('font-size', '9px')
      .text((d) => d);
  } else {
    // Fallback HTML grid
    const wrap = document.createElement('div');
    wrap.style.display = 'grid';
    wrap.style.gridTemplateRows = `repeat(7, ${cellSize}px)`;
    wrap.style.gridAutoFlow = 'column';
    wrap.style.gridAutoColumns = `${cellSize}px`;
    wrap.style.gap = `${cellGap}px`;
    data.forEach((d) => {
      const cell = document.createElement('div');
      cell.style.width = cell.style.height = `${cellSize}px`;
      cell.style.borderRadius = '2px';
      cell.style.background = color(d.opens);
      cell.title = `${d.date} — ${d.opens} opens`;
      wrap.appendChild(cell);
    });
    container.appendChild(wrap);
  }
}

export default AnalyticsExtrasSection;
