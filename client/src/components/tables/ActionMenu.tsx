import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';
import type { TableAction } from '../../types/table.types';

interface ActionMenuProps<T> {
  row: T;
  actions: TableAction<T>[];
}

function ActionMenu<T>({ row, actions }: ActionMenuProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  // Handle clicking outside the menu button/portal
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isOpen && triggerRef.current && !triggerRef.current.contains(event.target as Node)) {
        if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
          setIsOpen(false);
        }
      }
    };
    
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const visibleActions = actions.filter(action => {
    if (typeof action.hidden === 'function') return !action.hidden(row);
    return !action.hidden;
  });

  // Split into inline (rendered as icon buttons) and overflow (collected under ⋯)
  const inlineActions = visibleActions.filter(a => a.inline);
  const overflowActions = visibleActions.filter(a => !a.inline);

  // Position calculation and scroll/resize handler
  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const updatePosition = () => {
        const rect = triggerRef.current!.getBoundingClientRect();
        const popoverHeight = overflowActions.length * 40 + 8; // approx 40px per item + padding
        const spaceBelow = window.innerHeight - rect.bottom;
        const shouldDropUp = spaceBelow < popoverHeight + 20;

        setCoords({
          top: Math.max(8, Math.min(
            shouldDropUp ? rect.top - popoverHeight - 4 : rect.bottom + 4,
            window.innerHeight - popoverHeight - 8,
          )),
          left: Math.max(8, Math.min(rect.right - 160, window.innerWidth - 168))
        });
      };

      updatePosition();

      // Close menu on scroll or resize to prevent floating
      const handleScrollOrResize = () => {
        setIsOpen(false);
      };

      window.addEventListener('scroll', handleScrollOrResize, true);
      window.addEventListener('resize', handleScrollOrResize);
      return () => {
        window.removeEventListener('scroll', handleScrollOrResize, true);
        window.removeEventListener('resize', handleScrollOrResize);
      };
    }
  }, [isOpen, overflowActions.length]);

  useEffect(() => {
    if (!isOpen) return;
    const frameId = window.requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus();
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [isOpen]);

  if (visibleActions.length === 0) return null;

  return (
    <div className="table-action-group">
      {inlineActions.map((action) => {
        const isDisabled = typeof action.disabled === 'function' ? action.disabled(row) : action.disabled;
        return (
          <button
            key={action.id}
            className="table-action-button"
            data-variant={action.variant || 'ghost'}
            type="button"
            disabled={isDisabled}
            title={action.label}
            aria-label={action.label}
            onClick={(e) => {
              e.stopPropagation();
              if (!isDisabled) action.onClick(row);
            }}
          >
            {action.icon}
          </button>
        );
      })}

      {overflowActions.length > 0 && (
        <>
          <button
            ref={triggerRef}
            className="table-action-button table-action-button--overflow"
            data-variant="ghost"
            type="button"
            title="ตัวเลือกเพิ่มเติม"
            aria-label="ตัวเลือกเพิ่มเติม"
            aria-haspopup="menu"
            aria-expanded={isOpen}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setIsOpen(true);
              } else if (e.key === 'Escape' && isOpen) {
                e.preventDefault();
                setIsOpen(false);
              }
            }}
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(!isOpen);
            }}
          >
            <MoreHorizontal size={16} />
          </button>

          {isOpen && createPortal(
            <div
              ref={menuRef}
              className="table-action-menu"
              role="menu"
              onKeyDown={(e) => {
                const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') || []);
                const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
                if (e.key === 'ArrowDown' && items.length > 0) {
                  e.preventDefault();
                  items[(currentIndex + 1 + items.length) % items.length].focus();
                } else if (e.key === 'ArrowUp' && items.length > 0) {
                  e.preventDefault();
                  items[(currentIndex - 1 + items.length) % items.length].focus();
                } else if (e.key === 'Home' && items.length > 0) {
                  e.preventDefault();
                  items[0].focus();
                } else if (e.key === 'End' && items.length > 0) {
                  e.preventDefault();
                  items[items.length - 1].focus();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setIsOpen(false);
                  triggerRef.current?.focus();
                }
              }}
              style={{
                top: `${coords.top}px`,
                left: `${coords.left}px`,
              }}
            >
              {overflowActions.map((action) => {
                const isDisabled = typeof action.disabled === 'function' ? action.disabled(row) : action.disabled;
                return (
                  <button
                    key={action.id}
                    className="table-action-menuitem"
                    data-variant={action.variant || 'ghost'}
                    type="button"
                    role="menuitem"
                    disabled={isDisabled}
                    onClick={(e) => {
                      e.stopPropagation();
                      action.onClick(row);
                      setIsOpen(false);
                    }}
                  >
                    {action.icon && <span className="table-action-menuitem__icon">{action.icon}</span>}
                    {action.label}
                  </button>
                );
              })}
            </div>,
            document.body
          )}
        </>
      )}
    </div>
  );
}

export default React.memo(ActionMenu) as typeof ActionMenu;
