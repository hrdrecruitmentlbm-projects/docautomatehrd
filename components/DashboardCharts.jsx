"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';

// Categorical palette bound to TYPE, never to array index, so donut slices
// always match badges/legend regardless of data insertion order:
// PKWT brand emerald, SK gold, Memo graphite, SP signal red.
const TYPE_COLORS = {
  PKWT: "var(--chart-1)",
  SK: "var(--chart-2)",
  MEMO: "var(--chart-3)",
  SP: "var(--chart-4)",
};
const FALL_COLOR = "var(--chart-5)";

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
      <div className="flex items-center justify-center h-[180px] text-text-2 text-sm">
        Belum ada data
      </div>
    );
  }

  // Screen-reader summary carries label+count (chart is aria-hidden).
  const summary = data.map(d => `${d.name} ${d.value}`).join(', ');

  return (
    <div className="relative flex items-center justify-center h-[180px]">
      <p className="sr-only">
        Total {total} dokumen: {summary}
      </p>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={80}
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
        <span className="text-2xl font-semibold tabular text-text-1">{total}</span>
        <span className="text-xs font-medium text-text-2">Total</span>
      </div>
    </div>
  );
}

function ActivityBarChart({ logs }) {
  const grouped = {};
  [...logs].reverse().forEach(log => {
    const date = new Date(log.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
    grouped[date] = (grouped[date] || 0) + 1;
  });

  const data = Object.entries(grouped).slice(-7).map(([date, Total]) => ({ date, Total }));

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[160px] text-text-2 text-sm">
        Belum ada data
      </div>
    );
  }

  return (
    <div className="h-[160px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 5, right: 5, left: -30, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--row-border)" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 12, fill: 'var(--text-2)', fontWeight: 500 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 12, fill: 'var(--text-2)', fontWeight: 500 }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{ borderRadius: '8px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-popover-value)', fontSize: '13px' }}
            cursor={{ fill: 'var(--surface-2)' }}
          />
          <Bar dataKey="Total" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DashboardCharts({ logs, chartType = 'bar' }) {
  if (chartType === 'pie') {
    return <DonutChart logs={logs} />;
  }
  return <ActivityBarChart logs={logs} />;
}
