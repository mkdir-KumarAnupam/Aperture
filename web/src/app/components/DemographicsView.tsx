'use client';

import { useEffect, useState } from 'react';
import { Bar, Pie } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend);

const COLORS = ['#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4', '#42d4f4', '#f032e6'];

export default function DemographicsView({ q }: { q?: string }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const url = q ? `/api/demographics?q=${encodeURIComponent(q)}` : '/api/demographics';
    fetch(url)
      .then(res => res.json())
      .then(json => {
        if (json.error) setError(json.error);
        else setData(json);
      })
      .catch(err => setError(err.message));
  }, []);

  if (error) return <div style={{ color: 'red', padding: '10px', border: '1px solid red' }}>Error: {error}</div>;
  if (!data) return <div>Loading demographics...</div>;

  const createChartData = (distribution: [string, number][], label: string) => ({
    labels: distribution.map(d => d[0]),
    datasets: [{
      label,
      data: distribution.map(d => d[1]),
      backgroundColor: COLORS.map(c => c + 'AA'),
      borderColor: COLORS,
      borderWidth: 1,
    }]
  });

  const chartOptions = { 
    responsive: true, 
    maintainAspectRatio: false, 
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { color: '#000', font: { size: 10, family: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' } }, grid: { display: false } },
      y: { ticks: { color: '#000' }, grid: { color: '#eee' } }
    }
  };
  const pieOptions = { 
    responsive: true, 
    maintainAspectRatio: false, 
    plugins: { legend: { position: 'right' as const, labels: { font: { size: 10, family: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }, color: '#000' } } } 
  };

  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
        
        {/* Regions */}
        <div style={{ backgroundColor: '#fff', padding: '15px', border: '1px solid #ccc' }}>
          <h4 style={{ margin: '0 0 15px 0', color: '#000', fontSize: '14px', fontWeight: 'bold', textTransform: 'uppercase' }}>Region Distribution</h4>
          <div style={{ height: '220px' }}>
            <Bar data={createChartData(data.regionDistribution, 'Authors')} options={chartOptions} />
          </div>
        </div>

        {/* Professions */}
        <div style={{ backgroundColor: '#fff', padding: '15px', border: '1px solid #ccc' }}>
          <h4 style={{ margin: '0 0 15px 0', color: '#000', fontSize: '14px', fontWeight: 'bold', textTransform: 'uppercase' }}>Inferred Professions</h4>
          <div style={{ height: '220px' }}>
            <Bar data={createChartData(data.professionDistribution, 'Authors')} options={chartOptions} />
          </div>
        </div>

        {/* Languages */}
        <div style={{ backgroundColor: '#fff', padding: '15px', border: '1px solid #ccc' }}>
          <h4 style={{ margin: '0 0 15px 0', color: '#000', fontSize: '14px', fontWeight: 'bold', textTransform: 'uppercase' }}>Language (Posts)</h4>
          <div style={{ height: '220px' }}>
            <Pie data={createChartData(data.languageDistribution, 'Posts')} options={pieOptions} />
          </div>
        </div>

      </div>

      <div style={{ marginTop: '16px', fontSize: '12px', color: '#333', textAlign: 'right', fontFamily: 'monospace' }}>
        Analyzed {data.totalAuthors} entities | {data.totalPosts} posts
      </div>
    </div>
  );
}
