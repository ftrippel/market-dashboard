import React, { useEffect, useRef, useState } from 'react';
import { getThemeColor } from '../../utils/formatting';
import { useTheme } from '../../context/ThemeContext';

interface SparklineProps {
  data: number[];
  positive?: boolean;
}

function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return hex;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function colorWithAlpha(color: string, alpha: number): string {
  if (color.startsWith('#')) return hexToRgba(color, alpha);
  if (color.startsWith('rgb(')) {
    return color.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`);
  }
  return color;
}

export const Sparkline: React.FC<SparklineProps> = ({ data, positive }) => {
  const { theme } = useTheme();
  const isPositive = positive ?? (data.length > 0 ? data[data.length - 1] >= 0 : true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tooltip, setTooltip] = useState<{ text: string; x: number } | null>(null);

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

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;

    const points = data.map((v, i) => ({
      x: Math.round((i / (data.length - 1)) * (w - 2) + 1),
      y: Math.round(h - ((v - min) / range) * (h - 4) - 2),
    }));

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.lineTo(points[points.length - 1].x, h);
    ctx.lineTo(points[0].x, h);
    ctx.closePath();

    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    const color = getThemeColor(isPositive ? 'green' : 'red');
    const fade = getThemeColor('bg');
    gradient.addColorStop(0, colorWithAlpha(color, 0.25));
    gradient.addColorStop(1, colorWithAlpha(fade, 0));
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }, [data, isPositive, theme]);

  const handleMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !data || data.length === 0) return;

    const rect = canvas.getBoundingClientRect();
    const xLogical = (event.clientX - rect.left) * (64 / rect.width);
    
    const colWidth = 64 / data.length;
    const index = Math.floor(xLogical / colWidth);

    if (index >= 0 && index < data.length) {
      const val = data[index];
      const formatted = `${val > 0 ? '+' : ''}${val.toFixed(2)}%`;
      
      const colWidthCss = rect.width / data.length;
      const tooltipX = index * colWidthCss + colWidthCss / 2;

      setTooltip({
        text: formatted,
        x: tooltipX,
      });
    } else {
      setTooltip(null);
    }
  };

  const handleMouseLeave = () => {
    setTooltip(null);
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block', verticalAlign: 'middle' }}>
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          display: 'block',
          cursor: 'pointer',
        }}
      />
      {tooltip && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: `${tooltip.x}px`,
            transform: 'translateX(-50%) translateY(-6px)',
            background: 'var(--bg4, #1e293b)',
            color: 'var(--text, #ffffff)',
            padding: '4px 6px',
            borderRadius: '4px',
            fontSize: '9px',
            fontWeight: 600,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.4), 0 2px 4px -1px rgba(0, 0, 0, 0.4)',
            border: '1px solid var(--border2, rgba(255, 255, 255, 0.1))',
            zIndex: 1000,
          }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
};
