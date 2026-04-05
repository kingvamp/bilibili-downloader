import { useEffect, useRef } from 'react';

interface LogPanelProps {
  logs: string;
}

export function LogPanel({ logs }: LogPanelProps) {
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div id="log" ref={logRef}>
      {logs}
    </div>
  );
}
