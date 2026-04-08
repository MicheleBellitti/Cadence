"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useSectionScroll } from "./use-section-scroll";

export function CTASection() {
  const { ref, opacity, y, scale } = useSectionScroll([0, 0.3], [0.85, 1]);

  return (
    <section ref={ref} className="px-6 py-32">
      <motion.div
        className="mx-auto flex max-w-[900px] flex-col items-center text-center"
        style={{ opacity, y, scale }}
      >
        <h2 className="text-4xl font-bold tracking-tight text-[var(--text-primary)] sm:text-5xl">
          Ready to build your plan?
        </h2>
        <p className="mt-4 max-w-md text-lg text-[var(--text-secondary)]">
          Start organizing your project in minutes. No setup required.
        </p>
        <Link
          href="/dashboard"
          className="group mt-10 inline-flex items-center gap-2 rounded-xl px-8 py-4 text-base font-semibold text-white transition-transform hover:scale-105 active:scale-100"
          style={{ backgroundColor: "var(--accent)" }}
        >
          Get Started
          <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
        </Link>
      </motion.div>
    </section>
  );
}
