import React from 'react';

export type MaterialIconName =
  | 'arrow_downward'
  | 'arrow_upward'
  | 'auto_awesome'
  | 'check'
  | 'chevron_left'
  | 'chevron_right'
  | 'close'
  | 'content_copy'
  | 'dark_mode'
  | 'expand_more'
  | 'fiber_manual_record'
  | 'light_mode'
  | 'open_in_full'
  | 'photo_camera'
  | 'settings'
  | 'swap_vert'
  | 'unfold_more';

type IconSize = 'xs' | 'sm' | 'md' | 'lg';

const sizeClass: Record<IconSize, string> = {
  xs: 'icon--xs',
  sm: 'icon--sm',
  md: 'icon--md',
  lg: 'icon--lg',
};

interface IconProps {
  name: MaterialIconName;
  size?: IconSize;
  className?: string;
  style?: React.CSSProperties;
  filled?: boolean;
  label?: string;
}

export const Icon: React.FC<IconProps> = ({
  name,
  size = 'md',
  className,
  style,
  filled = false,
  label,
}) => {
  const classes = ['material-symbols-outlined', 'icon', sizeClass[size], className]
    .filter(Boolean)
    .join(' ');

  return (
    <span
      className={classes}
      style={{
        fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' 500, 'GRAD' 0, 'opsz' 20`,
        ...style,
      }}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
    >
      {name}
    </span>
  );
};

export function CardLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="card-label">
      <Icon name="chevron_right" size="sm" className="icon--label" />
      {children}
    </span>
  );
}

export function XIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 19 19"
      aria-hidden
      fill="currentColor"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <path
        fillRule="evenodd"
        d="M1.893 1.98c.052.072 1.245 1.769 2.653 3.77l2.892 4.114c.183.261.333.48.333.486s-.068.089-.152.183l-.522.593-.765.867-3.597 4.087c-.375.426-.734.834-.798.905a1 1 0 0 0-.118.148c0 .01.236.017.664.017h.663l.729-.83c.4-.457.796-.906.879-.999a692 692 0 0 0 1.794-2.038c.034-.037.301-.34.594-.675l.551-.624.345-.392a7 7 0 0 1 .34-.374c.006 0 .93 1.306 2.052 2.903l2.084 2.965.045.063h2.275c1.87 0 2.273-.003 2.266-.021-.008-.02-1.098-1.572-3.894-5.547-2.013-2.862-2.28-3.246-2.273-3.266.008-.019.282-.332 2.085-2.38l2-2.274 1.567-1.782c.022-.028-.016-.03-.65-.03h-.674l-.3.342a871 871 0 0 1-1.782 2.025c-.067.075-.405.458-.75.852a100 100 0 0 1-.803.91c-.148.172-.299.344-.99 1.127-.304.343-.32.358-.345.327-.015-.019-.904-1.282-1.976-2.808L6.365 1.85H1.8zm1.782.91 8.078 11.294c.772 1.08 1.413 1.973 1.425 1.984.016.017.241.02 1.05.017l1.03-.004-2.694-3.766L7.796 5.75 5.722 2.852l-1.039-.004-1.039-.004z"
        clipRule="evenodd"
      />
    </svg>
  );
}
