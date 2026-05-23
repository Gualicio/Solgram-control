import { useState, useEffect } from 'react';

export function useScrollDirection(activeTab?: string) {
  const [isCompressed, setIsCompressed] = useState(false);
  
  useEffect(() => {
    // Reset state when tab changes so header is always initially visible
    setIsCompressed(false);
  }, [activeTab]);
  
  useEffect(() => {
    let lastScrollYVal = 0;
    
    // We want to track any scroll in the app, so we use capturing phase on window
    const handleScroll = (e: Event) => {
      const target = e.target as HTMLElement;
      if (!target || (
        target.id !== 'main-scroll-container' && 
        target.id !== 'calendar-grid-scroll'
      )) return;
      
      const currentScrollY = target.scrollTop;
      
      // Ignore very small scrolls or horizontal scrolls
      if (Math.abs(currentScrollY - lastScrollYVal) < 5) {
        return;
      }
      
      if (currentScrollY > 15) {
        setIsCompressed(true);
      } else {
        setIsCompressed(false);
      }
      
      lastScrollYVal = currentScrollY;
    };

    window.addEventListener('scroll', handleScroll, { capture: true, passive: true });
    return () => window.removeEventListener('scroll', handleScroll, { capture: true });
  }, []);

  return isCompressed;
}
