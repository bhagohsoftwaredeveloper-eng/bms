import {
  motion,
  useMotionValue,
  useTransform,
  animate,
  useReducedMotion,
  type Variants,
} from 'framer-motion';
import { useEffect, type ReactNode, type CSSProperties } from 'react';

/* Shared animation variants ------------------------------------------------ */
export const pageVariants: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.32, ease: [0.22, 0.61, 0.36, 1] } },
  exit: { opacity: 0, y: -10, transition: { duration: 0.18, ease: 'easeIn' } },
};

export const containerVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } },
};

export const itemVariants: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 24 } },
};

/* Route-level page transition ---------------------------------------------- */
export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <motion.div variants={pageVariants} initial="hidden" animate="show" exit="exit">
      {children}
    </motion.div>
  );
}

/* Staggered container + item (opt-in for lists/grids) ---------------------- */
export function Stagger({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <motion.div className={className} style={style} variants={containerVariants} initial="hidden" animate="show">
      {children}
    </motion.div>
  );
}

export function MotionItem({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <motion.div className={className} style={style} variants={itemVariants} whileHover={{ y: -4 }}>
      {children}
    </motion.div>
  );
}

/* Count-up animated number ------------------------------------------------- */
export function AnimatedNumber({
  value,
  duration = 1.1,
  format,
}: {
  value: number;
  duration?: number;
  format?: (n: number) => string;
}) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(0);
  const text = useTransform(mv, (n) => (format ? format(n) : Math.round(n).toLocaleString()));

  useEffect(() => {
    if (reduce) {
      mv.set(value);
      return;
    }
    const controls = animate(mv, value, { duration, ease: [0.22, 0.61, 0.36, 1] });
    return controls.stop;
  }, [value, duration, reduce, mv]);

  return <motion.span>{text}</motion.span>;
}
