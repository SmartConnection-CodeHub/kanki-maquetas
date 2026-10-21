'use strict';
(() => {
  // Observe the whole scroll sequence, rather than its transformed, hidden slides.
  const groups = [...document.querySelectorAll('#product-showcase,.kanki-editorial,.story-photo,.school-photo,.journal-card')];
  const prepare = group => group.querySelectorAll('img[loading="lazy"]').forEach(image => {
    image.setAttribute('loading','eager');
    image.setAttribute('decoding','async');
    if (!image.hasAttribute('fetchpriority')) image.fetchPriority = 'low';
  });
  if (!('IntersectionObserver' in window)) { groups.forEach(prepare); return; }
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      prepare(entry.target);
      observer.unobserve(entry.target);
    });
  }, {rootMargin:'1600px 0px', threshold:0});
  groups.forEach(group => observer.observe(group));
})();
