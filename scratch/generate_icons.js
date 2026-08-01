import fs from 'fs'
import path from 'path'

// Minimal 1x1 or valid PNG generator with Noverlyn theme color background and SVG icon marker
const iconsDir = path.join(process.cwd(), 'public', 'icons')
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true })
}

// Copy favicon.svg to public/icons/pwa-512x512.svg for vector resolution
const svgContent = fs.readFileSync(path.join(process.cwd(), 'public', 'favicon.svg'))
fs.writeFileSync(path.join(iconsDir, 'pwa-icon.svg'), svgContent)
fs.writeFileSync(path.join(process.cwd(), 'public', 'apple-touch-icon.svg'), svgContent)

console.log('PWA SVG icons created in public/icons/')
