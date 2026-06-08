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

  function renderInput(attr, val) {
    var customFieldValue = val != null ? val : '';
    var id = 'ca-input-' + attr.internalKey;
    var base = 'style="width:100%;padding:6px 8px;border:1px solid #c0c0c0;border-radius:4px;font-size:13px;box-sizing:border-box"';
    if (attr.dataType === 'Boolean') {
      return '<select id="' + id + '" ' + base + '><option value="">-</option><option value="true"' + (customFieldValue === true || customFieldValue === 'true' ? ' selected' : '') + '>Yes</option><option value="false"' + (customFieldValue === false || customFieldValue === 'false' ? ' selected' : '') + '>No</option></select>';
    }
    if (attr.dataType === 'SingleSelect') {
      var opts = '<option value="">-</option>';
      (attr.allowedValues || []).forEach(function (av) {
        opts += '<option value="' + esc(av.value) + '"' + (String(customFieldValue) === av.value ? ' selected' : '') + '>' + esc(av.label || av.value) + '</option>';
      });
      return '<select id="' + id + '" ' + base + '>' + opts + '</select>';
    }
    if (attr.dataType === 'Date') {
      return '<input id="' + id + '" type="date" value="' + esc(customFieldValue) + '" ' + base + '/>';
    }
    if (attr.dataType === 'Integer' || attr.dataType === 'Decimal') {
      return '<input id="' + id + '" type="number" value="' + esc(customFieldValue) + '" ' + base + (attr.minValue != null ? ' min="' + attr.minValue + '"' : '') + (attr.maxValue != null ? ' max="' + attr.maxValue + '"' : '') + '/>';
    }
    return '<input id="' + id + '" type="text" value="' + esc(customFieldValue) + '" ' + base + '/>';
  }

  function collectValues(groups) {
    var values = {};
    groups.forEach(function (group) {
      group.attributes.forEach(function (attr) {
        var el = document.getElementById('ca-input-' + attr.internalKey);
        if (el) values[attr.internalKey] = el.value === '' ? null : el.value;
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

    Promise.all([
      fetch(API_BASE + '/config?objectType=' + OBJECT_TYPE).then(function (configResponse) { return configResponse.json(); }),
      fetch(API_BASE + '/values/' + OBJECT_TYPE + '/' + id).then(function (valuesResponse) { return valuesResponse.json(); })
    ]).then(function (results) {
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
    fetch(API_BASE + '/values/' + OBJECT_TYPE + '/' + id, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
