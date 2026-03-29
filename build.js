#!/usr/bin/env node
/* ============================================================
   GEO Spy – Build Script
   Minifies HTML, CSS, JS and copies to dist/
   ============================================================ */

const fs = require('fs');
const path = require('path');
const { minify: minifyHTML } = require('html-minifier-terser');
const CleanCSS = require('clean-css');
const { minify: minifyJS } = require('terser');

const SRC = __dirname;
const DIST = path.join(__dirname, 'dist');

// Clean & create dist
if (fs.existsSync(DIST)) fs.rmSync(DIST, { recursive: true });
fs.mkdirSync(DIST, { recursive: true });
fs.mkdirSync(path.join(DIST, 'css'), { recursive: true });
fs.mkdirSync(path.join(DIST, 'js'), { recursive: true });
fs.mkdirSync(path.join(DIST, 'assets'), { recursive: true });

async function build() {
  console.log('Building GEO Spy...');

  // Minify CSS
  const cssInput = fs.readFileSync(path.join(SRC, 'css/style.css'), 'utf8');
  const cssOutput = new CleanCSS({ level: 2 }).minify(cssInput);
  fs.writeFileSync(path.join(DIST, 'css/style.css'), cssOutput.styles);
  console.log(`  CSS: ${cssInput.length} → ${cssOutput.styles.length} bytes`);

  // Minify JS files
  for (const jsFile of ['api.js', 'map.js', 'app.js']) {
    const jsInput = fs.readFileSync(path.join(SRC, 'js', jsFile), 'utf8');
    const jsOutput = await minifyJS(jsInput, {
      compress: { passes: 2, drop_console: false },
      mangle: true,
      format: { comments: false }
    });
    fs.writeFileSync(path.join(DIST, 'js', jsFile), jsOutput.code);
    console.log(`  JS ${jsFile}: ${jsInput.length} → ${jsOutput.code.length} bytes`);
  }

  // Minify Service Worker
  const swInput = fs.readFileSync(path.join(SRC, 'sw.js'), 'utf8');
  const swOutput = await minifyJS(swInput, { compress: true, mangle: true });
  fs.writeFileSync(path.join(DIST, 'sw.js'), swOutput.code);
  console.log(`  SW: ${swInput.length} → ${swOutput.code.length} bytes`);

  // Minify HTML
  const htmlInput = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
  const htmlOutput = await minifyHTML(htmlInput, {
    collapseWhitespace: true,
    removeComments: true,
    removeRedundantAttributes: true,
    removeEmptyAttributes: true,
    minifyCSS: true,
    minifyJS: true
  });
  fs.writeFileSync(path.join(DIST, 'index.html'), htmlOutput);
  console.log(`  HTML: ${htmlInput.length} → ${htmlOutput.length} bytes`);

  // Copy manifest
  fs.copyFileSync(path.join(SRC, 'manifest.json'), path.join(DIST, 'manifest.json'));

  // Generate PWA icons (simple SVG-based PNG placeholders)
  const iconSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
    <rect width="512" height="512" rx="96" fill="#0a0e1a"/>
    <text x="256" y="340" text-anchor="middle" font-size="280" font-family="sans-serif">🌍</text>
    <text x="256" y="460" text-anchor="middle" font-size="72" font-weight="bold" fill="#3b82f6" font-family="sans-serif">GEO</text>
  </svg>`;
  // For GitHub Pages, SVG icons work with modern browsers
  fs.writeFileSync(path.join(DIST, 'assets/icon-192.png'), iconSVG);
  fs.writeFileSync(path.join(DIST, 'assets/icon-512.png'), iconSVG);

  // Create robots.txt
  fs.writeFileSync(path.join(DIST, 'robots.txt'), 'User-agent: *\nAllow: /\nSitemap: /sitemap.xml\n');

  console.log('Build complete! Output in dist/');
}

build().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
