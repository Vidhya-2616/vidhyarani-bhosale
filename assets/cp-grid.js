/* ==========================================================
   CP Grid: quick-view popup (vanilla JS, no dependencies)
   - Click on a + icon opens the popup for that product.
   - Product data is read from the JSON block inside the popup
     markup (rendered by sections/cp-grid.liquid).
   - Text labels read from data attributes on .cp-pop. On mobile
     (max-width 749px) the data-m-* version is used.
   ========================================================== */
(function () {
  if (window.__cpGridInit) return;
  window.__cpGridInit = true;

  var MQ = window.matchMedia('(max-width: 749px)');
  var S = null; // state of the popup that is currently open

  /* Color names to CSS colors, used when the product option has no
     native Shopify swatch color. Anything not listed is tried as a
     CSS color, and falls back to light gray. */
  var NAMED = {
    white: '#ffffff', black: '#000000', blue: '#1f4ea1', navy: '#14213d',
    red: '#c8102e', grey: '#8a8a8a', gray: '#8a8a8a', green: '#2e7d32',
    olive: '#6b7035', yellow: '#f2c230', orange: '#ec7a1c', pink: '#e8a2b5',
    purple: '#6a3d9a', brown: '#7a5230', beige: '#d9c7a3', cream: '#f3ead2',
    tan: '#c8a77b', khaki: '#b8a974', burgundy: '#6d1a2a', maroon: '#6d1a2a',
    teal: '#1a7f86', silver: '#c0c0c0', gold: '#c9a227', ivory: '#fffff0'
  };

  /* ---------- helpers ---------- */
  function root() {
    return (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || '/';
  }

  function decode(str) {
    var t = document.createElement('textarea');
    t.innerHTML = str || '';
    return t.value;
  }

  function label(pop, key, fallback) {
    var k = MQ.matches ? 'm' + key.charAt(0).toUpperCase() + key.slice(1) : key;
    return pop.dataset[k] || pop.dataset[key] || fallback || '';
  }

  function swatchColor(val) {
    if (val.swatch) return val.swatch;
    var key = String(val.name).toLowerCase().replace(/[^a-z]/g, '');
    if (NAMED[key]) return NAMED[key];
    if (window.CSS && CSS.supports) {
      if (CSS.supports('color', val.name)) return val.name;
      if (CSS.supports('color', key)) return key;
    }
    return '#cccccc';
  }

  function getData(pop) {
    if (!pop._cpData) {
      var el = pop.querySelector('[data-cp-pop-data]');
      try {
        pop._cpData = el ? JSON.parse(el.textContent) : {};
      } catch (err) {
        pop._cpData = {};
      }
    }
    return pop._cpData;
  }

  var scrollLock = null;
  function lockScroll() {
    if (scrollLock) return;
    var docEl = document.documentElement;
    var sw = window.innerWidth - docEl.clientWidth;
    scrollLock = { overflow: docEl.style.overflow, padding: document.body.style.paddingRight };
    docEl.style.overflow = 'hidden';
    if (sw > 0) document.body.style.paddingRight = sw + 'px';
  }
  function unlockScroll() {
    if (!scrollLock) return;
    document.documentElement.style.overflow = scrollLock.overflow;
    document.body.style.paddingRight = scrollLock.padding;
    scrollLock = null;
  }

  /* ---------- open / close ---------- */
  function open(trigger) {
    var section = trigger.closest('.cp-grid');
    var pop = section && section.querySelector('[data-cp-pop]');
    if (!pop) return;
    var product = getData(pop)[trigger.dataset.productHandle];
    if (!product) return;

    if (S) closeNow();
    clearTimeout(pop._cpTimer);

    S = {
      pop: pop,
      product: product,
      trigger: trigger,
      color: null,
      size: null,
      listOpen: false,
      addTimer: null,
      el: {
        card: pop.querySelector('.cp-pop__card'),
        img: pop.querySelector('[data-cp-pop-img]'),
        title: pop.querySelector('[data-cp-pop-title]'),
        price: pop.querySelector('[data-cp-pop-price]'),
        desc: pop.querySelector('[data-cp-pop-desc]'),
        colorField: pop.querySelector('[data-cp-pop-color-field]'),
        colors: pop.querySelector('[data-cp-pop-colors]'),
        slider: pop.querySelector('[data-cp-pop-slider]'),
        sizeField: pop.querySelector('[data-cp-pop-size-field]'),
        sizeBtn: pop.querySelector('[data-cp-pop-size-btn]'),
        sizeText: pop.querySelector('[data-cp-pop-size-text]'),
        list: pop.querySelector('[data-cp-pop-list]'),
        msg: pop.querySelector('[data-cp-pop-msg]'),
        add: pop.querySelector('[data-cp-pop-add]'),
        addText: pop.querySelector('[data-cp-pop-add-text]')
      }
    };

    var names = product.options.map(function (o) { return o.name; });
    S.ci = indexOfName(names, /colou?r/i);
    S.si = indexOfName(names, /size/i);

    // Product with a size option but no color option still works (and the other way round).
    if (S.ci >= 0) {
      var vals = product.options[S.ci].values;
      var firstAvail = null;
      for (var i = 0; i < vals.length && !firstAvail; i++) {
        if (variantsFor(vals[i].name).some(function (v) { return v.available; })) firstAvail = vals[i].name;
      }
      S.color = firstAvail || (vals[0] && vals[0].name) || null;
      renderColors();
    }

    S.el.colorField.hidden = S.ci < 0;
    S.el.sizeField.hidden = S.si < 0;

    S.el.title.textContent = product.title;
    S.el.desc.textContent = decode(product.desc);
    S.el.desc.hidden = !product.desc;

    pop.hidden = false;
    pop.removeAttribute('aria-hidden');
    lockScroll();
    refresh(true);

    void pop.offsetWidth; // make sure the start state is painted before animating
    pop.classList.add('is-open');
    S.el.card.focus({ preventScroll: true });
  }

  function indexOfName(names, re) {
    for (var i = 0; i < names.length; i++) if (re.test(names[i])) return i;
    return -1;
  }

  function animMs(pop) {
    return parseFloat(getComputedStyle(pop).getPropertyValue('--cp-pop-anim')) || 0;
  }

  function finish(pop) {
    if (S && S.pop === pop) return; // reopened in the meantime
    pop.hidden = true;
    pop.setAttribute('aria-hidden', 'true');
  }

  function close() {
    if (!S) return;
    var s = S;
    clearTimeout(s.addTimer);
    s.pop.classList.remove('is-open');
    closeList();
    unlockScroll();
    S = null;
    var ms = animMs(s.pop);
    clearTimeout(s.pop._cpTimer);
    s.pop._cpTimer = setTimeout(function () { finish(s.pop); }, ms + 20);
    if (s.trigger && document.body.contains(s.trigger)) s.trigger.focus({ preventScroll: true });
  }

  function closeNow() {
    if (!S) return;
    var s = S;
    clearTimeout(s.addTimer);
    s.pop.classList.remove('is-open');
    s.pop.hidden = true;
    s.pop.setAttribute('aria-hidden', 'true');
    unlockScroll();
    S = null;
  }

  /* ---------- variants ---------- */
  function variantsFor(color) {
    return S.product.variants.filter(function (v) {
      return S.ci < 0 || v.o[S.ci] === color;
    });
  }

  function sizesFor(color) {
    var vs = variantsFor(color);
    var out = [];
    S.product.options[S.si].values.forEach(function (val) {
      var m = vs.filter(function (v) { return v.o[S.si] === val.name; });
      if (m.length) {
        out.push({ name: val.name, available: m.some(function (v) { return v.available; }) });
      }
    });
    return out;
  }

  function findVariant() {
    var list = S.product.variants;
    for (var i = 0; i < list.length; i++) {
      var v = list[i];
      if ((S.ci < 0 || v.o[S.ci] === S.color) && (S.si < 0 || v.o[S.si] === S.size)) return v;
    }
    return null;
  }

  /* ---------- rendering ---------- */
  function renderColors() {
    var wrap = S.el.colors;
    Array.prototype.slice.call(wrap.querySelectorAll('.cp-pop__opt')).forEach(function (n) { n.remove(); });
    S.product.options[S.ci].values.forEach(function (val) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'cp-pop__opt';
      b.setAttribute('role', 'radio');
      b.dataset.value = val.name;
      var bar = document.createElement('span');
      bar.className = 'cp-pop__bar';
      bar.style.background = swatchColor(val);
      var t = document.createElement('span');
      t.className = 'cp-pop__opt-text';
      t.textContent = val.name;
      b.appendChild(bar);
      b.appendChild(t);
      wrap.appendChild(b);
    });
  }

  function syncColors() {
    Array.prototype.forEach.call(S.el.colors.querySelectorAll('.cp-pop__opt'), function (b) {
      var on = b.dataset.value === S.color;
      b.classList.toggle('is-selected', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  }

  function moveSlider(instant) {
    var sl = S.el.slider;
    var sel = S.el.colors.querySelector('.cp-pop__opt.is-selected');
    if (!sel) {
      sl.style.opacity = '0';
      return;
    }
    if (instant) sl.style.transition = 'none';
    sl.style.width = sel.offsetWidth + 'px';
    sl.style.height = sel.offsetHeight + 'px';
    sl.style.transform = 'translate(' + sel.offsetLeft + 'px,' + sel.offsetTop + 'px)';
    sl.style.opacity = '1';
    if (instant) {
      void sl.offsetWidth;
      sl.style.transition = '';
    }
  }

  function renderSizes() {
    if (S.si < 0) return;
    var list = S.el.list;
    list.innerHTML = '';
    sizesFor(S.color).forEach(function (sz) {
      var li = document.createElement('li');
      li.setAttribute('role', 'presentation');
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'cp-pop__li';
      b.setAttribute('role', 'option');
      b.dataset.value = sz.name;
      b.textContent = sz.name;
      b.setAttribute('aria-selected', sz.name === S.size ? 'true' : 'false');
      if (sz.name === S.size) b.classList.add('is-selected');
      if (!sz.available) {
        b.disabled = true;
        b.setAttribute('aria-disabled', 'true');
        b.classList.add('is-soldout');
      }
      li.appendChild(b);
      list.appendChild(li);
    });
    S.el.sizeText.textContent = S.size || label(S.pop, 'sizePlaceholder', 'Choose your size');
    S.el.sizeBtn.classList.toggle('has-value', !!S.size);
  }

  function renderMedia() {
    var color = S.color;
    var src = '';
    var vs = variantsFor(color);
    for (var i = 0; i < vs.length && !src; i++) if (vs[i].img) src = vs[i].img;
    src = src || S.product.image || '';
    if (src) {
      if (S.el.img.getAttribute('src') !== src) S.el.img.src = src;
      S.el.img.alt = S.product.imageAlt || S.product.title;
      S.el.img.hidden = false;
    } else {
      S.el.img.removeAttribute('src');
      S.el.img.hidden = true;
    }
  }

  function renderPrice() {
    var v = findVariant();
    if (!v) {
      var vs = variantsFor(S.color);
      v = vs.filter(function (x) { return x.available; })[0] || vs[0] || S.product.variants[0];
    }
    S.el.price.textContent = v ? v.price : S.product.price;
  }

  function renderAdd() {
    var v = findVariant();
    var needsSize = S.si >= 0 && !S.size;
    var soldOut = !!v && !v.available;
    S.el.add.disabled = soldOut && !needsSize;
    S.el.add.setAttribute('aria-disabled', S.el.add.disabled ? 'true' : 'false');
    if (!S.added) S.el.addText.textContent = label(S.pop, 'addLabel', 'Add to cart');
  }

  function refresh(instantSlider) {
    syncColors();
    renderSizes();
    renderMedia();
    renderPrice();
    renderAdd();
    moveSlider(instantSlider);
  }

  function showMsg(text) {
    S.el.msg.textContent = text || '';
    S.el.msg.classList.toggle('is-visible', !!text);
  }

  /* ---------- size list ---------- */
  function openList() {
    if (!S || S.si < 0) return;
    S.listOpen = true;
    S.el.list.hidden = false;
    S.el.sizeBtn.setAttribute('aria-expanded', 'true');
    S.el.sizeBtn.classList.add('is-open');
  }

  function closeList() {
    if (!S || !S.listOpen) return;
    S.listOpen = false;
    S.el.list.hidden = true;
    S.el.sizeBtn.setAttribute('aria-expanded', 'false');
    S.el.sizeBtn.classList.remove('is-open');
  }

  function enabledOptions() {
    return Array.prototype.slice.call(S.el.list.querySelectorAll('.cp-pop__li:not(:disabled)'));
  }

  function focusOption(step) {
    var opts = enabledOptions();
    if (!opts.length) return;
    var i = opts.indexOf(document.activeElement);
    var next = i < 0 ? (step > 0 ? 0 : opts.length - 1) : (i + step + opts.length) % opts.length;
    opts[next].focus();
    opts[next].scrollIntoView({ block: 'nearest' });
  }

  function chooseSize(value) {
    S.size = value;
    showMsg('');
    resetAdded();
    closeList();
    refresh();
    S.el.sizeBtn.focus({ preventScroll: true });
  }

  function chooseColor(value) {
    if (value === S.color) return;
    S.color = value;
    var stillThere = S.si >= 0 && sizesFor(S.color).some(function (z) { return z.name === S.size && z.available; });
    if (!stillThere) S.size = null;
    showMsg('');
    resetAdded();
    closeList();
    refresh();
  }

  /* ---------- add to cart ---------- */
  function resetAdded() {
    clearTimeout(S.addTimer);
    S.added = false;
    S.el.add.classList.remove('is-added');
    S.el.addText.textContent = label(S.pop, 'addLabel', 'Add to cart');
  }

  function addToCart() {
    if (!S || S.el.add.disabled || S.busy) return;
    var v = findVariant();
    if (!v || (S.si >= 0 && !S.size)) {
      showMsg(label(S.pop, 'sizeError', 'Please choose your size'));
      openList();
      return;
    }
    if (!v.available) return;

    var s = S;
    s.busy = true;
    s.el.add.setAttribute('aria-busy', 'true');
    showMsg('');

    var wantsGift = qualifiesForGift(s.pop, v);

    giftVariantId(s.pop)
      .then(function (gid) {
        var items = [{ id: v.id, quantity: 1 }];
        if (wantsGift && gid && gid !== v.id) {
          items.push({ id: gid, quantity: 1 }); // gift with purchase
        } else if (wantsGift) {
          console.warn('[cp-grid] Black + Medium matched, but no gift product is available. Check "Gift with purchase" settings.');
        }
        var body = { items: items };
        if (document.getElementById('cart-icon-bubble')) {
          body.sections = 'cart-icon-bubble';
          body.sections_url = window.location.pathname;
        }
        return fetch(root() + 'cart/add.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(body)
        });
      })
      .then(function (r) {
        return r.json().then(function (data) {
          if (!r.ok) throw new Error(data.description || data.message || 'Could not add to cart');
          return data;
        });
      })
      .then(function (data) {
        var cartReady = refreshCart(data);
        if (S !== s) return;
        s.added = true;
        s.el.add.classList.add('is-added');
        s.el.addText.textContent = label(s.pop, 'addedLabel', 'Added to cart');
        clearTimeout(s.addTimer);
        var section = s.pop.closest('.cp-grid');
        // show "Added to cart" for a moment, then swap the popup for the cart drawer
        return Promise.all([cartReady, new Promise(function (r) { setTimeout(r, 700); })]).then(function (res) {
          if (S === s) close();
          openDrawer(section, res[0], data);
        });
      })
      .catch(function (err) {
        if (S === s) showMsg(err.message);
      })
      .then(function () {
        s.busy = false;
        s.el.add.removeAttribute('aria-busy');
      });
  }

  /* Gift product variant: from the section picker, else looked up by handle. */
  var giftCache = {};
  function giftVariantId(pop) {
    if (pop.dataset.gwpEnabled !== 'true') return Promise.resolve(null);
    var id = parseInt(pop.dataset.gwpId, 10);
    if (id) return Promise.resolve(pop.dataset.gwpAvailable === 'true' ? id : null);
    var handle = pop.dataset.gwpHandle;
    if (!handle) return Promise.resolve(null);
    if (giftCache[handle] !== undefined) return Promise.resolve(giftCache[handle]);
    return fetch(root() + 'products/' + encodeURIComponent(handle) + '.js', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (p) {
        var v = p && p.variants && p.variants.filter(function (x) { return x.available; })[0];
        giftCache[handle] = v ? v.id : null;
        return giftCache[handle];
      })
      .catch(function () { return null; });
  }

  /* Gift with purchase: true when the variant has the trigger color AND size (any option). */
  var SIZE_ALIAS = { s: 'small', m: 'medium', l: 'large' };
  function norm(x) {
    x = String(x || '').toLowerCase().trim();
    return SIZE_ALIAS[x] || x;
  }
  function qualifiesForGift(pop, v) {
    var c = norm(pop.dataset.gwpColor);
    var z = norm(pop.dataset.gwpSize);
    if (!c || !z) return false;
    var vals = v.o.map(norm);
    return vals.indexOf(c) > -1 && vals.indexOf(z) > -1;
  }

  function refreshCart(addData) {
    return fetch(root() + 'cart.js', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (cart) {
        var count = cart.item_count;

        // Dawn-style header cart bubble (only when that markup exists)
        var holder = document.getElementById('cart-icon-bubble');
        if (holder && addData && addData.sections && addData.sections['cart-icon-bubble']) {
          var tmp = document.createElement('div');
          tmp.innerHTML = addData.sections['cart-icon-bubble'];
          var inner = tmp.querySelector('.shopify-section');
          holder.innerHTML = inner ? inner.innerHTML : tmp.innerHTML;
        }

        // Any custom cart badge: add data-cp-cart-count to the element holding the number
        Array.prototype.forEach.call(document.querySelectorAll('[data-cp-cart-count]'), function (el) {
          el.textContent = count;
        });

        document.dispatchEvent(new CustomEvent('cp:cart-updated', { detail: { cart: cart, count: count } }));
        try {
          if (typeof window.publish === 'function' && window.PUB_SUB_EVENTS) {
            window.publish(window.PUB_SUB_EVENTS.cartUpdate, { source: 'cp-grid-popup', cartData: addData });
          }
        } catch (e) { /* theme without pub/sub */ }
        return cart;
      })
      .catch(function () { return null; /* the item was added, the badge just did not refresh */ });
  }

  /* ---------- cart drawer ---------- */
  var D = null; // { el, panel, trigger }

  function money(cents, currency) {
    try {
      return new Intl.NumberFormat(document.documentElement.lang || undefined, {
        style: 'currency',
        currency: currency
      }).format(cents / 100);
    } catch (err) {
      return (cents / 100).toFixed(2) + ' ' + currency;
    }
  }

  function renderDrawer(el, cart) {
    var list = el.querySelector('[data-cp-dr-items]');
    list.innerHTML = '';
    var currency = cart.currency || (window.Shopify && Shopify.currency && Shopify.currency.active) || 'USD';
    var removeText = el.dataset.removeLabel || 'Remove';
    cart.items.forEach(function (item, i) {
      var li = document.createElement('li');
      li.className = 'cp-dr__item';

      var img = document.createElement('img');
      img.className = 'cp-dr__img';
      img.alt = item.product_title || '';
      img.width = 160;
      img.height = 200;
      if (item.image) img.src = item.image;

      var info = document.createElement('div');
      var name = document.createElement('p');
      name.className = 'cp-dr__name';
      name.textContent = item.product_title;
      info.appendChild(name);
      if (item.variant_title && item.variant_title !== 'Default Title') {
        var vt = document.createElement('p');
        vt.className = 'cp-dr__meta';
        vt.textContent = item.variant_title;
        info.appendChild(vt);
      }
      var qty = document.createElement('p');
      qty.className = 'cp-dr__meta';
      qty.textContent = 'Qty: ' + item.quantity;
      info.appendChild(qty);
      var rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'cp-dr__remove';
      rm.dataset.line = String(i + 1);
      rm.textContent = removeText;
      info.appendChild(rm);

      var price = document.createElement('div');
      price.className = 'cp-dr__price';
      price.textContent = money(item.final_line_price, currency);

      li.appendChild(img);
      li.appendChild(info);
      li.appendChild(price);
      list.appendChild(li);
    });
    el.querySelector('[data-cp-dr-total]').textContent = money(cart.total_price, currency);
  }

  function openDrawer(section, cart, addData) {
    var el = section && section.querySelector('[data-cp-dr]');
    if (!el) return;
    if (!cart && addData && addData.items) {
      // cart.js failed: build what we can from the add response
      var total = 0;
      addData.items.forEach(function (it) { total += it.final_line_price || 0; });
      cart = { items: addData.items, total_price: total };
    }
    if (!cart) return;
    renderDrawer(el, cart);
    D = { el: el, panel: el.querySelector('[data-cp-dr-panel]'), cart: cart };
    clearTimeout(el._cpTimer);
    el.hidden = false;
    el.removeAttribute('aria-hidden');
    lockScroll();
    void el.offsetWidth;
    el.classList.add('is-open');
    D.panel.focus({ preventScroll: true });
  }

  function closeDrawer(immediate) {
    if (!D) return;
    var d = D;
    D = null;
    d.el.classList.remove('is-open');
    unlockScroll();
    clearTimeout(d.el._cpTimer);
    var done = function () {
      if (D && D.el === d.el) return;
      d.el.hidden = true;
      d.el.setAttribute('aria-hidden', 'true');
    };
    if (immediate) done();
    else d.el._cpTimer = setTimeout(done, (parseFloat(getComputedStyle(d.el).getPropertyValue('--cp-dr-anim')) || 0) + 20);
  }

  function removeLine(line) {
    var d = D;
    fetch(root() + 'cart/change.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ line: parseInt(line, 10), quantity: 0 })
    })
      .then(function (r) { return r.json(); })
      .then(function (cart) {
        if (!cart || !cart.items) return;
        refreshCart(null);
        if (D === d) {
          if (!cart.items.length) closeDrawer();
          else renderDrawer(d.el, cart);
        }
      })
      .catch(function () {});
  }

  /* ---------- events ---------- */
  document.addEventListener('click', function (event) {
    var t = event.target;
    if (!t || !t.closest) return;

    var plus = t.closest('[data-cp-grid-plus]');
    if (plus) {
      var d = plus.dataset;
      plus.dispatchEvent(new CustomEvent('cp:grid-plus-click', {
        bubbles: true,
        detail: { trigger: plus, id: d.productId, handle: d.productHandle, title: d.productTitle, url: d.productUrl, price: d.productPrice }
      }));
      if (d.productHandle) open(plus);
      return;
    }

    if (D && D.el.contains(t)) {
      if (t.closest('[data-cp-dr-close]')) closeDrawer();
      else if (t.closest('.cp-dr__remove')) removeLine(t.closest('.cp-dr__remove').dataset.line);
      return;
    }

    if (!S || !S.pop.contains(t)) return;

    if (t.closest('[data-cp-pop-close]') || t === S.pop) {
      close();
      return;
    }

    var opt = t.closest('.cp-pop__opt');
    if (opt) {
      chooseColor(opt.dataset.value);
      return;
    }

    var sizeBtn = t.closest('[data-cp-pop-size-btn]');
    if (sizeBtn) {
      S.listOpen ? closeList() : openList();
      return;
    }

    var li = t.closest('.cp-pop__li');
    if (li && !li.disabled) {
      chooseSize(li.dataset.value);
      return;
    }

    if (t.closest('[data-cp-pop-add]')) {
      addToCart();
      return;
    }

    if (S.listOpen && !t.closest('[data-cp-pop-list]')) closeList();
  });

  document.addEventListener('keydown', function (event) {
    if (D) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDrawer();
      } else if (event.key === 'Tab') {
        var dn = Array.prototype.slice.call(D.panel.querySelectorAll('button, a[href]')).filter(function (n) { return n.offsetParent !== null; });
        if (dn.length) {
          var f = dn[0], l = dn[dn.length - 1];
          if (event.shiftKey && (document.activeElement === f || document.activeElement === D.panel)) { event.preventDefault(); l.focus(); }
          else if (!event.shiftKey && document.activeElement === l) { event.preventDefault(); f.focus(); }
        }
      }
      return;
    }
    if (!S) return;
    var key = event.key;

    if (key === 'Escape') {
      event.preventDefault();
      if (S.listOpen) {
        closeList();
        S.el.sizeBtn.focus({ preventScroll: true });
      } else {
        close();
      }
      return;
    }

    if (S.listOpen) {
      if (key === 'ArrowDown') { event.preventDefault(); focusOption(1); return; }
      if (key === 'ArrowUp') { event.preventDefault(); focusOption(-1); return; }
    } else if (key === 'ArrowDown' && document.activeElement === S.el.sizeBtn) {
      event.preventDefault();
      openList();
      focusOption(1);
      return;
    }

    if (key === 'Tab') {
      var nodes = Array.prototype.slice.call(
        S.el.card.querySelectorAll('button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])')
      ).filter(function (n) { return n.offsetParent !== null; });
      if (!nodes.length) return;
      var first = nodes[0];
      var last = nodes[nodes.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === S.el.card)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });

  // Re-measure the slider and swap texts when the viewport crosses the mobile breakpoint
  function onBreakpoint() {
    if (!S) return;
    refresh(true);
  }
  if (MQ.addEventListener) MQ.addEventListener('change', onBreakpoint);
  else if (MQ.addListener) MQ.addListener(onBreakpoint);
  window.addEventListener('resize', function () {
    if (S) moveSlider(true);
  });

  /* ---------- theme editor ---------- */
  function editorPreview() {
    if (!(window.Shopify && window.Shopify.designMode)) return;
    var pop = document.querySelector('[data-cp-pop][data-preview="true"]');
    if (!pop) return;
    var section = pop.closest('.cp-grid');
    var btn = section && section.querySelector('[data-cp-grid-plus][data-product-handle]');
    if (btn) open(btn);
  }

  document.addEventListener('shopify:section:unload', function () { closeNow(); closeDrawer(true); });
  document.addEventListener('shopify:section:load', function () {
    closeNow();
    closeDrawer(true);
    editorPreview();
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', editorPreview);
  else editorPreview();
})();