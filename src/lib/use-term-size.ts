import { useState, useEffect } from 'react';
import { useStdout } from 'ink';

export interface TermSize {
  rows: number;
  cols: number;
}

const DEFAULTS = { rows: 24, cols: 80 };

export function useTermSize(): TermSize {
  const { stdout } = useStdout();
  const [size, setSize] = useState<TermSize>(() => ({
    rows: stdout.rows ?? DEFAULTS.rows,
    cols: stdout.columns ?? DEFAULTS.cols,
  }));

  useEffect(() => {
    const onResize = () => {
      setSize({
        rows: stdout.rows ?? DEFAULTS.rows,
        cols: stdout.columns ?? DEFAULTS.cols,
      });
    };
    stdout.on('resize', onResize);
    return () => { stdout.off('resize', onResize); };
  }, [stdout]);

  return size;
}
