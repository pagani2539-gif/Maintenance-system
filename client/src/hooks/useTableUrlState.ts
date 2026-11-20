import { useSearchParams } from 'react-router-dom';
import { useCallback, useMemo } from 'react';
import type { TableUrlState } from '../types/table.types';
import { useBreakpoint } from './useBreakpoint';

export const useTableUrlState = (defaultPageSize: number = 20) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const breakpoint = useBreakpoint();
  const responsiveDefaultPageSize = breakpoint === 'mobile' ? Math.min(defaultPageSize, 10) : defaultPageSize;

  const urlState = useMemo<TableUrlState>(() => {
    const filters: Record<string, string> = {};
    searchParams.forEach((value, key) => {
      if (key.startsWith('f_')) {
        filters[key.replace('f_', '')] = value;
      }
    });

    return {
      page: parseInt(searchParams.get('page') || '1', 10),
      pageSize: parseInt(searchParams.get('pageSize') || responsiveDefaultPageSize.toString(), 10),
      search: searchParams.get('search') || '',
      sortBy: searchParams.get('sortBy') || '',
      sortDir: (searchParams.get('sortDir') as 'asc' | 'desc') || 'desc',
      filters
    };
  }, [searchParams, responsiveDefaultPageSize]);

  const setTableState = useCallback((newState: Partial<TableUrlState>) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);

      if (newState.page !== undefined) {
        if (newState.page === 1) next.delete('page');
        else next.set('page', newState.page.toString());
      }

      if (newState.pageSize !== undefined) {
        if (newState.pageSize === responsiveDefaultPageSize) next.delete('pageSize');
        else next.set('pageSize', newState.pageSize.toString());
      }

      if (newState.search !== undefined) {
        if (!newState.search) next.delete('search');
        else next.set('search', newState.search);
      }

      if (newState.sortBy !== undefined) {
        if (!newState.sortBy) next.delete('sortBy');
        else next.set('sortBy', newState.sortBy);
      }

      if (newState.sortDir !== undefined) {
        next.set('sortDir', newState.sortDir);
      }

      if (newState.filters !== undefined) {
        // Remove existing filters
        Array.from(next.keys()).forEach(key => {
          if (key.startsWith('f_')) next.delete(key);
        });
        // Add new filters
        Object.entries(newState.filters).forEach(([key, value]) => {
          if (value !== undefined && value !== '' && value !== 'All') {
            next.set(`f_${key}`, value.toString());
          }
        });
      }

      return next;
    }, { replace: true });
  }, [setSearchParams, responsiveDefaultPageSize]);

  return { urlState, setTableState };
};
