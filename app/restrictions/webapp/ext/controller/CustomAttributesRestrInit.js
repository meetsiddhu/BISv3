(function () {
  'use strict';

  var API_BASE = '/attributes/api';
  var OBJECT_TYPE = 'restriction';

  function getRestrictionId() {
    var restrictionIdMatch = (window.location.hash || '').match(/Restrictions\(ID='([^']+)'/);
    return restrictionIdMatch ? restrictionIdMatch[1] : null;
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
      return '<div style="color:#8696a9;padding:1rem;text-align:center">No custom attributes configured for restrictions.</div>';
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
        html += '<div style="font-size:11px"><a href="#" onclick="window._carHistory(\'' + esc(attr.internalKey) + '\',\'' + esc(attr.name) + '\');return false;" style="color:#0a6ed1;text-decoration:none">History</a></div>';
        html += '</div>';
      });
      html += '</div></div>';
    });
    return html;
  }

  // Resolve the control to render: the characteristic's displayType wins; 'Auto' falls back to
  // a sensible control for the dataType (SAP EAM CT04-style). Mirrors the bridge collector.
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
    var id = 'car-input-' + attr.internalKey;
    var base = 'style="width:100%;padding:6px 8px;border:1px solid #c0c0c0;border-radius:4px;font-size:13px;box-sizing:border-box"';
    var avs = attr.allowedValues || [];
    var disp = effectiveDisplay(attr);
    var i;

    if (disp === 'RadioGroup') {
      var radios = '';
      for (i = 0; i < avs.length; i++) {
        radios += '<label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;font-weight:400">' +
          '<input type="radio" name="' + esc(id) + '" value="' + esc(avs[i].value) + '"' + (String(customFieldValue) === avs[i].value ? ' checked' : '') + '/>' +
          esc(avs[i].label || avs[i].value) + '</label>';
      }
      return '<div data-car-radio="' + esc(attr.internalKey) + '" style="display:flex;flex-direction:column;gap:4px;padding:2px 0">' + radios + '</div>';
    }
    if (disp === 'Checkbox') {
      if (attr.dataType === 'Boolean' || !avs.length) {
        var on = customFieldValue === true || customFieldValue === 'true';
        return '<label style="display:flex;align-items:center;gap:6px;font-size:13px;font-weight:400"><input type="checkbox" id="' + id + '" data-car-bool="1"' + (on ? ' checked' : '') + '/> Yes</label>';
      }
      var sel = selectedSet(customFieldValue);
      var boxes = '';
      for (i = 0; i < avs.length; i++) {
        boxes += '<label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;font-weight:400">' +
          '<input type="checkbox" value="' + esc(avs[i].value) + '"' + (sel.has(avs[i].value) ? ' checked' : '') + '/>' +
          esc(avs[i].label || avs[i].value) + '</label>';
      }
      return '<div data-car-checks="' + esc(attr.internalKey) + '" style="display:flex;flex-direction:column;gap:4px;padding:2px 0">' + boxes + '</div>';
    }
    if (disp === 'MultiComboBox') {
      var msel = selectedSet(customFieldValue);
      var mopts = '';
      for (i = 0; i < avs.length; i++) {
        mopts += '<option value="' + esc(avs[i].value) + '"' + (msel.has(avs[i].value) ? ' selected' : '') + '>' + esc(avs[i].label || avs[i].value) + '</option>';
      }
      return '<select id="' + id + '" multiple data-car-multi="1" ' + base + ' size="' + Math.min(Math.max(avs.length, 2), 5) + '">' + mopts + '</select>';
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
        var radioWrap = document.querySelector('[data-car-radio="' + key + '"]');
        var checksWrap = document.querySelector('[data-car-checks="' + key + '"]');
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
        var el = document.getElementById('car-input-' + key);
        if (!el) return;
        if (el.getAttribute('data-car-bool')) { values[key] = el.checked ? 'true' : 'false'; return; }
        if (el.getAttribute('data-car-multi')) {
          var selOpts = Array.prototype.slice.call(el.selectedOptions || []).map(function (o) { return o.value; });
          values[key] = selOpts.length ? selOpts.join(',') : null;
          return;
        }
        values[key] = el.value === '' ? null : el.value;
      });
    });
    return values;
  }

  // allGroups = full class pool for restrictions; assigned = the classes explicitly selected
  // for THIS restriction. Empty assigned = show all (back-compatible). Mirrors the bridge UI.
  var _state = { allGroups: [], assigned: [], values: {}, editMode: false };

  function visibleGroups() {
    if (!_state.assigned.length) return [];
    var set = new Set(_state.assigned.map(String));
    return _state.allGroups.filter(function (g) { return set.has(String(g.ID)); });
  }

  function renderClassSelector() {
    var assignedSet = new Set(_state.assigned.map(String));
    var names = _state.allGroups.filter(function (g) { return assignedSet.has(String(g.ID)); }).map(function (g) { return g.name; });
    var chips = names.length
      ? names.map(function (n) { return '<span style="display:inline-block;background:#e3f0fb;color:#0a6ed1;border-radius:10px;padding:2px 10px;margin:0 6px 6px 0;font-size:12px">' + esc(n) + '</span>'; }).join('')
      : '<span style="color:#aaa;font-size:12px">None selected — pick the class(es) that apply to this restriction.</span>';
    return '<div style="background:#f7f9fb;border:1px solid #e5e5e5;border-radius:6px;padding:10px 12px;margin-bottom:14px">' +
      '<div style="display:flex;align-items:center;margin-bottom:8px">' +
      '<span style="font-size:12px;font-weight:600;color:#556b82;text-transform:uppercase;letter-spacing:.04em;flex:1">Classes (' + names.length + ')</span>' +
      '<button onclick="window._carPickClasses()" style="padding:4px 12px;background:#fff;color:#0a6ed1;border:1px solid #0a6ed1;border-radius:4px;font-size:12px;cursor:pointer">Select Classes…</button>' +
      '</div><div style="line-height:1.9">' + chips + '</div></div>';
  }

  function emptyMessage() {
    if (!_state.assigned.length) {
      return _state.editMode
        ? '<div style="color:#8696a9;padding:1rem;text-align:center">No classes selected. Use <b>Select Classes…</b> above to choose which classes apply.</div>'
        : '<div style="color:#8696a9;padding:1rem;text-align:center">No classes assigned to this restriction. Choose <b>Edit</b> to assign one or more classes.</div>';
    }
    return '<div style="color:#8696a9;padding:1rem;text-align:center">The selected class(es) have no characteristics configured.</div>';
  }

  function render() {
    var root = document.getElementById('ca-restriction-root');
    if (!root) return;
    var content = '<div style="background:#fff;border-radius:8px;border:1px solid #e5e5e5;padding:1rem 1.25rem">';
    content += '<div style="display:flex;align-items:center;margin-bottom:1rem">';
    content += '<span style="font-size:15px;font-weight:600;color:#32363a;flex:1">Custom Attributes</span>';
    if (!_state.editMode) {
      content += '<button onclick="window._carEdit()" style="padding:5px 14px;background:#0a6ed1;color:#fff;border:none;border-radius:4px;font-size:13px;cursor:pointer">Edit</button>';
    } else {
      content += '<button onclick="window._carSave()" style="padding:5px 14px;background:#107e3e;color:#fff;border:none;border-radius:4px;font-size:13px;cursor:pointer;margin-right:6px">Save</button>';
      content += '<button onclick="window._carCancel()" style="padding:5px 14px;background:transparent;color:#0a6ed1;border:1px solid #0a6ed1;border-radius:4px;font-size:13px;cursor:pointer">Cancel</button>';
    }
    content += '</div>';
    if (_state.editMode) content += renderClassSelector();
    var vis = visibleGroups();
    content += vis.length ? renderGroups(vis, _state.values, _state.editMode) : emptyMessage();
    content += '</div>';
    root.innerHTML = content;
  }

  function load() {
    var id = getRestrictionId();
    if (!id) return;
    var root = document.getElementById('ca-restriction-root');
    if (!root) return;
    root.innerHTML = '<div style="padding:1rem;color:#8696a9">Loading...</div>';

    Promise.all([
      fetch(API_BASE + '/config?objectType=' + OBJECT_TYPE).then(function (configResponse) { return configResponse.json(); }),
      fetch(API_BASE + '/values/' + OBJECT_TYPE + '/' + id).then(function (valuesResponse) { return valuesResponse.json(); }),
      fetch(API_BASE + '/classes/' + OBJECT_TYPE + '/' + id).then(function (cr) { return cr.ok ? cr.json() : { assigned: [] }; }).catch(function () { return { assigned: [] }; })
    ]).then(function (results) {
      _state.allGroups = results[0].groups || [];
      _state.values = results[1].values || {};
      _state.assigned = (results[2] && results[2].assigned) || [];
      _state.editMode = false;
      render();
    }).catch(function () {
      if (root) root.innerHTML = '<div style="padding:1rem;color:#bb0000">Failed to load custom attributes.</div>';
    });
  }

  window._carEdit = function () { _state.editMode = true; render(); };
  window._carCancel = function () { _state.editMode = false; render(); };

  // Searchable, multi-select class picker (sap.m.SelectDialog) — mirrors the bridge collector.
  window._carPickClasses = function () {
    sap.ui.require([
      'sap/m/SelectDialog', 'sap/m/StandardListItem', 'sap/ui/model/json/JSONModel',
      'sap/ui/model/Filter', 'sap/ui/model/FilterOperator'
    ], function (SelectDialog, StandardListItem, JSONModel, Filter, FilterOperator) {
      var assignedSet = new Set(_state.assigned.map(String));
      var rows = _state.allGroups.map(function (g) { return { ID: String(g.ID), name: g.name, sel: assignedSet.has(String(g.ID)) }; });
      var doFilter = function (oEvt) {
        var q = oEvt.getParameter('value') || '';
        var b = oEvt.getParameter('itemsBinding') || oEvt.getSource().getBinding('items');
        if (b) b.filter(q ? [new Filter('name', FilterOperator.Contains, q)] : []);
      };
      var dlg = new SelectDialog({
        title: 'Select Classes', multiSelect: true, rememberSelections: true,
        growing: true, growingThreshold: 50, contentWidth: '30rem', contentHeight: '24rem',
        search: doFilter, liveChange: doFilter,
        confirm: function (oEvt) {
          _state.values = Object.assign({}, _state.values, collectValues(visibleGroups()));
          var sel = oEvt.getParameter('selectedContexts') || [];
          _state.assigned = sel.map(function (c) { return c.getObject().ID; });
          render();
          dlg.destroy();
        },
        cancel: function () { dlg.destroy(); }
      });
      dlg.setModel(new JSONModel({ classes: rows }));
      dlg.bindAggregation('items', { path: '/classes', template: new StandardListItem({ title: '{name}', selected: '{sel}' }) });
      dlg.open();
    });
  };

  window._carSave = function () {
    var id = getRestrictionId();
    if (!id) return;
    var values = collectValues(visibleGroups());
    var hdr = { 'Content-Type': 'application/json', 'x-csrf-token': 'bms-attr' };
    fetch(API_BASE + '/classes/' + OBJECT_TYPE + '/' + id, { method: 'POST', headers: hdr, credentials: 'same-origin', body: JSON.stringify({ groupIds: _state.assigned }) })
      .then(function () {
        return fetch(API_BASE + '/values/' + OBJECT_TYPE + '/' + id, { method: 'POST', headers: hdr, credentials: 'same-origin', body: JSON.stringify({ values: values }) });
      })
      .then(function (saveResponse) { return saveResponse.json(); }).then(function (result) {
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

  window._carHistory = function (key, label) {
    var id = getRestrictionId();
    if (!id) return;
    fetch(API_BASE + '/history/' + OBJECT_TYPE + '/' + id + '/' + key)
      .then(function (historyResponse) { return historyResponse.json(); })
      .then(function (data) {
        var rows = data.history || [];
        if (!rows.length) { alert('No history found for ' + label); return; }
        var msg = label + ': Change History\n\n';
        rows.forEach(function (historyEntry) {
          var previousCustomFieldValue = historyEntry.oldValueText ?? historyEntry.oldValueInteger ?? historyEntry.oldValueDecimal ?? historyEntry.oldValueDate ?? (historyEntry.oldValueBoolean != null ? (historyEntry.oldValueBoolean ? 'Yes' : 'No') : '') ?? '-';
          var newCustomFieldValue = historyEntry.newValueText ?? historyEntry.newValueInteger ?? historyEntry.newValueDecimal ?? historyEntry.newValueDate ?? (historyEntry.newValueBoolean != null ? (historyEntry.newValueBoolean ? 'Yes' : 'No') : '') ?? '-';
          msg += (historyEntry.changedAt || '').slice(0,16).replace('T',' ') + '  ' + (historyEntry.changedBy || '') + '\n';
          msg += '  ' + previousCustomFieldValue + '  →  ' + newCustomFieldValue + '  [' + (historyEntry.changeSource || '') + ']\n\n';
        });
        alert(msg);
      });
  };

  window.addEventListener('hashchange', function () {
    if (window.location.hash.indexOf('/Restrictions(') !== -1) {
      setTimeout(load, 700);
    }
  });

  // Initial load
  setTimeout(load, 800);
}());
