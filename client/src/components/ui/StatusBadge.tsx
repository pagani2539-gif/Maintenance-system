import React from 'react';

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'primary';

interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: StatusTone;
  dot?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  tone = 'neutral',
  dot = false,
  className = '',
  children,
  ...props
}) => (
  <span className={`status-badge status-badge--${tone} ${className}`} {...props}>
    {dot && <span className="status-badge__dot" aria-hidden="true" />}
    {children}
  </span>
);

export default StatusBadge;
