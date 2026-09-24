"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';

// Categorical palette bound to TYPE, never to array index, so donut slices
// always match badges/legend regardless of data insertion order:
// PKWT brand emerald, SK gold, Memo graphite, SP signal red.
export const TYPE_COLORS = {
  PKWT: "var(--chart-1)",
  SK: "var(--chart-2)",
  MEMO: "var(--chart-3)",
  SP: "var(--chart-4)",
};
const FALL_COLOR = "var(--chart-5)";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Floor a timestamp to the start of its bucket (local time). */
function bucketStart(time, granularity) {
  const d = new Date(time);
  d.setHours(0, 0, 0, 0);
  if (granularity === "week") {
    // Monday-start week (id-ID convention).
    const dow = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - dow);
  } else if (granularity === "month") {
    d.setDate(1);
  }
  return d.getTime();
}

function bucketLabel(time, granularity) {
  const d = new Date(time);
  if (granularity === "month") {
    return d.toLocaleDateString("id-ID", { month: "short", year: "2-digit" });
  }
  if (granularity === "week") {
    return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
  }
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
}

function DonutChart({ logs }) {
  const typeCounts = logs.reduce((acc, log) => {
    const type = (log.document_type || 'Lainnya').toUpperCase();
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

  const data = Object.keys(typeCounts).map(key => ({
    name: key,
    value: typeCounts[key]
  }));

  const total = data.reduce((sum, d) => sum + d.value, 0);

  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-[200px] text-text-2 text-sm">
        Belum ada data
      </div>
    );
  }

  // Screen-reader summary carries label+count (chart is aria-hidden).
  const summary = data.map(d => `${d.name} ${d.value}`).join(', ');

  return (
    <div className="relative flex items-center justify-center h-[200px]">
      <p className="sr-only">
        Total {total} dokumen: {summary}
      </p>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={62}
            outerRadius={88}
            paddingAngle={3}
            dataKey="value"
            strokeWidth={0}
            aria-hidden="true"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={TYPE_COLORS[entry.name] || FALL_COLOR} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ borderRadius: '8px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-popover-value)', fontSize: '13px' }}
          />
        </PieChart>
      </ResponsiveContainer>
      {/* Center label */}
      <div className="absolute flex flex-col items-center pointer-events-none">
        <span className="text-3xl font-semibold tabular text-text-1">{total}</span>
        <span className="text-xs font-medium text-text-2">Dokumen</span>
      </div>
    </div>
  );
}

/**
 * Bar chart bucketed by granularity (day/week/month).
 * - bounds {from,to} (ms) drives empty-bucket filling so a quiet day still
 *   renders a zero bar instead of shifting the axis.
 * - Counting starts empty and buckets every log inside bounds; logs outside
 *   bounds are ignored (the parent already filtered, this is belt+braces).
 */
export function ActivityBarChart({
  logs,
  fill = "var(--brand-600)",
  granularity = "day",
  bounds = null,
}) {
  const counts = new Map();
  for (const log of logs) {
    const t = new Date(log.created_at).getTime();
    if (Number.isNaN(t)) continue;
    if (bounds && (t < bounds.from || t > bounds.to)) continue;
    const key = bucketStart(t, granularity);
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  // Bucket span for walking empty buckets.
  const spanMs = granularity === "week" ? 7 * DAY_MS : DAY_MS;
  const step = (t) => {
    if (granularity === "month") {
      const d = new Date(t);
      d.setMonth(d.getMonth() + 1);
      return d.getTime();
    }
    return t + spanMs;
  };

  let keys = [...counts.keys()].sort((a, b) => a - b);
  if (bounds && keys.length > 0) {
    const walk = [];
    for (
      let k = bucketStart(bounds.from, granularity);
      k <= bounds.to;
      k = step(k)
    ) {
      walk.push(k);
      if (walk.length > 120) break; // safety: never render >120 bars
    }
    keys = walk;
  }

  const data = keys.map(k => ({
    date: bucketLabel(k, granularity),
    Total: counts.get(k) || 0,
  }));

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[220px] text-text-2 text-sm">
        Belum ada data
      </div>
    );
  }

  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 5, right: 5, left: -22, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--row-border)" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: 'var(--text-2)', fontWeight: 500 }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={12}
          />
          <YAxis
            tick={{ fontSize: 11, fill: 'var(--text-2)', fontWeight: 500 }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
            width={44}
          />
          <Tooltip
            contentStyle={{ borderRadius: '8px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-popover-value)', fontSize: '13px' }}
            cursor={{ fill: 'var(--surface-2)' }}
            formatter={(value) => [value, "Dokumen"]}
          />
          <Bar dataKey="Total" fill={fill} radius={[4, 4, 0, 0]} maxBarSize={40} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DashboardCharts({ logs, chartType = 'bar', fill, granularity, bounds }) {
  if (chartType === 'pie') {
    return <DonutChart logs={logs} />;
  }
  return (
    <ActivityBarChart logs={logs} fill={fill} granularity={granularity} bounds={bounds} />
  );
}
