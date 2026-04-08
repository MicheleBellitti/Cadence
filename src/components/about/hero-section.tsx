"use client";

import { useRef } from "react";
import {
  motion,
  useScroll,
  useTransform,
  useReducedMotion,
} from "framer-motion";
import { ChevronDown } from "lucide-react";

export function HeroSection() {
  const ref = useRef<HTMLDivElement>(null);
  const prefersReduced = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });

  const opacity = useTransform(scrollYProgress, [0, 0.6], [1, 0]);
  const scale = useTransform(scrollYProgress, [0, 0.6], [1, 0.95]);
  const y = useTransform(scrollYProgress, [0, 0.6], [0, -40]);

  return (
    <section
      ref={ref}
      className="relative flex h-screen items-center justify-center overflow-hidden"
    >
      {/* Gradient background */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(ellipse at 50% 40%, color-mix(in srgb, var(--accent) 12%, transparent) 0%, transparent 60%),
                        radial-gradient(ellipse at 60% 60%, color-mix(in srgb, var(--purple) 8%, transparent) 0%, transparent 50%)`,
        }}
      />

      <motion.div
        className="relative z-10 flex flex-col items-center gap-6 px-6 text-center"
        style={
          prefersReduced
            ? undefined
            : { opacity, scale, y }
        }
      >
        <h1 className="text-5xl font-bold tracking-tight text-[var(--text-primary)] sm:text-6xl md:text-7xl">
          Welcome to Cadence
        </h1>
        <p className="max-w-lg text-lg text-[var(--text-secondary)] sm:text-xl">
          Plan, track, and ship with clarity.
          <br />
          Scroll to explore how it works.
        </p>

        {/* Bouncing arrow */}
        <motion.div
          className="mt-8 text-[var(--text-secondary)]"
          animate={prefersReduced ? undefined : { y: [0, 8, 0] }}
          transition={{
            duration: 1.8,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          <ChevronDown className="h-8 w-8" />
        </motion.div>
      </motion.div>
    </section>
  );
}
