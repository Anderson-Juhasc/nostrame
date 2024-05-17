#!/usr/bin/env node

import * as esbuild from 'esbuild'
import * as fs from 'fs'
import * as path from 'path'
import * as sass from 'sass'
import * as chokidar from 'chokidar'

const prod = process.argv.indexOf('prod') !== -1

function buildSass() {
  const sassEntryFile = './extension/assets/css/style.scss';  // Your main Sass file
  const cssOutputFile = './extension/assets/css/style.build.css'; // Output CSS file

  const result = sass.renderSync({
    file: sassEntryFile,
    outFile: cssOutputFile,
    sourceMap: true,
    outputStyle: 'compressed',
  })

  fs.mkdirSync(path.dirname(cssOutputFile), { recursive: true })
  fs.writeFileSync(cssOutputFile, result.css)
  if (result.map) {
    fs.writeFileSync(`${cssOutputFile}.map`, result.map)
  }

  console.log('Sass compiled successfully')
}

// Build Sass initially
buildSass()

// Watch for changes in Sass files
chokidar.watch('./extension/assets/css/*.scss').on('change', (event) => {
  console.log(`File ${event} has been changed`)
  buildSass()
});

function buildEsbuild() {
  esbuild
    .build({
      bundle: true,
      entryPoints: {
        'popup.build': './extension/popup.jsx',
        //'prompt.build': './extension/prompt.jsx',
        'options.build': './extension/options.jsx',
        'background.build': './extension/background.js',
        //'content-script.build': './extension/content-script.js'
      },
      outdir: './extension',
      sourcemap: prod ? false : 'inline',
      define: {
        window: 'self',
        global: 'self'
      }
    })
    .then(() => console.log('Build success.'))
}

// Build esbuild and watch for changes
buildEsbuild()

// Watch for changes in Sass files
chokidar.watch('./extension/**/*.{jsx,jsx}').on('change', (event) => {
  console.log(`File ${event} has been changed`)
  buildEsbuild()
});
