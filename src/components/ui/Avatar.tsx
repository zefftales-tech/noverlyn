import React from 'react'

export interface AvatarProps {
  name: string
  url?: string | null
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export const Avatar: React.FC<AvatarProps> = ({
  name,
  url,
  size = 'md',
  className = '',
}) => {
  const getInitials = (str: string) => {
    if (!str) return 'U'
    const parts = str.trim().split(/\s+/)
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    }
    return str.slice(0, 2).toUpperCase()
  }

  const sizes = {
    sm: 'w-7 h-7 text-xs',
    md: 'w-9 h-9 text-sm',
    lg: 'w-11 h-11 text-base',
  }

  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className={`rounded-full object-cover border border-surface-border ${sizes[size]} ${className}`}
      />
    )
  }

  return (
    <div
      className={`rounded-full bg-navy-900 text-white font-semibold flex items-center justify-center border border-navy-800 shrink-0 ${sizes[size]} ${className}`}
    >
      {getInitials(name)}
    </div>
  )
}
