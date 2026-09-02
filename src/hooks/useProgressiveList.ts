import { useEffect, useRef, useState } from "react";

/**
 * Renderiza una lista larga por bloques: primero lo que se ve y,
 * al acercarse el final del scroll, agrega el siguiente bloque solo.
 */
export function useProgressiveList<T>(items: T[], chunk = 40) {
  const [count, setCount] = useState(chunk);
  const sentinel = useRef<HTMLDivElement | null>(null);

  // Al cambiar los datos (filtros, búsqueda) se vuelve al primer bloque.
  useEffect(() => {
    setCount(chunk);
  }, [items, chunk]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || count >= items.length) return;
    if (typeof IntersectionObserver === "undefined") {
      setCount(items.length);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setCount((c) => Math.min(c + chunk, items.length));
        }
      },
      { rootMargin: "400px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [count, items.length, chunk]);

  return {
    rendered: items.slice(0, count),
    hasMore: count < items.length,
    sentinelRef: sentinel,
  };
}
