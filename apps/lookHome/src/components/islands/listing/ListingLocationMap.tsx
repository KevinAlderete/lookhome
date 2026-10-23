import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";

type Props = { lat: number; lng: number; title: string };

export default function ListingLocationMap({ lat, lng, title }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    if (!containerRef.current) return;
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: "https://tiles.openfreemap.org/styles/positron",
        center: [lng, lat],
        zoom: 15,
        interactive: false,
      });
      new maplibregl.Marker({ color: "#a84f32" }).setLngLat([lng, lat]).addTo(map);
      map.on("load", () => setStatus("ready"));
      map.on("error", () => setStatus((current) => current === "ready" ? current : "error"));
    } catch {
      setStatus("error");
      return;
    }
    return () => map.remove();
  }, [lat, lng]);

  return (
    <div className="relative mt-4 overflow-hidden rounded-2xl border border-warm-gray/10 bg-cream">
      <div ref={containerRef} role="region" aria-label={`Mapa con la ubicación exacta de ${title}`} className="h-64 w-full sm:h-80" />
      {status !== "ready" && <p role="status" className="absolute inset-0 flex items-center justify-center bg-cream px-6 text-center text-sm text-warm-gray">{status === "error" ? "No se pudo cargar el mapa. Usa el enlace para ver la ubicación." : "Cargando mapa…"}</p>}
    </div>
  );
}
