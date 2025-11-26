// components/arabicFontApplier.js

/**
 * Checks if a given string contains Arabic characters.
 * @param {string} text - The text to check.
 * @returns {boolean} - True if Arabic characters are found, false otherwise.
 */
export function containsArabic(text) {
  // Unicode range for Arabic characters
  // \u0600-\u06FF : Arabic
  // \u0750-\u077F : Arabic Supplement
  // \u08A0-\u08FF : Arabic Extended-A
  // \uFB50-\uFDFF : Arabic Presentation Forms-A
  // \uFE70-\uFEFF : Arabic Presentation Forms-B
  const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
  return arabicRegex.test(text);
}

/**
 * Applies a CSS class to an element if its text content contains Arabic characters.
 * @param {HTMLElement} element - The DOM element to process.
 * @param {string} className - The CSS class to apply for Arabic text.
 */
export function applyArabicFont(element, className = 'font-arabic') {
  if (element.children.length === 0 && element.textContent && containsArabic(element.textContent)) {
    element.classList.add(className);
  } else {
    Array.from(element.children).forEach(child => {
      applyArabicFont(child, className);
    });
  }
}

/**
 * Observes the DOM for changes and applies Arabic font styles to newly added elements.
 * @param {string} className - The CSS class to apply for Arabic text.
 */
export function observeArabicFontChanges(className = 'font-arabic') {
  const observer = new MutationObserver((mutationsList) => {
    for (const mutation of mutationsList) {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            applyArabicFont(node, className);
          }
        });
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}
