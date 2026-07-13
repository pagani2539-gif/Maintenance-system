import React from 'react';

interface CardProps {
  title?: React.ReactNode;
  icon?: React.ReactNode;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({
  title,
  icon,
  onClick,
  className = '',
  style,
  children,
}) => {
  const isClickable = !!onClick;
  const clickableStyle = isClickable ? { cursor: 'pointer' } : {};

  return (
    <div
      className={`card${isClickable ? ' card--interactive' : ''} ${className}`}
      onClick={onClick}
      onKeyDown={isClickable ? (event) => {
        if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
        event.preventDefault();
        onClick?.();
      } : undefined}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      style={{ ...clickableStyle, ...style }}
    >
      {title && (
        <div className="card__header">
          <h3 className="card__title">
            {icon && <span className="card__icon">{icon}</span>}
            {title}
          </h3>
        </div>
      )}
      {children}
    </div>
  );
};

export default Card;
