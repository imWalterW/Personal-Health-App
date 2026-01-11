
import React from 'react';
import { RadialBarChart, RadialBar, ResponsiveContainer, PolarAngleAxis } from 'recharts';

interface RadialChartProps {
  current: number;
  total: number;
  color: string;
  label: string;
  unit?: string;
}

export const RadialProgress: React.FC<RadialChartProps> = ({ current, total, color, label }) => {
  const percentage = Math.min(100, Math.max(0, (current / total) * 100));
  const data = [{ name: label, value: percentage, fill: color }];

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart 
          innerRadius="80%" 
          outerRadius="100%" 
          barSize={10} 
          data={data} 
          startAngle={90} 
          endAngle={-270}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
          <RadialBar background dataKey="value" cornerRadius={5} />
        </RadialBarChart>
      </ResponsiveContainer>
      
      {/* Centered Value Overlay */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span className="text-[10px] font-bold text-gray-700 dark:text-gray-200">{current}</span>
      </div>
    </div>
  );
};
