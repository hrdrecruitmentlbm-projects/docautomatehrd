"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

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
      <div className="flex items-center justify-center h-[180px] text-slate-400 text-sm">
        Belum ada data
      </div>
    );
  }

  return (
    <div className="relative flex items-center justify-center h-[180px]">
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
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ borderRadius: '10px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: '12px' }}
          />
        </PieChart>
      </ResponsiveContainer>
      {/* Center label */}
      <div className="absolute flex flex-col items-center pointer-events-none">
        <span className="text-2xl font-extrabold text-slate-800">{total}</span>
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Total</span>
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
      <div className="flex items-center justify-center h-[160px] text-slate-400 text-sm">
        Belum ada data
      </div>
    );
  }

  return (
    <div className="h-[160px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 5, right: 5, left: -30, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{ borderRadius: '10px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: '12px' }}
            cursor={{ fill: '#f8fafc' }}
          />
          <Bar dataKey="Total" fill="#bfdbfe" radius={[4, 4, 0, 0]} />
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
