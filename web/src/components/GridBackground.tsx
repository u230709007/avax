import { useEffect } from "react";

/** Sayfanın arkasındaki ızgara; fare çevresindeki çizgiler aydınlanır (styles.css `.grid-bg`). */
export function GridBackground() {
  useEffect(() => {
    const root = document.documentElement;
    let frame = 0;
    let x = -1000;
    let y = -1000;
    const apply = () => {
      frame = 0;
      root.style.setProperty("--mx", `${x}px`);
      root.style.setProperty("--my", `${y}px`);
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      x = e.clientX;
      y = e.clientY;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const leave = () => {
      x = -1000;
      y = -1000;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    window.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerleave", leave);
    return () => {
      window.removeEventListener("pointermove", move);
      document.removeEventListener("pointerleave", leave);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return <div className="grid-bg" aria-hidden="true" />;
}
