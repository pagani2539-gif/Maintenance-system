import React, { useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface TableCellContentProps {
  children: React.ReactNode;
  fullText?: string;
  mode: 'nowrap' | 'wrap-2' | 'wrap';
}

const TableCellContent: React.FC<TableCellContentProps> = ({ children, fullText, mode }) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const tooltipId = useId();

  useLayoutEffect(() => {
    const element = contentRef.current;
    if (!element || !fullText || mode === 'wrap') {
      setIsOverflowing(false);
      return undefined;
    }

    const measure = () => {
      setIsOverflowing(
        element.scrollWidth > element.clientWidth + 1
        || element.scrollHeight > element.clientHeight + 1,
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [children, fullText, mode]);

  const showTooltip = () => {
    const element = contentRef.current;
    if (!element || !isOverflowing || !fullText) return;
    const rect = element.getBoundingClientRect();
    const width = Math.min(Math.max(rect.width, 220), Math.min(window.innerWidth - 24, 420));
    const left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12);
    setTooltipPosition({ top: rect.bottom + 8, left, width });
  };

  const hideTooltip = () => setTooltipPosition(null);

  return (
    <div
      ref={contentRef}
      className={`data-table__cell-content data-table__cell-content--${mode}${isOverflowing ? ' is-overflowing' : ''}`}
      tabIndex={isOverflowing ? 0 : undefined}
      aria-label={isOverflowing ? fullText : undefined}
      aria-describedby={tooltipPosition ? tooltipId : undefined}
      data-tooltip={isOverflowing ? fullText : undefined}
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
    >
      {children}
      {tooltipPosition && fullText && createPortal(
        <div
          id={tooltipId}
          role="tooltip"
          className="data-table__overflow-tooltip"
          style={{ top: tooltipPosition.top, left: tooltipPosition.left, width: tooltipPosition.width }}
        >
          {fullText}
        </div>,
        document.body,
      )}
    </div>
  );
};

export default TableCellContent;
