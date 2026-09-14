import { useEffect, useRef } from "react";

export default function AccessibleModal({ children, close, className = "review-modal", label = "Dialog" }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const element = ref.current;
    const focusable = element?.querySelector("button, input, select, textarea, [tabindex]:not([tabindex='-1'])");
    focusable?.focus();
    const onKey = (event) => {
      if (event.key === "Escape") close();
      if (event.key !== "Tab" || !element) return;
      const items = [...element.querySelectorAll("button, input, select, textarea, [tabindex]:not([tabindex='-1'])")].filter((item) => !item.disabled);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [close]);

  return (
    <div className="modal-wrap" role="presentation">
      <button className="modal-scrim" onClick={close} aria-label="Close dialog" />
      <section ref={ref} className={className} role="dialog" aria-modal="true" aria-label={label}>
        {children}
      </section>
    </div>
  );
}
