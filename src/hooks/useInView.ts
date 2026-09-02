import { useEffect, useRef, useState } from "react";

/**
 * Observa un elemento y avisa cuando entra (o está por entrar) en pantalla.
 * Sirve para cargar fotos y filas solo cuando el usuario realmente las ve.
 */
export function useInView<T extends HTMLElement = HTMLDivElement>(
  rootMargin = "300px",
  once = true,
) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setInView(true);
            if (once) obs.disconnect();
          } else if (!once) {
            setInView(false);
          }
        }
      },
      { rootMargin },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [rootMargin, once]);

  return { ref, inView };
}
