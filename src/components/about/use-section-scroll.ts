"use client";

import { useRef } from "react";
import { useScroll, useTransform, type MotionValue } from "framer-motion";

interface SectionScrollResult {
  ref: React.RefObject<HTMLDivElement | null>;
  scrollYProgress: MotionValue<number>;
  opacity: MotionValue<number>;
  y: MotionValue<number>;
  scale: MotionValue<number>;
}

export function useSectionScroll(
  fadeIn = [0, 0.2],
  fadeOut = [0.8, 1],
): SectionScrollResult {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const opacity = useTransform(
    scrollYProgress,
    [fadeIn[0], fadeIn[1], fadeOut[0], fadeOut[1]],
    [0, 1, 1, 0],
  );
  const y = useTransform(scrollYProgress, [fadeIn[0], fadeIn[1]], [40, 0]);
  const scale = useTransform(scrollYProgress, [fadeIn[0], fadeIn[1]], [0.97, 1]);

  return { ref, scrollYProgress, opacity, y, scale };
}
