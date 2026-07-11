import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'outline' | 'text' | 'danger' | 'success' | 'warning';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  loading,
  icon,
  className = '',
  disabled,
  ...props
}) => {
  const variantClass = `btn-${variant}`;
  const sizeClass = size !== 'md' ? `btn-${size}` : '';
  const isDisabled = disabled || loading;

  return (
    <button
      className={`btn ${variantClass} ${sizeClass} ${className}`}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <span className="spinner-sm btn__icon" aria-hidden="true"></span>
      ) : icon ? (
        <span className="btn__icon" aria-hidden="true">{icon}</span>
      ) : null}
      {children}
    </button>
  );
};

export default Button;
