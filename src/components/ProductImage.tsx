import { useEffect, useState } from "react";
import { ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useInView } from "@/hooks/useInView";

const cache = new Map<string, string>();

// Cola de firmas: si varias tarjetas entran a la vista a la vez,
// se pide un solo lote de enlaces en lugar de una petición por foto.
let pendientes: string[] = [];
let programado: ReturnType<typeof setTimeout> | null = null;
const esperando = new Map<string, Array<(url: string | null) => void>>();

function firmar(path: string): Promise<string | null> {
  const enCache = cache.get(path);
  if (enCache) return Promise.resolve(enCache);

  return new Promise((resolve) => {
    const lista = esperando.get(path);
    if (lista) {
      lista.push(resolve);
    } else {
      esperando.set(path, [resolve]);
      pendientes.push(path);
    }
    if (programado) return;
    programado = setTimeout(async () => {
      const lote = pendientes;
      pendientes = [];
      programado = null;
      const { data } = await supabase.storage.from("productos").createSignedUrls(lote, 60 * 60);
      const urls = new Map((data ?? []).map((d) => [d.path ?? "", d.signedUrl ?? ""]));
      for (const p of lote) {
        const url = urls.get(p) || null;
        if (url) cache.set(p, url);
        for (const cb of esperando.get(p) ?? []) cb(url);
        esperando.delete(p);
      }
    }, 60);
  });
}

export function ProductImage({
  path,
  alt,
  className = "",
}: {
  path: string | null;
  alt: string;
  className?: string;
}) {
  const { ref, inView } = useInView<HTMLDivElement>("300px");
  const [url, setUrl] = useState<string | null>(path ? (cache.get(path) ?? null) : null);
  const [cargada, setCargada] = useState(false);

  useEffect(() => {
    let active = true;
    setCargada(false);

    // Foto ya guardada en esta computadora (caja descargable): se usa tal cual.
    if (path && (path.startsWith("costea-img://") || path.startsWith("http"))) {
      setUrl(path);
      return;
    }
    if (!path) {
      setUrl(null);
      return;
    }
    if (cache.has(path)) {
      setUrl(cache.get(path)!);
      return;
    }
    // Aún no se ve en pantalla: no se pide nada todavía.
    if (!inView) {
      setUrl(null);
      return;
    }

    void firmar(path).then((firmada) => {
      if (active && firmada) setUrl(firmada);
    });

    return () => {
      active = false;
    };
  }, [path, inView]);

  return (
    <div ref={ref} className={`relative overflow-hidden bg-surface-2 ${className}`}>
      {(!url || !cargada) && (
        <div className="absolute inset-0 grid animate-pulse place-items-center bg-surface-2 text-muted-foreground">
          <ImageIcon className="size-5 opacity-60" aria-hidden />
        </div>
      )}
      {url && (
        <img
          src={url}
          alt={alt}
          loading="lazy"
          decoding="async"
          onLoad={() => setCargada(true)}
          onError={() => setCargada(true)}
          className={`size-full object-cover transition-opacity duration-300 ${
            cargada ? "opacity-100" : "opacity-0"
          }`}
        />
      )}
      {!url && <span className="sr-only">{alt}</span>}
    </div>
  );
}
