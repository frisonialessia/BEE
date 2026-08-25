"use client";

import { useEffect, useRef, useState } from "react";

/**
 * True once the referenced element has entered the viewport — used to
 * trigger scroll-reveal animations (fade/slide in) instead of animating
 * everything on mount. Fires once and disconnects (`once` default true):
 * a landing section should animate in when the visitor scrolls to it, not
 * re-trigger every time it crosses the threshold on scroll-back.
 */
export function useInView<T extends HTMLElement>(options?: {
  threshold?: number;
  rootMargin?: string;
  once?: boolean;
}) {
  const ref = useRef<T>(null);
  // Siempre arranca en false, en servidor Y cliente por igual — un
  // initializer que chequeara `typeof IntersectionObserver` acá rompería
  // la hidratación: esa API tampoco existe en Node (SSR), no solo en
  // navegadores viejos, así que server y cliente arrancarían con valores
  // distintos aunque el navegador fuera moderno.
  const [inView, setInView] = useState(false);
  const { threshold = 0.2, rootMargin = "0px", once = true } = options ?? {};

  useEffect(() => {
    // Sin IntersectionObserver (navegador viejo) mostrar igual, un frame
    // después de montar — nunca síncrono dentro del efecto (dispara
    // renders en cascada) y nunca deja el contenido escondido para
    // siempre solo porque la animación decorativa no puede correr.
    if (typeof IntersectionObserver === "undefined") {
      const raf = requestAnimationFrame(() => setInView(true));
      return () => cancelAnimationFrame(raf);
    }

    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (once) observer.disconnect();
        } else if (!once) {
          setInView(false);
        }
      },
      { threshold, rootMargin },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold, rootMargin, once]);

  return { ref, inView };
}
