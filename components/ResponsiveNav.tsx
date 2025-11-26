
import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';

interface ResponsiveNavProps {
  tabs: string[];
  activeTab: string;
  onTabClick: (tab: string) => void;
}

export const ResponsiveNav: React.FC<ResponsiveNavProps> = ({ tabs, activeTab, onTabClick }) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const [visibleTabs, setVisibleTabs] = useState(tabs);
  const [dropdownTabs, setDropdownTabs] = useState<string[]>([]);
  const navRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const calculateVisibleTabs = () => {
      if (!navRef.current) return;

      const containerWidth = navRef.current.offsetWidth;
      let totalWidth = 0;
      let visibleCount = 0;

      for (let i = 0; i < tabs.length; i++) {
        const tabWidth = tabsRef.current[i]?.offsetWidth || 0;
        if (totalWidth + tabWidth > containerWidth - 80) { // 80px for the "More" button
          break;
        }
        totalWidth += tabWidth;
        visibleCount++;
      }

      if (visibleCount === tabs.length) {
        setVisibleTabs(tabs);
        setDropdownTabs([]);
      } else {
        setVisibleTabs(tabs.slice(0, visibleCount));
        setDropdownTabs(tabs.slice(visibleCount));
      }
    };

    calculateVisibleTabs();
    window.addEventListener('resize', calculateVisibleTabs);
    return () => window.removeEventListener('resize', calculateVisibleTabs);
  }, [tabs]);

  return (
    <div className="table-nav-wrapper" ref={navRef}>
      <div className="table-nav-desktop">
        {visibleTabs.map((tab) => (
          <button
            key={tab}
            ref={(el) => (tabsRef.current[tabs.indexOf(tab)] = el)}
            onClick={() => onTabClick(tab)}
            className={`table-nav-btn capitalize ${activeTab === tab ? 'active' : ''}`}
          >
            {tab}
          </button>
        ))}
        {dropdownTabs.length > 0 && (
          <div className="relative">
            <button onClick={() => setShowDropdown(!showDropdown)} className="table-nav-btn">
              More
              <ChevronDown size={16} className={`ml-2 transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
            </button>
            {showDropdown && (
              <div className="options-menu" style={{ right: 0, top: 'calc(100% + 4px)', width: '200px' }}>
                {dropdownTabs.map((tab) => (
                  <button
                    key={tab}
                    onClick={() => {
                      onTabClick(tab);
                      setShowDropdown(false);
                    }}
                    className={`options-item capitalize ${activeTab === tab ? 'active' : ''}`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
