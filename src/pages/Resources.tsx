import { useMemo, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useStore } from '../store';
import { Card, Kpi, PageHeader, Segmented } from '../components/ui';
import { ResourceGrid } from '../components/ResourceGrid';
import { DEPARTMENTS } from '../components/forms';
import { addDays, isoWeek, todayISO, weeksBetween } from '../utils/date';
import { fmtNum, fmtPct, sum } from '../utils/format';
import { weekCapacity } from '../utils/capacity';

export function Resources() {
  const { data, idx } = useStore();
  const [offset, setOffset] = useState(0);
  const [count, setCount] = useState<'8' | '12' | '26'>('12');
  const [dept, setDept] = useState('');
  const [q, setQ] = useState('');
  const [onlyOver, setOnlyOver] = useState(false);
  const [mode, setMode] = useState<'pct' | 'h'>('pct');
  const today = todayISO();
  const weeks = useMemo(() => weeksBetween(addDays(today, offset * 7), Number(count)), [today, offset, count]);

  const loadOf = useMemo(() => {
    const set = new Set(weeks);
    const m = new Map<number, number[]>();
    for (const a of data.allocations) {
      if (!set.has(a.weekStart)) continue;
      const arr = m.get(a.employeeId) || weeks.map(() => 0);
      arr[weeks.indexOf(a.weekStart)] += a.hours;
      m.set(a.employeeId, arr);
    }
    return m;
  }, [data.allocations, weeks]);

  const employees = data.employees
    .filter((e) => e.active)
    .filter((e) => !dept || e.department === dept)
    .filter((e) => !q || `${e.name} ${e.role} ${e.skills.join(' ')}`.toLowerCase().includes(q.toLowerCase()))
    .filter((e) => !onlyOver || (loadOf.get(e.id) || []).some((h, i) => h > weekCapacity(idx.cap, e, weeks[i]).hours))
    .sort((a, b) => (a.department || '').localeCompare(b.department || '') || a.name.localeCompare(b.name, 'de'));

  const allActive = data.employees.filter((e) => e.active);
  const first4 = weeks.slice(0, 4);
  const cap4 = (e: (typeof allActive)[number]) => first4.map((w) => weekCapacity(idx.cap, e, w).hours);
  const capTotal4 = sum(allActive, (e) => sum(cap4(e), (h) => h));
  const nominal4 = sum(allActive, (e) => (e.weeklyHours || 0) * first4.length);
  const planned4 = sum(allActive, (e) => sum((loadOf.get(e.id) || []).slice(0, 4), (h) => h));
  const overCount = allActive.filter((e) => { const c = cap4(e); return (loadOf.get(e.id) || []).slice(0, 4).some((h, i) => h > c[i] + 0.01); }).length;
  const free4 = sum(allActive, (e) => sum(cap4(e).map((ch, i) => Math.max(0, ch - ((loadOf.get(e.id) || [])[i] || 0))), (x) => x));

  return (
    <div className="page">
      <PageHeader title="Ressourcenplanung" subtitle="Wochenweise Personalplanung über alle Projekte – Zeile aufklappen, um Stunden je Projekt zu planen">
        <div className="toolbar">
          <div className="search-input">
            <Search size={16} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, Rolle oder Qualifikation …" />
          </div>
          <select className="select-sm" value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Abteilung">
            <option value="">Alle Abteilungen</option>
            {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
          </select>
          <label className="check-inline"><input type="checkbox" checked={onlyOver} onChange={(e) => setOnlyOver(e.target.checked)} /> nur Überplante</label>
          <span className="spacer" />
          <Segmented value={mode} onChange={setMode} options={[{ value: 'pct', label: '%' }, { value: 'h', label: 'Std.' }]} />
          <Segmented value={count} onChange={setCount} options={[{ value: '8', label: '8 Wo.' }, { value: '12', label: '12 Wo.' }, { value: '26', label: '26 Wo.' }]} />
          <div className="week-nav">
            <button className="icon-btn" onClick={() => setOffset((o) => o - 4)} aria-label="Früher"><ChevronLeft size={18} /></button>
            <button className="btn btn-sm" onClick={() => setOffset(0)}>Heute</button>
            <button className="icon-btn" onClick={() => setOffset((o) => o + 4)} aria-label="Später"><ChevronRight size={18} /></button>
          </div>
        </div>
      </PageHeader>

      <div className="kpi-grid kpi-grid-4 res-kpis">
        <Kpi label={`Auslastung KW ${isoWeek(first4[0])}–${isoWeek(first4[first4.length - 1])}`} value={fmtPct(planned4 / Math.max(1, capTotal4))}
          sub={`${fmtNum(planned4)} h geplant von ${fmtNum(capTotal4)} h verfügbar`} />
        <Kpi label="Freie Kapazität (4 Wochen)" value={`${fmtNum(free4)} h`} sub="Summe nicht verplanter Stunden" />
        <Kpi label="Überplante Personen" value={overCount} tone={overCount ? 'bad' : 'good'} icon={overCount ? <AlertTriangle size={18} /> : undefined} sub="in den ersten 4 Wochen des Zeitraums" />
        <Kpi label="Abwesenheit (4 Wochen)" value={`${fmtNum(nominal4 - capTotal4)} h`} sub={`Urlaub, Feiertage, Krankheit u. a. · ${fmtPct((nominal4 - capTotal4) / Math.max(1, nominal4))} der Sollzeit`} />
      </div>

      <Card padded={false} className="res-grid">
        <ResourceGrid weeks={weeks} employees={employees} showAbsolute={mode === 'h'} />
        <div className="rg-legend">
          <span><i className="util-low" /> &lt; 50 %</span>
          <span><i className="util-ok" /> 50–85 %</span>
          <span><i className="util-high" /> 85–100 %</span>
          <span><i className="util-over" /> <AlertTriangle size={12} /> über 100 % (überplant)</span>
          <span><i className="rg-absent" /> ganz abwesend</span>
          <span><span className="rg-off static">−2 T</span> Tage abwesend / Feiertag (Prozent bezogen auf verfügbare Zeit)</span>
        </div>
      </Card>
    </div>
  );
}
