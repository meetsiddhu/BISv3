(function () {
  'use strict';

  var API_BASE = '/attributes/api';
  var OBJECT_TYPE = 'bridge';

  function getBridgeId() {
    var bridgeIdMatch = (window.location.hash || '').match(/Bridges\(ID=(\d+)/);
    return bridgeIdMatch ? bridgeIdMatch[1] : null;
  }

  function esc(displayText) {
    return String(displayText == null ? '' : displayText)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function displayValue(val) {
    if (val === null || val === undefined) return '';
    if (typeof val === 'boolean') return val ? 'Yes' : 'No';
    return String(val);
  }

  function renderGroups(groups, values, editMode) {
    if (!groups.length) {
      return '<div style="color:#8696a9;padding:1rem;text-align:center">No custom attributes configured for bridges.</div>';
    }
    var html = '';
    groups.forEach(function (group) {
      html += '<div style="margin-bottom:1.25rem">';
      html += '<div style="font-size:13px;font-weight:600;color:#556b82;text-transform:uppercase;letter-spacing:.04em;padding:0 0 6px 0;border-bottom:1px solid #e5e5e5;margin-bottom:10px">' + esc(group.name) + '</div>';
      html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px 24px">';
      group.attributes.forEach(function (attr) {
        var val = values[attr.internalKey];
        var displayVal = displayValue(val);
        html += '<div style="display:flex;flex-direction:column;gap:3px">';
        html += '<label style="font-size:12px;color:#6a7a8b;font-weight:500">' + esc(attr.name) + (attr.required ? ' <span style="color:#bb0000">*</span>' : '') + (attr.unit ? ' <span style="color:#aaa;font-weight:400">(' + esc(attr.unit) + ')</span>' : '') + '</label>';
        if (editMode) {
          html += renderInput(attr, val);
        } else {
          html += '<div style="font-size:14px;color:#32363a;min-height:20px;padding:4px 0">' + (displayVal ? esc(displayVal) : '<span style="color:#ccc">-</span>') + '</div>';
        }
        if (attr.helpText) {
          html += '<div style="font-size:11px;color:#aaa">' + esc(attr.helpText) + '</div>';
        }
        // Per-attribute history link removed — custom-attribute change history is surfaced
        // in the "Change Documents" report (AttributeValueHistory joined per object).
        html += '</div>';
      });
      html += '</div></div>';
    });
    return html;
  }

  // Resolve the control to render: the characteristic's displayType wins; 'Auto' (or blank)
  // falls back to a sensible control for the dataType (SAP EAM CT04-style). Cardinality
  // (single vs multi) comes from dataType (SingleSelect / MultiSelect).
  function effectiveDisplay(attr) {
    var dt = attr.displayType;
    if (dt && dt !== 'Auto') return dt;
    switch (attr.dataType) {
      case 'Boolean': return 'BoolSelect';
      case 'SingleSelect': return 'Dropdown';
      case 'MultiSelect': return 'MultiComboBox';
      case 'Date': return 'Date';
      case 'Integer': case 'Decimal': return 'Number';
      default: return 'Input';
    }
  }

  function selectedSet(val) {
    return new Set(String(val == null ? '' : val).split(',').map(function (s) { return s.trim(); }).filter(Boolean));
  }

  function renderInput(attr, val) {
    var customFieldValue = val != null ? val : '';
    var id = 'ca-input-' + attr.internalKey;
    var base = 'style="width:100%;padding:6px 8px;border:1px solid #c0c0c0;border-radius:4px;font-size:13px;box-sizing:border-box"';
    var avs = attr.allowedValues || [];
    var disp = effectiveDisplay(attr);
    var i;

    if (disp === 'RadioGroup') {
      var radios = '';
      for (i = 0; i < avs.length; i++) {
        var rid = id + '-' + i;
        radios += '<label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;font-weight:400">' +
          '<input type="radio" name="' + esc(id) + '" value="' + esc(avs[i].value) + '"' + (String(customFieldValue) === avs[i].value ? ' checked' : '') + ' id="' + rid + '"/>' +
          esc(avs[i].label || avs[i].value) + '</label>';
      }
      return '<div data-ca-radio="' + esc(attr.internalKey) + '" style="display:flex;flex-direction:column;gap:4px;padding:2px 0">' + radios + '</div>';
    }
    if (disp === 'Checkbox') {
      // Boolean → single checkbox; a select-with-values → a checkbox per value (multi).
      if (attr.dataType === 'Boolean' || !avs.length) {
        var on = customFieldValue === true || customFieldValue === 'true';
        return '<label style="display:flex;align-items:center;gap:6px;font-size:13px;font-weight:400"><input type="checkbox" id="' + id + '" data-ca-bool="1"' + (on ? ' checked' : '') + '/> Yes</label>';
      }
      var sel = selectedSet(customFieldValue);
      var boxes = '';
      for (i = 0; i < avs.length; i++) {
        boxes += '<label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;font-weight:400">' +
          '<input type="checkbox" value="' + esc(avs[i].value) + '"' + (sel.has(avs[i].value) ? ' checked' : '') + '/>' +
          esc(avs[i].label || avs[i].value) + '</label>';
      }
      return '<div data-ca-checks="' + esc(attr.internalKey) + '" style="display:flex;flex-direction:column;gap:4px;padding:2px 0">' + boxes + '</div>';
    }
    if (disp === 'MultiComboBox') {
      var msel = selectedSet(customFieldValue);
      var mopts = '';
      for (i = 0; i < avs.length; i++) {
        mopts += '<option value="' + esc(avs[i].value) + '"' + (msel.has(avs[i].value) ? ' selected' : '') + '>' + esc(avs[i].label || avs[i].value) + '</option>';
      }
      return '<select id="' + id + '" multiple data-ca-multi="1" ' + base + ' size="' + Math.min(Math.max(avs.length, 2), 5) + '">' + mopts + '</select>';
    }
    if (disp === 'BoolSelect') {
      return '<select id="' + id + '" ' + base + '><option value="">-</option><option value="true"' + (customFieldValue === true || customFieldValue === 'true' ? ' selected' : '') + '>Yes</option><option value="false"' + (customFieldValue === false || customFieldValue === 'false' ? ' selected' : '') + '>No</option></select>';
    }
    if (disp === 'Dropdown') {
      var opts = '<option value="">-</option>';
      for (i = 0; i < avs.length; i++) {
        opts += '<option value="' + esc(avs[i].value) + '"' + (String(customFieldValue) === avs[i].value ? ' selected' : '') + '>' + esc(avs[i].label || avs[i].value) + '</option>';
      }
      return '<select id="' + id + '" ' + base + '>' + opts + '</select>';
    }
    if (disp === 'Date') {
      return '<input id="' + id + '" type="date" value="' + esc(customFieldValue) + '" ' + base + '/>';
    }
    if (disp === 'Number') {
      return '<input id="' + id + '" type="number" value="' + esc(customFieldValue) + '" ' + base + (attr.minValue != null ? ' min="' + attr.minValue + '"' : '') + (attr.maxValue != null ? ' max="' + attr.maxValue + '"' : '') + '/>';
    }
    return '<input id="' + id + '" type="text" value="' + esc(customFieldValue) + '" ' + base + '/>';
  }

  function collectValues(groups) {
    var values = {};
    groups.forEach(function (group) {
      group.attributes.forEach(function (attr) {
        var key = attr.internalKey;
        var id = 'ca-input-' + key;
        var radioWrap = document.querySelector('[data-ca-radio="' + key + '"]');
        var checksWrap = document.querySelector('[data-ca-checks="' + key + '"]');
        if (radioWrap) {
          var checked = radioWrap.querySelector('input[type=radio]:checked');
          values[key] = checked ? checked.value : null;
          return;
        }
        if (checksWrap) {
          var picked = Array.prototype.slice.call(checksWrap.querySelectorAll('input[type=checkbox]:checked')).map(function (c) { return c.value; });
          values[key] = picked.length ? picked.join(',') : null;
          return;
        }
        var el = document.getElementById(id);
        if (!el) return;
        if (el.getAttribute('data-ca-bool')) { values[key] = el.checked ? 'true' : 'false'; return; }
        if (el.getAttribute('data-ca-multi')) {
          var selOpts = Array.prototype.slice.call(el.selectedOptions || []).map(function (o) { return o.value; });
          values[key] = selOpts.length ? selOpts.join(',') : null;
          return;
        }
        values[key] = el.value === '' ? null : el.value;
      });
    });
    return values;
  }

  var _state = { groups: [], values: {}, editMode: false };

  function render() {
    var root = document.getElementById('ca-bridge-root');
    if (!root) return;
    var content = '<div style="background:#fff;border-radius:8px;border:1px solid #e5e5e5;padding:1rem 1.25rem">';
    content += '<div style="display:flex;align-items:center;margin-bottom:1rem">';
    content += '<span style="font-size:15px;font-weight:600;color:#32363a;flex:1">Custom Attributes</span>';
    if (!_state.editMode) {
      content += '<button onclick="window._caEdit()" style="padding:5px 14px;background:#0a6ed1;color:#fff;border:none;border-radius:4px;font-size:13px;cursor:pointer">Edit</button>';
    } else {
      content += '<button onclick="window._caSave()" style="padding:5px 14px;background:#107e3e;color:#fff;border:none;border-radius:4px;font-size:13px;cursor:pointer;margin-right:6px">Save</button>';
      content += '<button onclick="window._caCancel()" style="padding:5px 14px;background:transparent;color:#0a6ed1;border:1px solid #0a6ed1;border-radius:4px;font-size:13px;cursor:pointer">Cancel</button>';
    }
    content += '</div>';
    content += renderGroups(_state.groups, _state.values, _state.editMode);
    content += '</div>';
    root.innerHTML = content;
  }

  function load() {
    var id = getBridgeId();
    if (!id) return;
    var root = document.getElementById('ca-bridge-root');
    if (!root) return;
    root.innerHTML = '<div style="padding:1rem;color:#8696a9">Loading...</div>';

    // Class-aware (ATTR-1): fetch the bridge's assetClass so the form shows the
    // characteristics configured for that class (falls back to all-classes if absent).
    fetch('/odata/v4/admin/Bridges(ID=' + id + ')?$select=assetClass', { headers: { Accept: 'application/json' }, credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : {}; })
      .catch(function () { return {}; })
      .then(function (bridge) {
        _state.assetClass = (bridge && bridge.assetClass) || null;
        var acQ = _state.assetClass ? '&assetClass=' + encodeURIComponent(_state.assetClass) : '';
        return Promise.all([
          fetch(API_BASE + '/config?objectType=' + OBJECT_TYPE + acQ).then(function (configResponse) { return configResponse.json(); }),
          fetch(API_BASE + '/values/' + OBJECT_TYPE + '/' + id).then(function (valuesResponse) { return valuesResponse.json(); })
        ]);
      })
      .then(function (results) {
        _state.groups = results[0].groups || [];
        _state.values = results[1].values || {};
        _state.editMode = false;
        render();
      }).catch(function () {
        if (root) root.innerHTML = '<div style="padding:1rem;color:#bb0000">Failed to load custom attributes.</div>';
      });
  }

  window._caEdit = function () { _state.editMode = true; render(); };
  window._caCancel = function () { _state.editMode = false; render(); };

  window._caSave = function () {
    var id = getBridgeId();
    if (!id) return;
    var values = collectValues(_state.groups);
    var acQ = _state.assetClass ? '?assetClass=' + encodeURIComponent(_state.assetClass) : '';
    fetch(API_BASE + '/values/' + OBJECT_TYPE + '/' + id + acQ, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': 'bms-attr' },
      body: JSON.stringify({ values: values })
    }).then(function (saveResponse) { return saveResponse.json(); }).then(function (result) {
      if (result.errors) {
        alert('Validation errors:\n' + result.errors.join('\n'));
        return;
      }
      _state.values = Object.assign({}, _state.values, values);
      _state.editMode = false;
      render();
      try { sap.m.MessageToast.show('Custom attributes saved.'); } catch (_) {}
    }).catch(function () {
      alert('Failed to save custom attributes.');
    });
  };

  // _caHistory removed: per-attribute history is no longer shown inline; the
  // "Change Documents" report carries custom-attribute change history per object.

  window.addEventListener('hashchange', function () {
    if (window.location.hash.indexOf('/Bridges(') !== -1) {
      setTimeout(load, 700);
    }
  });

  // Initial load
  setTimeout(load, 800);
}());
