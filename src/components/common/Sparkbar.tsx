import React, { useEffect, useRef } from 'react';
import { getThemeColor } from '../../utils/formatting';
import { useTheme } from '../../context/ThemeContext';

interface SparkbarProps {
  data: number[];
  positive?: boolean;
}

export const Sparkbar: React.FC<SparkbarProps> = ({ data, positive }) => {
  const { theme } = useTheme();
  const isPositive = positive ?? (data.length > 0 ? data[data.length - 1] >= 0 : true);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data || data.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = 64;
    const h = 26;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, w, h);

    const maxAbs = Math.max(...data.map(Math.abs)) || 1;
    const colWidth = w / data.length;
    const barWidth = 8;
    const greenColor = getThemeColor('green');
    const redColor = getThemeColor('red');

    const yBaseline = h / 2;
    const maxBarHeight = yBaseline - 2;

    data.forEach((v, i) => {
      const absVal = Math.abs(v);
      const barHeight = Math.max(1, Math.round((absVal / maxAbs) * maxBarHeight));
      const x = Math.round(i * colWidth + (colWidth - barWidth) / 2);

      const barIsPositive = v >= 0;
      const barColor = barIsPositive ? greenColor : redColor;

      const y = barIsPositive ? Math.round(yBaseline - barHeight) : Math.round(yBaseline);

      ctx.fillStyle = barColor;
      ctx.fillRect(x, y, barWidth, barHeight);
    });
  }, [data, isPositive, theme]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: 'inline-block',
        verticalAlign: 'middle',
      }}
    />
  );
};
