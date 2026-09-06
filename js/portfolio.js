document.addEventListener("DOMContentLoaded", (event) => {
  // Register GSAP ScrollTrigger
  gsap.registerPlugin(ScrollTrigger);

  const tl = gsap.timeline();

  // Initial Hero Load Animations
  tl.from(".nb-nav", {
    y: -20,
    opacity: 0,
    duration: 0.6,
    ease: "power3.out"
  });

  // Stagger animate hero elements
  tl.from(".nb-hero .animate-in", {
    y: 30,
    opacity: 0,
    duration: 0.8,
    stagger: 0.1,
    ease: "power3.out"
  }, "-=0.4");

  // Scroll Trigger Animations for sections below the fold
  const animateIns = document.querySelectorAll('.animate-in:not(.nb-hero .animate-in):not(.nb-nav)');
  animateIns.forEach((elem) => {
    gsap.from(elem, {
      scrollTrigger: {
        trigger: elem,
        start: "top 85%",
      },
      y: 30,
      opacity: 0,
      duration: 0.8,
      ease: "power3.out"
    });
  });

});
