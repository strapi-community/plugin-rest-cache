/**
 * Render a millisecond duration as something a human can check at a glance.
 *
 * maxAge is milliseconds throughout this plugin, and showing the raw number is
 * how a misconfiguration hides: 3600000 and 3600 look equally plausible in a
 * table, but one is an hour and the other is 3.6 seconds. Confusing those two
 * units is exactly the bug behind #126.
 */
export const formatDuration = (milliseconds?: number): string => {
  if (milliseconds === undefined || milliseconds === null || Number.isNaN(milliseconds)) {
    return '-';
  }

  if (milliseconds < 1000) {
    return `${milliseconds}ms`;
  }

  const units: Array<[label: string, size: number]> = [
    ['d', 86400000],
    ['h', 3600000],
    ['m', 60000],
    ['s', 1000],
  ];

  const parts: string[] = [];
  let remaining = milliseconds;

  for (const [label, size] of units) {
    const count = Math.floor(remaining / size);

    if (count > 0) {
      parts.push(`${count}${label}`);
      remaining -= count * size;
    }

    // Two units is enough to be unambiguous; "1d 2h" beats "1d 2h 3m 4s".
    if (parts.length === 2) {
      break;
    }
  }

  return parts.join(' ');
};
