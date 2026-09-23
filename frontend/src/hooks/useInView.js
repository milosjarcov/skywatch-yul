import { useEffect } from "react";

// Adds "is-visible" to every [data-reveal] element inside `rootRef` as it
// scrolls into view. The CSS turns that into a fade and rise.
export function useReveal(rootRef) {
  useEffect(() => {
    const elements = rootRef.current.querySelectorAll("[data-reveal]");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [rootRef]);
}
