import { useEffect, useMemo, useRef, useState } from "react";

type RaysOrigin = "top-center" | "bottom-center" | "center";

type LightRaysProps = {
  raysOrigin?: RaysOrigin;
  raysColor?: string;
  raysSpeed?: number;
  lightSpread?: number;
  rayLength?: number;
  followMouse?: boolean;
  mouseInfluence?: number;
  noiseAmount?: number;
  distortion?: number;
  className?: string;
  pulsating?: boolean;
  fadeDistance?: number;
  saturation?: number;
};

export default function LightRays({
  raysOrigin = "bottom-center",
  raysColor = "#fafafa",
  raysSpeed = 1.5,
  lightSpread = 1.8,
  rayLength = 2.6,
  followMouse = true,
  mouseInfluence = 0,
  noiseAmount = 0.31,
  distortion = 0,
  className,
  pulsating = false,
  fadeDistance = 1.7,
  saturation = 0.8
}: LightRaysProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [mouse, setMouse] = useState({ x: 50, y: 50 });

  useEffect(() => {
    if (!followMouse) return;
    const el = rootRef.current;
    if (!el) return;

    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      setMouse({ x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) });
    };

    el.addEventListener("mousemove", onMove);
    return () => el.removeEventListener("mousemove", onMove);
  }, [followMouse]);

  const origin = useMemo(() => {
    if (raysOrigin === "top-center") return "50% 0%";
    if (raysOrigin === "center") return "50% 50%";
    return "50% 100%";
  }, [raysOrigin]);

  const influence = followMouse ? Math.max(0.08, mouseInfluence || 0.18) : 0;
  const xShift = (mouse.x - 50) * influence;
  const yShift = (mouse.y - 50) * influence;

  return (
    <div
      ref={rootRef}
      className={className}
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        filter: `saturate(${saturation})`
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: "-20%",
          transformOrigin: origin,
          transform: `translate(${xShift}px, ${yShift}px) scale(${lightSpread})`,
          backgroundImage: `repeating-conic-gradient(from 0deg at ${origin}, ${raysColor}22 0deg, ${raysColor}88 1.2deg, transparent 2.4deg, transparent 6deg)`,
          opacity: 0.55,
          mixBlendMode: "screen",
          animation: `spin ${Math.max(10, 30 / Math.max(0.4, raysSpeed))}s linear infinite${pulsating ? ", pulse 6s ease-in-out infinite" : ""}`
        }}
      />

      <div
        style={{
          position: "absolute",
          inset: "-10%",
          transformOrigin: origin,
          transform: `scale(${rayLength})`,
          background: `radial-gradient(circle at ${origin}, ${raysColor}40 0%, ${raysColor}14 ${Math.min(75, 35 + fadeDistance * 15)}%, transparent 80%)`,
          mixBlendMode: "screen",
          opacity: 0.7
        }}
      />

      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: Math.max(0, Math.min(0.45, noiseAmount)),
          backgroundImage:
            "radial-gradient(circle at 20% 20%, rgba(255,255,255,.12) 0 1px, transparent 1px), radial-gradient(circle at 80% 70%, rgba(255,255,255,.10) 0 1px, transparent 1px)",
          backgroundSize: `${Math.max(18, 42 - distortion * 10)}px ${Math.max(18, 42 - distortion * 10)}px`
        }}
      />

      <style>{`
        @keyframes spin { from { transform: rotate(0deg) scale(${lightSpread}); } to { transform: rotate(360deg) scale(${lightSpread}); } }
        @keyframes pulse { 0%,100% { opacity: .45; } 50% { opacity: .75; } }
      `}</style>
    </div>
  );
}
