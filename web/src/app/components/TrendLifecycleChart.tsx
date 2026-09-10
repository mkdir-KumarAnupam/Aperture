'use client';

import { useEffect, useState } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const COLORS = [
  '#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4',
  '#42d4f4', '#f032e6', '#bfef45'
];

interface LifecycleData {
  labels: string[];
  timestamps: string[];
  series: Record<string, { timestamp: string; score: number; rank: number | null; tweetCount: number | null }[]>;
  phases: Record<string, string>;
  totalSnapshots: number;
}

export default function TrendLifecycleChart() {
  const [data, setData] = useState<LifecycleData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedTrend, setSelectedTrend] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/trends/lifecycle')
      .then(res => res.json())
      .then(json => {
        if (json.error) {
          setError(json.error);
        } else {
          setData(json);
          if (json.labels?.length > 0) {
            setSelectedTrend(json.labels[0]);
          }
        }
      })
      .catch(err => setError(err.message));
  }, []);

  if (error) {
    return <div style={{ color: 'red', padding: '10px', border: '1px solid red' }}>Error: {error}</div>;
  }

  if (!data || data.totalSnapshots < 1) {
    return (
      <div style={{ padding: '15px', backgroundColor: '#f5f5f5', border: '1px solid #ccc', marginBottom: '30px' }}>
        <strong>Trend Lifecycle Chart</strong>
        <p>No snapshot data yet. Run the scraper multiple times to accumulate trend history.</p>
        <p style={{ color: '#666', fontSize: '12px' }}>
          Each pipeline run = 1 data point. You need at least 2 runs to see lines.
        </p>
      </div>
    );
  }

  const phaseLabel = (phase: string) => {
    if (phase === 'rising') return 'RISING';
    if (phase === 'decaying') return 'DECAYING';
    if (phase === 'peaking') return 'PEAKING';
    return 'NEW';
  };

  const phaseColor = (phase: string) => {
    if (phase === 'rising') return '#006600';
    if (phase === 'decaying') return '#cc0000';
    if (phase === 'peaking') return '#cc8800';
    return '#666';
  };

  const xLabels = data.timestamps.map(ts => {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) 
      + ' ' + d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  });

  const selectedIndex = selectedTrend ? data.labels.indexOf(selectedTrend) : 0;
  const color = COLORS[selectedIndex % COLORS.length];
  const fullSeriesData = selectedTrend ? data.series[selectedTrend] : null;
  
  let seriesData = fullSeriesData;
  let chartLabels = xLabels;

  if (seriesData) {
    const firstAppearanceIdx = seriesData.findIndex(s => s.score > 0);
    if (firstAppearanceIdx !== -1) {
      const startIdx = Math.max(0, firstAppearanceIdx - 2);
      seriesData = seriesData.slice(startIdx);
      chartLabels = xLabels.slice(startIdx);
    } else {
      const startIdx = Math.max(0, seriesData.length - 20);
      seriesData = seriesData.slice(startIdx);
      chartLabels = xLabels.slice(startIdx);
    }
  }

  const chartData = selectedTrend && seriesData ? {
    labels: chartLabels,
    datasets: [{
      label: selectedTrend,
      data: seriesData.map(s => s.score),
      borderColor: color,
      backgroundColor: color + '22',
      tension: 0.3,
      pointRadius: 5,
      pointHoverRadius: 8,
      borderWidth: 2.5,
      fill: true,
    }]
  } : null;

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      title: { display: false },
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context: any) => {
            const score = context.parsed.y;
            const point = seriesData?.[context.dataIndex];
            const rank = point?.rank;
            const tweets = point?.tweetCount;
            let tip = `Score: ${score} (Rank #${rank ?? 'absent'})`;
            if (tweets !== null && tweets !== undefined) {
              tip += ` | ${tweets} tweets`;
            }
            return tip;
          }
        }
      }
    },
    scales: {
      y: {
        min: 0,
        max: 100,
        title: { display: true, text: 'Trend Score' },
      },
      x: {
        title: { display: true, text: 'Scrape Time' },
      }
    }
  };

  return (
    <div style={{ marginBottom: '40px' }}>
      {/* Trend Tabs */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0', borderBottom: '2px solid #000', marginBottom: '0' }}>
        {data.labels.map((label, i) => {
          const isActive = selectedTrend === label;
          return (
            <button
              key={label}
              onClick={() => setSelectedTrend(label)}
              style={{
                padding: '8px 14px',
                cursor: 'pointer',
                border: '2px solid #000',
                borderBottom: isActive ? '2px solid #fff' : '2px solid #000',
                marginBottom: '-2px',
                backgroundColor: isActive ? '#fff' : '#eee',
                fontWeight: isActive ? 'bold' : 'normal',
                fontSize: '12px',
                color: isActive ? COLORS[i % COLORS.length] : '#333',
              }}
            >
              {label.length > 20 ? label.substring(0, 20) + '..' : label}
            </button>
          );
        })}
      </div>

      {/* Chart + Info panel */}
      {selectedTrend && seriesData && chartData && (
        <div style={{ border: '2px solid #000', borderTop: 'none', padding: '15px' }}>
          <div style={{ display: 'flex', gap: '20px' }}>
            {/* Chart */}
            <div style={{ flex: 1, height: '300px' }}>
              <Line data={chartData} options={options} />
            </div>

            {/* Info sidebar */}
            <div style={{ width: '200px', fontSize: '13px' }}>
              <div style={{ marginBottom: '15px' }}>
                <div style={{ color: '#666', fontSize: '11px' }}>TREND</div>
                <div style={{ fontWeight: 'bold', color: color }}>{selectedTrend}</div>
              </div>

              <div style={{ marginBottom: '15px' }}>
                <div style={{ color: '#666', fontSize: '11px' }}>PHASE</div>
                <div style={{ fontWeight: 'bold', color: phaseColor(data.phases[selectedTrend]) }}>
                  {phaseLabel(data.phases[selectedTrend])}
                </div>
              </div>

              <div style={{ marginBottom: '15px' }}>
                <div style={{ color: '#666', fontSize: '11px' }}>LATEST RANK</div>
                <div style={{ fontWeight: 'bold' }}>
                  {seriesData[seriesData.length - 1]?.rank 
                    ? `#${seriesData[seriesData.length - 1].rank}` 
                    : 'Absent'}
                </div>
              </div>

              <div style={{ marginBottom: '15px' }}>
                <div style={{ color: '#666', fontSize: '11px' }}>LATEST SCORE</div>
                <div style={{ fontWeight: 'bold' }}>
                  {seriesData[seriesData.length - 1]?.score ?? 0}/100
                </div>
              </div>

              <div style={{ marginBottom: '15px' }}>
                <div style={{ color: '#666', fontSize: '11px' }}>DATA POINTS</div>
                <div>{data.totalSnapshots} snapshots</div>
              </div>

              <div style={{ marginBottom: '15px' }}>
                <div style={{ color: '#666', fontSize: '11px' }}>APPEARANCES</div>
                <div>{seriesData.filter(s => s.score > 0).length} / {data.totalSnapshots}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
