import React, { useId } from 'react'

export interface NoverlynLogoProps {
  variant?: 'dark' | 'light' | 'mark'
  size?: 'sm' | 'md' | 'lg'
  sublabel?: string
  showWordmark?: boolean
  className?: string
}

export const NoverlynLogo: React.FC<NoverlynLogoProps> = ({
  variant = 'dark',
  size = 'md',
  sublabel,
  showWordmark = true,
  className = '',
}) => {
  const uid = useId().replace(/:/g, '')

  const markDimensions = {
    sm: 28,
    md: 34,
    lg: 42,
  }

  const wordmarkStyles = {
    sm: 'text-[17px]',
    md: 'text-[19px]',
    lg: 'text-[25px]',
  }

  const markSizePx = markDimensions[size] || 34
  const isLight = variant === 'light'
  const isMarkOnly = variant === 'mark' || !showWordmark

  const grad1Id = `noverlyn-grad1-${uid}`
  const grad2Id = `noverlyn-grad2-${uid}`
  const grad3Id = `noverlyn-grad3-${uid}`
  const highlightId = `noverlyn-hl-${uid}`

  return (
    <div className={`inline-flex items-center gap-2.5 select-none shrink-0 ${className}`}>
      {/* Precision Master Folded Ribbon 'N' Symbol */}
      <div
        style={{ width: `${markSizePx}px`, height: `${markSizePx}px` }}
        className="shrink-0 flex items-center justify-center relative"
      >
        <svg
          viewBox="0 0 40 40"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full block object-contain"
        >
          {/* Subtle background container */}
          <rect width="40" height="40" rx="9" fill={isLight ? '#0F172A' : '#1E293B'} />
          
          {/* Left Ribbon Stem */}
          <path d="M8.5 32V8H14.5V32H8.5Z" fill={`url(#${grad1Id})`} />
          
          {/* Center Diagonal Ribbon Fold */}
          <path d="M8.5 8H14.5L31.5 32H25.5L8.5 8Z" fill={`url(#${grad2Id})`} />
          
          {/* Right Ribbon Stem */}
          <path d="M25.5 32V8H31.5V32H25.5Z" fill={`url(#${grad3Id})`} />
          
          {/* Dimensional Highlight Overlay */}
          <path d="M14.5 8L31.5 32H25.5L14.5 16.5V8Z" fill={`url(#${highlightId})`} opacity="0.4" />

          <defs>
            <linearGradient id={grad1Id} x1="8.5" y1="8" x2="14.5" y2="32" gradientUnits="userSpaceOnUse">
              <stop stopColor="#3B82F6" />
              <stop offset="1" stopColor="#1D4ED8" />
            </linearGradient>
            <linearGradient id={grad2Id} x1="8.5" y1="8" x2="31.5" y2="32" gradientUnits="userSpaceOnUse">
              <stop stopColor="#38BDF8" />
              <stop offset="1" stopColor="#2563EB" />
            </linearGradient>
            <linearGradient id={grad3Id} x1="25.5" y1="8" x2="31.5" y2="32" gradientUnits="userSpaceOnUse">
              <stop stopColor="#2563EB" />
              <stop offset="1" stopColor="#1E40AF" />
            </linearGradient>
            <linearGradient id={highlightId} x1="14.5" y1="8" x2="31.5" y2="32" gradientUnits="userSpaceOnUse">
              <stop stopColor="#FFFFFF" />
              <stop offset="1" stopColor="#38BDF8" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* Wordmark & Dynamic Workspace Sublabel */}
      {!isMarkOnly && (
        <div className="flex flex-col justify-center leading-tight shrink-0 min-w-0">
          <span className={`font-heading font-bold tracking-tight ${wordmarkStyles[size]} ${isLight ? 'text-navy-900' : 'text-white'}`}>
            Noverlyn
          </span>
          {sublabel && (
            <span className={`text-[10px] font-semibold tracking-wider uppercase truncate max-w-[120px] ${isLight ? 'text-content-secondary' : 'text-slate-400'}`}>
              {sublabel}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
