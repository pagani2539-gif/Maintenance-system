import React, { useEffect, useRef, useState } from 'react';

export interface ChartSize {
  width: number;
  height: number;
}

interface ChartFrameProps {
  height: number;
  children: (size: ChartSize) => React.ReactNode;
}

const ChartFrame: React.FC<ChartFrameProps> = ({ height, children }) => {
  const frameRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<ChartSize>({ width: 0, height });

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    const measure = () => {
      const width = Math.floor(frame.getBoundingClientRect().width);
      if (width > 0) setSize({ width, height });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [height]);

  return (
    <div ref={frameRef} style={{ width: '100%', height }}>
      {size.width > 0 ? children(size) : null}
    </div>
  );
};

export default ChartFrame;
