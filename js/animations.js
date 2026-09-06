document.addEventListener("DOMContentLoaded", () => {
  // --- Text Reveal Animations (SplitText) ---
  if (typeof SplitText !== "undefined" && typeof gsap !== "undefined") {
    // Find all primary headers and hero texts
    const textElements = document.querySelectorAll("h1, h2, .hero-text");
    
    textElements.forEach(el => {
      // Split the text into lines and words for a staggered reveal
      const split = new SplitText(el, { type: "lines,words" });
      
      gsap.fromTo(split.words, 
        { y: 30, opacity: 0 },
        { 
          y: 0, 
          opacity: 1, 
          duration: 0.8, 
          stagger: 0.02, 
          ease: "power3.out",
          delay: 0.2,
          clearProps: "opacity,transform"
        }
      );
    });
  }

  // --- Bento Card Entrance ---
  if (typeof gsap !== "undefined") {
    gsap.fromTo(".bento-card", 
      { y: 40, opacity: 0 },
      {
        y: 0,
        opacity: 1,
        duration: 0.8,
        stagger: 0.1,
        ease: "power3.out",
        delay: 0.1,
        clearProps: "opacity,transform"
      }
    );

    gsap.fromTo("nav", 
      { y: -20, opacity: 0 },
      {
        y: 0,
        opacity: 1,
        duration: 0.6,
        ease: "power2.out",
        clearProps: "opacity,transform"
      }
    );
  }

  // --- Infinite Marquee ---
  const marqueeContent = document.querySelector('.marquee-content');
  if (marqueeContent && typeof gsap !== 'undefined') {
    // We animate xPercent to -50 to seamlessly loop the duplicated content
    const marqueeTween = gsap.to(marqueeContent, {
      xPercent: -50,
      ease: "none",
      duration: 20,
      repeat: -1
    });

    const marqueeContainer = document.querySelector('.marquee-container');
    if (marqueeContainer) {
      marqueeContainer.addEventListener('mouseenter', () => {
        // Smoothly slow down the marquee to 20% speed
        gsap.to(marqueeTween, { timeScale: 0.2, duration: 0.5 });
      });
      marqueeContainer.addEventListener('mouseleave', () => {
        // Smoothly speed it back up to normal
        gsap.to(marqueeTween, { timeScale: 1, duration: 0.5 });
      });
    }
  }

  // --- Page Transitions ---
  const links = document.querySelectorAll("a");
  links.forEach(link => {
    link.addEventListener("click", (e) => {
      const href = link.getAttribute("href");
      
      // Ignore clicks on non-navigation links (anchors, external, new tabs)
      if (
        !href || 
        href.startsWith("#") || 
        href.startsWith("http") || 
        href.startsWith("mailto") ||
        link.getAttribute("target") === "_blank" ||
        href.includes("javascript:")
      ) {
        return;
      }

      e.preventDefault();
      
      // Play exit animation before navigating
      if (typeof gsap !== "undefined") {
        gsap.to("body", {
          opacity: 0,
          y: -20,
          duration: 0.4,
          ease: "power2.inOut",
          onComplete: () => {
            window.location.href = href;
          }
        });
      } else {
        window.location.href = href;
      }
    });
  });
});
