const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const scssFile = path.join(__dirname, '..', 'public', 'styles', 'main.scss');
const cssFile = path.join(__dirname, '..', 'public', 'styles', 'main.css');

let compileNeeded = true;

if (fs.existsSync(cssFile) && fs.existsSync(scssFile)) {
  const scssMtime = fs.statSync(scssFile).mtimeMs;
  const cssMtime = fs.statSync(cssFile).mtimeMs;
  if (scssMtime <= cssMtime) {
    compileNeeded = false;
  }
}

if (compileNeeded) {
  console.log('[Build] CSS changed or missing. Compiling main.scss...');
  const t0 = Date.now();
  try {
    execSync(`sass "${scssFile}" "${cssFile}"`, { stdio: 'inherit' });
    console.log(`[Build] Sass compilation completed in ${Date.now() - t0}ms`);
  } catch (err) {
    console.error('[Build] Sass compilation failed:', err.message);
  }
} else {
  // SASS unchanged, skipping compile!
}
