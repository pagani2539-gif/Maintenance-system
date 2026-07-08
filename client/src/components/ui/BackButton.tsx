import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

interface BackButtonProps {
  /** Fixed destination to navigate to. If omitted, goes back one step in history. */
  to?: string;
  /** Button label. Defaults to "ย้อนกลับ". */
  label?: string;
  style?: React.CSSProperties;
}

export const BackButton: React.FC<BackButtonProps> = ({ to, label = 'ย้อนกลับ', style }) => {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      className="back-button"
      onClick={() => (to ? navigate(to) : navigate(-1))}
      style={style}
    >
      <ArrowLeft size={14} />
      {label}
    </button>
  );
};

export default BackButton;
