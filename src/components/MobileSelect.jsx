// src/components/MobileSelect.jsx
import { useState, useRef, useEffect } from 'react';

/**
 * Custom select component with support for custom rendering
 * Uses custom dropdown UI on both mobile and desktop for consistent icon support
 * Mobile shows dropdown from bottom, desktop shows dropdown below the button
 */
export default function MobileSelect({ value, onChange, options, className, renderOption, renderSelected, ...props }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const selectRef = useRef(null);
  
  useEffect(() => {
    // Detect if we're on a mobile device
    const checkMobile = () => setIsMobile(window.innerWidth <= 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  useEffect(() => {
    if (!isOpen) return;
    
    // Close dropdown when clicking outside
    const handleClick = (e) => {
      if (selectRef.current && !selectRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [isOpen]);
  
  const selectedOption = options.find(opt => opt.value === value) || options[0];
  
  return (
    <div ref={selectRef} className="relative inline-block w-full">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className={className}
        {...props}
      >
        {renderSelected ? renderSelected(selectedOption) : (selectedOption?.label || 'Select...')}
      </button>
      
      {isOpen && (
        <div 
          className={isMobile 
            ? "fixed left-0 right-0 bottom-0 z-[9999] bg-st-bg border-t-2 border-st-orange shadow-2xl max-h-[50vh] overflow-y-auto animate-slide-up"
            : "absolute left-0 right-0 top-full mt-1 z-[9999] bg-st-bg border border-st-border rounded shadow-2xl max-h-[300px] overflow-y-auto"
          }
          style={isMobile ? {
            animation: 'slideUp 0.2s ease-out'
          } : {}}
        >
          {options.map((opt, i) => (
            <button
              key={opt.value || i}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange({ target: { value: opt.value } });
                setIsOpen(false);
              }}
              className={`w-full text-left px-4 py-3 border-b border-st-border hover:bg-st-secondary transition-colors ${
                opt.value === value ? 'bg-st-orange/20 text-st-orange font-bold' : 'text-st-text'
              }`}
            >
              {renderOption ? renderOption(opt) : opt.label}
            </button>
          ))}
        </div>
      )}
      
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/40 z-[9998]"
          onClick={() => setIsOpen(false)}
        />
      )}
      
      <style jsx="true">{`
        @keyframes slideUp {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
