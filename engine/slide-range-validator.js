/**
 * Validate slide range input against deck slide count.
 * @returns {{ valid: boolean, errors: string[], slideNumbers: number[] }}
 */
export function validateSlideRanges(input, maxSlides) {
  const errors = [];
  const slideNumbers = new Set();
  const tokens = input.split(",").map((part) => part.trim()).filter(Boolean);

  if (!maxSlides || maxSlides < 1) {
    if (tokens.length) errors.push("Upload a deck first to set slide ranges.");
    return { valid: errors.length === 0, errors, slideNumbers: [] };
  }

  for (const token of tokens) {
    const range = token.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (!Number.isInteger(start) || !Number.isInteger(end)) {
        errors.push(`"${token}" is not a valid range.`);
        continue;
      }
      if (start < 1 || end < 1) {
        errors.push(`Slide numbers must be 1 or greater (in "${token}").`);
        continue;
      }
      const low = Math.min(start, end);
      const high = Math.max(start, end);
      let inRange = false;
      for (let value = low; value <= high; value += 1) {
        if (value <= maxSlides) {
          slideNumbers.add(value);
          inRange = true;
        }
      }
      if (!inRange) {
        errors.push(`"${token}" is outside this deck (1–${maxSlides}).`);
      } else if (high > maxSlides) {
        errors.push(`"${token}" exceeds slide count (${maxSlides}); only in-range slides will be removed.`);
      }
      continue;
    }

    const single = Number(token);
    if (!Number.isInteger(single) || single < 1) {
      errors.push(`"${token}" is not a valid slide number.`);
      continue;
    }
    if (single > maxSlides) {
      errors.push(`Slide ${single} does not exist (deck has ${maxSlides} slides).`);
      continue;
    }
    slideNumbers.add(single);
  }

  return {
    valid: errors.length === 0,
    errors,
    slideNumbers: Array.from(slideNumbers).sort((a, b) => a - b)
  };
}
