// Build a unique-ish CSS-ish path for each element
function getDomPath(el) {
  let path = '';
  while (el && el.nodeType === Node.ELEMENT_NODE) {
    let name = el.tagName.toLowerCase();

    if (el.id) {
      name += '#' + el.id;
      path = name + (path ? '>' + path : '');
      break; // id is unique, good enough
    } else {
      // nth-of-type index among siblings of same tag
      let idx = 1;
      let sib = el;
      while ((sib = sib.previousElementSibling)) {
        if (sib.tagName === el.tagName) idx++;
      }
      name += `:nth-of-type(${idx})`;
    }

    path = name + (path ? '>' + path : '');
    el = el.parentElement;
  }
  return path || null;
}

// Full-DOM snapshot (but summarized per element)
function snapshotWholeDom() {
  return Array.from(document.querySelectorAll('*')).map(el => {
    let value = undefined;
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') {
      value = el.value;
    }

    let text = undefined;
    if (el.tagName === 'OPTION' || el.tagName === 'BUTTON' || el.tagName === 'SPAN' || el.tagName === 'A') {
      const t = el.textContent.trim();
      if (t) text = t;
    }

    return {
      path: getDomPath(el),
      tag: el.tagName,
      id: el.id,
      name: el.name,
      type: el.type,
      class: el.className,
      value,
      text
    };
  });
}

/*

window._domBefore = snapshotWholeDom();
console.log("BEFORE element count:", window._domBefore.length);

window._domAfter = snapshotWholeDom();
console.log("AFTER element count:", window._domAfter.length);

const beforeMap = new Map(
  (window._domBefore || []).map(n => [n.path, n])
);

const domDiffs = (window._domAfter || []).filter(n => {
  const prev = beforeMap.get(n.path);
  if (!prev) {
    // new element added
    return true;
  }
  // any changed form value or visible text
  return prev.value !== n.value || prev.text !== n.text;
});

console.log("Changed/new elements:", domDiffs);



*/