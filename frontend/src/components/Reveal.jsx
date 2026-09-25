import { motion } from 'motion/react';

// Reveal bersama: muncul sekali saat grup masuk viewport = orientasi scroll
// (MOTION 2, dial DESIGN.md). Tanpa cascade delay antar kartu.
// innerKey: untuk konten yang perlu animasi ulang saat identitas berubah
// (mis. ganti tab) — key dipasang di motion.div dalam.
export function Reveal({ children, className = '', innerKey }) {
  return (
    <motion.div
      key={innerKey}
      className={className}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-48px' }}
      transition={{ duration: 0.45, ease: [0.32, 0.72, 0, 1] }}
    >
      {children}
    </motion.div>
  );
}
