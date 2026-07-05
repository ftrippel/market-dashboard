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

    const maxAbs = Math.max(...data.map(Math.abs)) || 1;
    const yBaseline = h / 2;
    const maxBarHeight = yBaseline - 2;

    const greenColor = getThemeColor('green');
    const redColor = getThemeColor('red');

    const points = data.map((v, i) => ({
      x: Math.round((i / (data.length - 1)) * (w - 2) + 1),
      y: Math.round(yBaseline - (v / maxAbs) * maxBarHeight),
    }));

    // 1. Draw zero baseline
    ctx.beginPath();
    ctx.moveTo(0, yBaseline);
    ctx.lineTo(w, yBaseline);
    ctx.strokeStyle = getThemeColor('border2');
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.stroke();
    ctx.setLineDash([]);

    // 2. Draw each segment (fill & stroke)
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      const val = data[i + 1];
      const segmentIsPositive = val >= 0;
      const segmentColor = segmentIsPositive ? greenColor : redColor;

      // Fill polygon under/above baseline
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p2.x, yBaseline);
      ctx.lineTo(p1.x, yBaseline);
      ctx.closePath();

      const gradient = ctx.createLinearGradient(0, Math.min(p1.y, p2.y, yBaseline), 0, Math.max(p1.y, p2.y, yBaseline));
      if (segmentIsPositive) {
        gradient.addColorStop(0, colorWithAlpha(segmentColor, 0.2));
        gradient.addColorStop(1, colorWithAlpha(segmentColor, 0));
      } else {
        gradient.addColorStop(0, colorWithAlpha(segmentColor, 0));
        gradient.addColorStop(1, colorWithAlpha(segmentColor, 0.2));
      }
      ctx.fillStyle = gradient;
      ctx.fill();

      // Stroke segment line
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.strokeStyle = segmentColor;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
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
