// public/arabicFontDetector.js
import { applyArabicFont, observeArabicFontChanges } from '../components/arabicFontApplier.js';

const arabicFontClassName = 'font-arabic'; // Define the class name once

// Apply Arabic font to existing elements on initial page load
document.addEventListener('DOMContentLoaded', () => {
  applyArabicFont(document.body, arabicFontClassName);
});

// Observe future DOM changes and apply Arabic font to newly added elements
observeArabicFontChanges(arabicFontClassName);

// Initial run for elements that might be loaded before DOMContentLoaded or for immediate application
applyArabicFont(document.body, arabicFontClassName);
