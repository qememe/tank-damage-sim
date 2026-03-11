import { useEffect, useRef } from "react";

export interface PlaybackOptions {
  isPlaying: boolean;
  speed: number;
  maxTime: number;
  currentTime: number;
  setTime: (time: number) => void;
  onFinish?: () => void;
}

export function usePlayback({ isPlaying, speed, maxTime, currentTime, setTime, onFinish }: PlaybackOptions) {
  const frameRef = useRef<number>();
  const lastTimestamp = useRef<number | null>(null);
  const currentRef = useRef(currentTime);

  useEffect(() => {
    currentRef.current = currentTime;
  }, [currentTime]);

  useEffect(() => {
    if (!isPlaying) {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
      lastTimestamp.current = null;
      return;
    }

    const tick = (timestamp: number) => {
      if (lastTimestamp.current === null) {
        lastTimestamp.current = timestamp;
      }
      const deltaSeconds = (timestamp - lastTimestamp.current) / 1000;
      lastTimestamp.current = timestamp;
      const advance = deltaSeconds * speed;
      const next = Math.min(currentRef.current + advance, maxTime);
      currentRef.current = next;
      setTime(next);
      if (next >= maxTime) {
        onFinish?.();
        return;
      }
      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [isPlaying, speed, maxTime, setTime, onFinish]);
}
