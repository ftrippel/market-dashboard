import React, { useEffect, useRef, useState } from 'react';
import { getThemeColor } from '../../utils/formatting';
import { useTheme } from '../../context/ThemeContext';

interface SparkdotsProps {
  data: number[];
  positive?: boolean;
}

export const Sparkdots: React.FC<SparkdotsProps> = ({ data, positive }) => {
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
    const maxBarHeight = yBaseline - 3; // Leave 3px padding for dot radius

    const greenColor = getThemeColor('green');
    const redColor = getThemeColor('red');

    // 1. Draw zero baseline
    ctx.beginPath();
    ctx.moveTo(0, yBaseline);
    ctx.lineTo(w, yBaseline);
    ctx.strokeStyle = getThemeColor('border2');
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.stroke();
    ctx.setLineDash([]);

    // 2. Draw each dot
    const points = data.map((v, i) => ({
      x: Math.round((i / (data.length - 1)) * (w - 6) + 3), // padding for radius
      y: Math.round(yBaseline - (v / maxAbs) * maxBarHeight),
      val: v,
    }));

    points.forEach((p) => {
      const dotColor = p.val >= 0 ? greenColor : redColor;

      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.5, 0, 2 * Math.PI);
      ctx.fillStyle = dotColor;
      ctx.fill();
    });
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
