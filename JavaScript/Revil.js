// =====================================
// RevilDynamicCSS.js - Dynamic Utility Styles
// =====================================

class RevilDynamicCSS {
  static cssMap = {
    w: 'width', h: 'height', wx: 'max-width', wn: 'min-width', hx: 'max-height', hn: 'min-height',
    gap: 'gap', pd: 'padding', mg: 'margin', bc: 'background-color', cl: 'color', fs: 'font-size',
    bd: 'border', rd: 'border-radius', op: 'opacity'
  };
  static regex = /([a-z]+)-\[([^\]]+)\]/i;
  static processed = new WeakSet();

  static apply(root = document) {
    const els = root === document ? root.querySelectorAll('*') : [root, ...root.querySelectorAll('*')];
    els.forEach(el => {
      if (this.processed.has(el)) return;
      this.processed.add(el);
      [...el.classList].filter(c => this.regex.test(c)).forEach(cls => {
        const [, prop, val] = cls.match(this.regex);
        const cssProp = this.cssMap[prop];
        if (cssProp) {
          const value = val.startsWith('var') || val.startsWith('#') || /^[a-z]+$/i.test(val) ? val : val.replace(/_/g, ' ');
          el.style[cssProp] = value;
          el.classList.remove(cls);
          if (prop === 'cl') el.querySelectorAll('*').forEach(c => c.style.color ||= value);
        }
      });
    });
    setTimeout(() => this.processed = new WeakSet(), 0);
  }

  static transferClasses(from, to) {
    if (!from || !to) return;
    [...from.classList].filter(c => this.regex.test(c)).forEach(c => to.classList.add(c));
    this.apply(to);
  }
}

window.RevilDynamicCSS = RevilDynamicCSS;
document.addEventListener('DOMContentLoaded', () => {
  RevilDynamicCSS.apply();
  document.body.removeAttribute('unresolved');
});

new MutationObserver(mutations => 
  mutations.forEach(m => {
    if (m.type === 'childList') {
      m.addedNodes.forEach(n => n.nodeType === 1 && RevilDynamicCSS.apply(n));
      if (m.removedNodes.length && m.addedNodes.length) {
        const [removed, added] = [m.removedNodes[0], m.addedNodes[0]];
        if (removed?.nodeType === 1 && added?.nodeType === 1 && 
            [...removed.classList||[]].some(c => RevilDynamicCSS.regex.test(c))) {
          RevilDynamicCSS.transferClasses(removed, added);
        }
      }
    }
    if (m.type === 'attributes' && m.attributeName === 'class') RevilDynamicCSS.apply(m.target);
  })
).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

new MutationObserver(mutations => 
  mutations.forEach(m => m.type === 'childList' && m.addedNodes.forEach(n => {
    if (n.nodeType === 1 && n.tagName === 'SVG' && 
        (n.classList.contains('svg-inline--fa') || n.hasAttribute('data-prefix') || n.hasAttribute('data-icon'))) {
      const parent = n.parentElement;
      if (parent) [...parent.children].forEach(el => 
        el !== n && [...el.classList||[]].some(c => RevilDynamicCSS.regex.test(c)) && RevilDynamicCSS.apply(el)
      );
      RevilDynamicCSS.apply(n);
    }
  }))
).observe(document.body, { childList: true, subtree: true });

export { RevilDynamicCSS };