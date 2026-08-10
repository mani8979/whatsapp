import readline from 'readline';

/**
 * Draws a clean terminal ASCII progress bar.
 * @param {number} current Current progress value
 * @param {number} total Total target value
 * @param {string} statusText Text showing status next to the progress bar
 * @param {boolean} [silent=false] If true, suppress all output
 */
export function drawProgressBar(current, total, statusText = '', silent = false) {
  if (silent) return;

  const percentage = total > 0 ? Math.min(100, Math.floor((current / total) * 100)) : 0;
  const barLength = 30;
  const filledLength = Math.round((percentage / 100) * barLength);
  const emptyLength = barLength - filledLength;
  const bar = '█'.repeat(filledLength) + '░'.repeat(emptyLength);

  const outputString = `\r[${bar}] ${percentage}% | ${current}/${total} | ${statusText}`;
  
  // Pad with spaces to clear any previously printed text on the line
  const terminalWidth = process.stdout.columns || 80;
  const paddingLength = Math.max(0, terminalWidth - outputString.length);
  const paddedOutput = outputString + ' '.repeat(paddingLength);

  process.stdout.write(paddedOutput);

  // Print a newline at completion
  if (current >= total && total > 0) {
    process.stdout.write('\n');
  }
}
