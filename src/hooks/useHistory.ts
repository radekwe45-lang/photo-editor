"use client";

import { useCallback, useState } from "react";

export function useHistory<T>(initial: T, limit = 40) {
  const [stack, setStack] = useState<T[]>([initial]);
  const [index, setIndex] = useState(0);

  const present = stack[index];

  const push = useCallback(
    (value: T) => {
      setStack((prev) => {
        const next = prev.slice(0, index + 1);
        next.push(value);
        if (next.length > limit) next.shift();
        return next;
      });
      setIndex((i) => Math.min(i + 1, limit - 1));
    },
    [index, limit]
  );

  const undo = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1));
  }, []);

  const redo = useCallback(() => {
    setIndex((i) => Math.min(stack.length - 1, i + 1));
  }, [stack.length]);

  const reset = useCallback((value: T) => {
    setStack([value]);
    setIndex(0);
  }, []);

  const canUndo = index > 0;
  const canRedo = index < stack.length - 1;

  return { present, push, undo, redo, reset, canUndo, canRedo };
}
