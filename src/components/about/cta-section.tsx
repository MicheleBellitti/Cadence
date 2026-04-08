"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import { useSectionScroll } from "./use-section-scroll";

/* ------------------------------------------------------------------ */
/*  Floating particle dot — pure CSS animation, no JS overhead         */
/* ------------------------------------------------------------------ */

function FloatingDot({
  size,
  x,
  y,
  delay,
  duration,
  color,
}: {
  size: number;
  x: string;
  y: string;
  delay: number;
  duration: number;
  color: string;
}) {
  return (
    <motion.div
      className="absolute rounded-full"
      style={{
        width: size,
        height: size,
        left: x,
        top: y,
        backgroundColor: color,
      }}
      animate={{
        y: [0, -20, 0],
        opacity: [0.2, 0.6, 0.2],
      }}
      transition={{
        duration,
        delay,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    />
  );
}

const DOTS = [
  { size: 4, x: "12%", y: "20%", delay: 0, duration: 4, color: "var(--accent)" },
  { size: 3, x: "85%", y: "30%", delay: 1.2, duration: 3.5, color: "var(--purple)" },
  { size: 5, x: "25%", y: "75%", delay: 0.8, duration: 4.5, color: "var(--accent)" },
  { size: 3, x: "70%", y: "65%", delay: 2, duration: 3.8, color: "var(--success)" },
  { size: 4, x: "50%", y: "15%", delay: 1.5, duration: 4.2, color: "var(--purple)" },
  { size: 3, x: "90%", y: "80%", delay: 0.4, duration: 3.2, color: "var(--accent)" },
  { size: 4, x: "8%", y: "55%", delay: 2.5, duration: 4, color: "var(--warning)" },
  { size: 3, x: "40%", y: "85%", delay: 1, duration: 3.6, color: "var(--success)" },
];

/* ------------------------------------------------------------------ */
/*  Main section                                                       */
/* ------------------------------------------------------------------ */

export function CTASection() {
  const { ref, opacity, y, scale } = useSectionScroll([0, 0.3], [0.85, 1]);

  return (
    <section ref={ref} className="relative overflow-hidden px-6 py-40">
      {/* Radial gradient backdrop */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 50%, color-mix(in srgb, var(--accent) 12%, transparent), transparent)",
        }}
      />

      {/* Soft ring */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          width: 500,
          height: 500,
          border: "1px solid color-mix(in srgb, var(--accent) 10%, transparent)",
        }}
      />
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          width: 700,
          height: 700,
          border: "1px solid color-mix(in srgb, var(--accent) 5%, transparent)",
        }}
      />

      {/* Floating particles */}
      {DOTS.map((dot, i) => (
        <FloatingDot key={i} {...dot} />
      ))}

      {/* Content */}
      <motion.div
        className="relative z-10 mx-auto flex max-w-[900px] flex-col items-center text-center"
        style={{ opacity, y, scale }}
      >
        {/* Badge */}
        <motion.div
          className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-1.5"
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
        >
          <Sparkles className="h-3.5 w-3.5 text-[var(--accent)]" />
          <span className="text-xs font-medium text-[var(--text-secondary)]">
            Free &amp; open source
          </span>
        </motion.div>

        <h2 className="text-4xl font-bold tracking-tight text-[var(--text-primary)] sm:text-5xl">
          Ready to build your plan?
        </h2>
        <p className="mt-4 max-w-lg text-lg text-[var(--text-secondary)]">
          Start organizing your project in minutes. Everything runs in your
          browser — no accounts, no servers, no limits.
        </p>

        {/* CTA button with glow */}
        <Link
          href="/dashboard"
          className="group relative mt-10 inline-flex items-center gap-2 rounded-xl px-8 py-4 text-base font-semibold text-white transition-all hover:scale-105 active:scale-100"
          style={{ backgroundColor: "var(--accent)" }}
        >
          {/* Glow behind button */}
          <span
            className="absolute inset-0 -z-10 rounded-xl blur-xl transition-opacity group-hover:opacity-100 opacity-50"
            style={{ backgroundColor: "var(--accent)" }}
          />
          Get Started
          <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
        </Link>

        {/* Subtle trust line */}
        <p className="mt-6 text-xs text-[var(--text-tertiary)]">
          No sign-up required &middot; Data stays in your browser
        </p>
      </motion.div>
    </section>
  );
}
