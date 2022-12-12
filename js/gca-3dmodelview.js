/*!
* @file         GCA-3DModelViewer.js
* @author       Bill Hill
* @date         December 2022
* @version      $Id$
* @par
* Address:
*               Heriot-Watt University,
*               Edinburgh, Scotland, EH14 4AS, UK
* @par
* Copyright (C), [2021],
* Heriot-Watt University, Edinburgh, UK.
*
* This program is free software; you can redistribute it and/or
* modify it under the terms of the GNU General Public License
* as published by the Free Software Foundation; either version 2
* of the License, or (at your option) any later version.
*
* This program is distributed in the hope that it will be
* useful but WITHOUT ANY WARRANTY; without even the implied
* warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR
* PURPOSE.  See the GNU General Public License for more
* details.
*
* You should have received a copy of the GNU General Public
* License along with this program; if not, write to the Free
* Software Foundation, Inc., 51 Franklin Street, Fifth Floor,
* Boston, MA  02110-1301, USA.
* @brief        A  three dimensional model viewer based on MARender and
* 		Three.js for web based visualisation of Gut Cell Atlas
* 		3D models.
*/


/* == GUI access constants. == */
const obj_ctl_model   = 0
const obj_ctl_section = 1
const obj_ctl_domains  = 2

/* == Globals variables. == */

var prm = null;
var ren = null;
var state = undefined;
var base_url = '';
var config_file = '';
var show_gui = true;
var cancel_img = undefined;
var swatch_img = undefined;
var swatch_canvas = undefined;
var swatch_target = undefined;
var undoStack = [];
var redoStack = [];
var maxSavedStates = 100;
var version = 0.0.1;
var SliderType = {INT :0, FLOAT: 1, LOG: 2};

/* == Small utility functions. == */

debug = function(str) {
  if(state.debug) {
    console.log('DEBUG: ' + str);
  }
}

cloneStruct = function(s) {
  return(JSON.parse(JSON.stringify(s)));
}

tripleHexColor = function(v) {
  var c = '';
  for(var idx = 0; idx < 3; ++idx) {
    if(v[idx] < 0x10) {
      c = c + '0';
    }
    c = c + v[idx].toString(16);
  }
  return(c);
}

sensibleFloatStr = function(f) {
  f = Math.round(f * 1000000.0) / 1000000.0;
  var s = '' + f;
  return(s);
}

rgbColor = function(n, a) {
  var r = (n >> 16) & 255;
  var g = (n >> 8) & 255;
  var b = n & 255;
  var rgba = '' + r + ',' + g + ',' + b + ',' + a;
  return(rgba);
}

/* == Small functions for GUI control. == */
getButtonVisible = function(b) {
  var noteye = b.src.match(/noteye\.png$/);
  var eye = ! Boolean(noteye);
  return(eye);
}

setButtonVisible = function(b, v) {
  b.src = (v)? 'icons/eye.png': 'icons/noteye.png';
}

setButtonClipping = function(b, c, f) {
  if(c) {
    b.src = (f)? 'icons/sectionclip2.png': 'icons/sectionclip1.png';
  } else {
    b.src = 'icons/notsectionclip.png';
  }
}

setButtonOpen = function(b, o) {
  b.src = (o)? 'icons/minus.png': 'icons/plus.png';
}

setDomainListOpen = function(but, tbl, visible) {
  setButtonOpen(but, visible);
  tbl.style.display = (visible)? 'table': 'none';
}

/* == Functions called from GUI elements of the application. == */

redoAction = function() {
  debug('redoAction()');
  pushState();
  var s = redoStack.pop();
  if(Boolean(s)) {
    setState(s);
  }
  debug('redoAction() undoStack ' + undoStack.length +
        ' redoStack ' + redoStack.length)
}

undoAction = function() {
  debug('undoAction()');
  pushRedoState();
  var s = popState();
  if(Boolean(s)) {
    setState(s);
  }
  debug('undoAction() undoStack ' + undoStack.length +
        ' redoStack ' + redoStack.length)
}

saveStateToFileAction = function() {
  debug('saveStateToFileAction()');
  var jsn = JSON.stringify(state, null, 2);
  var elm = document.createElement('a');
  elm.setAttribute('href',
                   'data:text/plain;charset=utf-8,' + encodeURIComponent(jsn));
  elm.setAttribute('download', 'state.json');
  elm.style.display = 'none';
  document.body.appendChild(elm);
  elm.click();
  document.body.removeChild(elm);
}

loadStateFromFileAction = function() {
  debug('loadStateFromFileAction()');
  pushState();
  var elm = document.createElement('input');
  elm.setAttribute('type', 'file');
  elm.setAttribute('accept', 'application/json');
  elm.onchange = function(evt) {
    debug('loadStateFromFileAction() onchange = true');
    var files = evt.target.files;
    if(Boolean(files) && (files.length === 1)) {
      debug('loadStateFromFileAction() file = ' + files[0].name);
      var rdr = new FileReader();
      rdr.onload = function(evt) {
        var jsn = rdr.result;
	var newState = JSON.parse(jsn);
	setState(newState);
      }
      rdr.onerror = function(evt) {
        debug('loadStateFromFileAction() error');
      }
      rdr.readAsText(files[0]);
    }
    else {
      debug('loadStateFromFileAction() invalid file type');
    }
    document.body.removeChild(elm);
  }
  elm.click();
  document.body.appendChild(elm);
}

shareViewAction = function() {
  debug('shareViewAction()');
  var url = base_url + '?config=' + config_file;
  url += '&model=' + state.model.color + ',' +
         ((state.model_visible)? 't': 'f');
  url += '&domains';
  var idx;
  var sep = '=';
  var domains = state.model.domains;
  for(idx = 0; idx < domains.length; ++idx) {
    var dom = domains[idx];
    url += sep + idx + ',' + dom.color  + ',' + dom.visible;
    sep = ',';
  }
  url += '&home=' + sensibleFloatStr(ren.center.x) + ','
                  + sensibleFloatStr(ren.center.y) + ','
		  + sensibleFloatStr(ren.center.z);
  url += ',' + sensibleFloatStr(ren.nearPlane) + ','
             + sensibleFloatStr(ren.farPlane);
  url += ',' + sensibleFloatStr(ren.camera.position.x) + ','
             + sensibleFloatStr(ren.camera.position.y) + ','
             + sensibleFloatStr(ren.camera.position.z);
  url += ',' + sensibleFloatStr(ren.camera.up.x) + ','
             + sensibleFloatStr(ren.camera.up.y) + ','
             + sensibleFloatStr(ren.camera.up.z);
  if(state.sectioning) {
    var sec = state.model.section;
    if(sec !== undefined) {
      url += '&section=' +
        sensibleFloatStr(sec.dst) + ',' +
        sensibleFloatStr(sec.pit) + ',' +
        sensibleFloatStr(sec.yaw) + ',' +
        sensibleFloatStr(sec.fxp[0]) + ',' +
        sensibleFloatStr(sec.fxp[1]) + ',' +
        sensibleFloatStr(sec.fxp[2]);
    }
  }
  debug('shareViewAction() url = ' + url);
  window.alert('Share this view using the URL:\n' + url);
}

clippingAction = function(but) {
  debug('clippingAction() ' + but + ' ' + but.id);
  var clip = 0;
  if(but.src.indexOf('notsectionclip') >= 0) {
    clip = 1;
    but.src = 'icons/sectionclip1.png';
  } else if(but.src.indexOf('sectionclip1') >= 0) {
    clip = 2;
    but.src = 'icons/sectionclip2.png';
  } else {
    clip = 0;
    but.src = 'icons/notsectionclip.png';
  }
  if(state.sectioning) {
    var sec = state.model.section;
    switch(clip)
    {
      case 1:
        sec.clipping = true;
	sec.flip = false;
	break;
      case 2:
        sec.clipping = true;
	sec.flip = true;
	break;
      default:
        sec.clipping = false;
	break;
    }
    updateSection();
  }
}

toggleVisibleAction = function(but) {
  debug('toggleVisibleAction() ' + but + ' ' + but.id);
  var make_visible = !getButtonVisible(but);
  setButtonVisible(but, make_visible);
  switch(but.id) {
    case 'model_visible':
      setModelVisible(make_visible);
      break;
    case 'sectionvisible':
      setSectionVisible(make_visible);
      break;
    case 'domainsurfacesvisible':
      state.domain_surfaces_visible = make_visible;
      updateDomainSurfaceVisibility();
      break;
    case 'domainsectionsvisible':
      state.domain_sections_visible = make_visible;
      updateSection();
      break;
    default:
      var bid = but.id.match(/^[a-zA-Z]+/);
      if(bid[0] === 'domainvisible') {
	var mat = but.id.match(/\d+/g);
	var dom_sel_idx = parseInt(mat[0]);
	var dom_idx = parseInt(mat[1]);
	setDomainVisible(dom_idx, make_visible);
      }
      break;
  }
}

toggleDomainListOpenAction = function(but) {
  debug('toggleDomainListOpenAction() ' + but);
  var idx = parseInt(but.id.match(/\d+$/));
  var tbl = document.getElementById('domaintable' + idx);
  var visible = (Boolean(but.src.match(/plus\.png$/)) === false);
  setDomainListOpen(but, tbl, !visible);
}

toggleGUI = function() {
  debug('toggleGUI()');
  var table_ids = ['statecontrol', 'objcontrol', 'viewcontrol'];
  var elm_ids = ['info'];
  show_gui = !show_gui;
  debug('toggleGUI() ' + show_gui);
  for(var tid of table_ids) {
    var tbl = document.getElementById(tid);
    tbl.style.display = (show_gui)? 'block': 'none';
  }
  for(var eid of elm_ids) {
    var elm = document.getElementById(eid);
    elm.style.display = (show_gui)? 'block': 'none';
  }
}

helpAction = function() {
  debug('helpAction()');
  var ht = document.getElementById('helptext');
  if(ht.style.display == 'none') {
    ht.style.display = 'block';
  } else {
    ht.style.display = 'none';
  }
}

setModelColorAction = function(but) {
  debug('setModelColorActiont() ' + but + ' ' + but.id);
  swatch_target = but.id;
  showSwatchAction(true);
}

setDomainColorAction = function(but) {
  debug('setDomainColorAction() ' + but + ' ' + but.id);
  swatch_target = but.id;
  showSwatchAction(true);
}

setDomainAction = function(sel) {
  debug('setDomainAction() ' + sel.selectedIndex);
  pushState();
  var x = sel.id.replace(/\D+/g, '');
  var sel_idx = parseInt(sel.id.replace(/\D+/g, ''));
  var n_dom = state.model.domains.length;
  if((sel_idx >= 0) && (sel_idx < n_dom)) {
    pushState();
    setDomain(sel.selectedIndex);
  }
}

goHomeViewAction = function() {
  debug('goHomeViewAction()');
  pushState();
  goHomeView();
}

setHomeViewAction = function() {
  debug('setHomeViewAction()');
  pushState();
  ren.setHome();
}

viewSurfAction = function(inc) {
  debug('viewSurfAction() ' + inc);
  pushState();
  ren.opacityIncrement(inc);
}

swatchDoneAction = function(img, ev) {
  debug('swatchDoneAction() ' + img + ' ' + ev);
  if(Boolean(swatch_target) && (img.id == 'swatch')) {
    pushState();
    var p = [ev.layerX, ev.layerY];
    debug('swatchDoneAction() ' + p[0] + ' ' + p[1]);
    var v = swatch_canvas.getContext('2d').getImageData(p[0], p[1], 1, 1,).data;
    debug('swatchDoneAction() ' + v[0] + ' ' + v[1] + ' ' + v[2]);
    var what = swatch_target.replace(/\d+.*$/, '');
    var color = tripleHexColor(v);
    if(what === 'model_color') {
      var mod = state.model;
      mod.color = color;
      updateModel(mod);
    } else if(what == 'domainbutton') {
      var dom_idx;
      var dom_sel_idx;
      var mat = swatch_target.match(/\d+/g);
      var dom_sel_idx = parseInt(mat[0]);
      dom_idx = parseInt(mat[1]);
      state.model.domains[dom_idx].color = color;
      updateDomain(dom_idx);
    }
  }
  swatch_target = undefined;
  showSwatchAction(false);
}

showSwatchAction = function(show) {
  debug('showSwatchAction() ' + show);
  if(Boolean(show)) {
    document.body.appendChild(swatch_img);
    document.body.appendChild(cancel_img);
  } else {
    swatch.parentNode.removeChild(swatch_img);
    cancel_img.parentNode.removeChild(cancel_img);
  }
}

/* == Rendering functions. == */

goHomeView = function() {
  ren.setCamera();
  ren.goHome();
}

/* == State management functions. == */

pushState = function() {
  debug('pushState()');
  if(undoStack.length >= maxSavedStates) {
    undoStack.length = maxSavedStates - 1;
  }
  undoStack.push(cloneStruct(state));
}

popState = function() {
  debug('popState()');
  return(undoStack.pop());
}

pushRedoState = function() {
  debug('pushRedoState()');
  if(redoStack.length >= maxSavedStates) {
    redoStack.length = maxSavedStates - 1;
  }
  redoStack.push(cloneStruct(state));
}

popRedoState = function() {
  debug('popRedoState()');
  return(redoStack.pop());
}

setState = function(newState) {
  debug('setState()');
  state = cloneStruct(newState);
  window.document.title = state.title;
  document.getElementById('info').innerHTML = state.info;
  if(state.sectioning === undefined) {
    state.sectioning = false;
  }
  initModel();
  setModel();
  for(var dom_idx = 0; dom_idx < state.domain_sel.length; ++dom_idx) {
    setDomain(dom_idx);
  }
} 

/* == Functions which initialise the interface and state. == */

initHelpText = function() {
  debug('initHelpText()');
  var ht = document.getElementById('helptext');
  if(Boolean(state.help_file)) {
    var xhr= new XMLHttpRequest();
    xhr.open('GET', state.help_file, true);
    xhr.onreadystatechange= function() {
	if ((this.readyState === 4) && (this.status === 200)) {
          ht.innerHTML  = '<div class=margin5>' + 
              this.responseText + '</div>' +
	      '<p></p><p></p>' +
	      '<div class="aligncentre">' +
	      '<button type="button" onclick="helpAction()">' +
	      'Close</button></div><p></p>'
        }
    };
    xhr.send();
  } else {
    ht.innerHTML = '<div class="aligncentre"><u>' +
        'Help Information</u></div><p></p>'
    ht.innerHTML += '<p><div class=margin5>' +
        'No application specific help has been provided, for ' +
        'generic help using this interface please visit: ' +
	'<br>  <a href="https://github.com/ma-tech">ma-tech</a></div></p>'
    ht.innerHTML += '<p></p><p></p>' +
		    '<div class="aligncentre">' +
		    '<button type="button" onclick="helpAction()">' +
		    'Close</button></div><p></p>'
  }
  ht.style.display = 'none';
  debug('initHelpText() text = ' + ht.innerHTML)
}

initColorSwatch = function() {
  debug('initColorSwatch()');
  swatch_canvas = document.createElement('canvas');
  swatch_img = document.createElement('img');
  swatch_img.id = 'swatch';
  swatch_img.onload = function() {
    debug('initColorSwatch() swatch loaded');
    swatch_canvas.width = swatch_img.width;
    swatch_canvas.height = swatch_img.height;
    swatch_canvas.getContext('2d').drawImage(swatch_img, 0, 0);
    swatch_img.setAttribute('onclick', 'swatchDoneAction(this, event)');
  }
  cancel_img = document.createElement('img');
  cancel_img.id = 'cancelswatch';
  cancel_img.onload = function() {
    debug('initColorSwatch() cancel loaded');
    cancel_img.setAttribute('onclick', 'swatchDoneAction(this, event)');
  }
  swatch_img.src = 'icons/swatch.png';
  cancel_img.src = 'icons/cancel.png';
}

initModel = function() {
  debug('initModel()');
  var mod = state.model;
  var tbl = document.getElementById('objcontrol');
  var tr;
  var td;
  tr = tbl.insertRow(obj_ctl_model);
  td = tr.insertCell(0);
  td.setAttribute('width', '100%');
  tbl = document.createElement('table');
  td.appendChild(tbl);
  tr = tbl.insertRow(0);
  td = tr.insertCell(0);
  td.setAttribute('width', '100%');
  td.innerHTML = '<u>Model</u>';
  td.colSpan = '2';
  tr = tbl.insertRow(1);
  td = tr.insertCell(0);
  td.innerHTML = 'Colour';
  td.colSpan = '2';
  td = tr.insertCell(1);
  td.setAttribute('width', '100%');
  but = document.createElement('button');
  but.align = 'right';
  but.setAttribute('id', 'model_color');
  but.setAttribute('class', 'smbutton');
  but.title='Select reference model colour';
  but.setAttribute('onclick', 'setModelColorAction(this)');
  td.appendChild(but);

  tr = tbl.insertRow(2);
  td = tr.insertCell(0);
  td.setAttribute('width', '100%');
  td.innerHTML = '<u>Model Surface</u>';
  td.colSpan = '2';

  tr = tbl.insertRow(3);
  td = tr.insertCell(0);
  td.innerHTML = 'Visibility'
  td.colSpan = '2';
  td = tr.insertCell(1);
  td.setAttribute('width', '100%');
  var but = document.createElement('img');
  but.align = 'right';
  but.setAttribute('id', 'model_visible');
  but.title='Toggle object visability';
  but.setAttribute('onclick', 'toggleVisibleAction(this)');
  setButtonVisible(but, true);
  td.appendChild(but);
  tr = tbl.insertRow(4);
  createLabelSliderValue(tr, SliderType.FLOAT,
    'model_', 'Opacity', 'opacity', 0.0, 1.0, mod.opacity);
}

getSliderValue = function(s) {
  var v;
  var ss = s.slider;
  var st = (typeof ss == 'undefined')? SliderType.INT: ss.st;
  switch(st) {
    case SliderType.INT:
      v = s.value;
      break;
    case SliderType.FLOAT:
      v = ss.min + (ss.max - ss.min) * s.value / ss.pcn;
      break;
    case SliderType.LOG:
      var lmin = Math.log(ss.min);
      var lmax = Math.log(ss.max);
      v = Math.exp(lmin + (lmax - lmin) * s.value / ss.pcn);
      break;
  }
  return(v);
}

setSliderValue = function(s, v) {
  var ss = s.slider;
  var st = (typeof ss == 'undefined')? SliderType.INT: ss.st;
  switch(st) {
    case SliderType.INT:
      s.value = v;
      break;
    case SliderType.FLOAT: 
      s.value = (v - ss.min) * ss.pcn / (ss.max - ss.min);
      break;
    case SliderType.LOG:
      var lmin = Math.log(ss.min);
      var lmax = Math.log(ss.max);
      s.value = ss.pcn * (Math.log(v) - lmin) / (lmax - lmin);
      break;
  }
}

setLabelSliderValueAction = function(prefix, st, ip, prm) {
  var val;
  var sdr;
  var num;
  switch(ip.id) {
    case prefix + prm + '_number':
      var op = document.getElementById(prefix + prm + '_range');
      val = ip.value;
      num = ip;
      sdr = op;
      setSliderValue(op, val);
      break;
    case prefix + prm + '_range':
      var op = document.getElementById(prefix + prm + '_number');
      sdr = ip;
      num = op;
      val = getSliderValue(ip);
      op.value = val;
      break;
  }
  switch(prefix) {
    case 'sec_':
      if(state.sectioning) {
	var sec = state.model.section;
	switch(prm)
	{
	  case 'dst':
	    sec.dst = val;
	    break;
	  case 'pit':
	    sec.pit = val;
	    break;
	  case 'yaw':
	    sec.yaw = val;
	    break;
	  case 'vmin':
	    if(val > sec.map_vmax) {
	      val = sec.map_vmax;
	    }
	    sec.map_vmin = val;  
	    num.value = val;
	    setSliderValue(sdr, val);
	    break;
	  case 'vmax':
	    if(val < sec.map_vmin) {
	      val = sec.map_vmin;
	    }
	    sec.map_vmax = val;  
	    num.value = val;
	    setSliderValue(sdr, val);
	    break;
	  case 'vgamma':
	    sec.map_vgamma = val;
	    break;
	}
	updateSection();
      }
      break;
    case 'model_':
      var mod = state.model;
      var mod = state.model;
      ren.updateModel({name: 'model_surface',
		       opacity: op.value,
		       transparent: true});
      break;
    default:
      break;
  }
}

createLabelSliderValue = function(tr, st, prefix, label, prm, min, max, val) {
  var td = tr.insertCell(0);
  td.innerHTML = label;
  var rng = document.createElement('input');
  rng.setAttribute('type', 'range');
  rng.id = prefix + prm + '_range';
  var hint = 'Set ' + label.toLowerCase();
  rng.title = hint;
  td = tr.insertCell(1);
  td.appendChild(rng);
  var num = document.createElement('input');
  num.setAttribute('type', 'number');
  num.style.width = '6em';
  num.align = 'right';
  num.id = prefix + prm + '_number';
  num.title = hint;
  td = tr.insertCell(2);
  td.appendChild(num);
  switch(st) {
    case SliderType.INT:
      rng['slider'] = {st: SliderType.INT};
      rng.min = num.min = min;
      rng.max = num.max = max;
      break;
    case SliderType.FLOAT:
      rng['slider'] = {st: SliderType.FLOAT, min: min, max: max, pcn: 1000.0};
      rng.min = 0;
      rng.max = 1000.0;
      num.step = (max - min) / 1000.0;
      break;
    case SliderType.LOG:
      rng['slider'] = {st: SliderType.LOG, min: min, max: max, pcn: 1000.0};
      rng.min = 0;
      rng.max = 1000.0;
      num.step = (max - min) / 1000.0;
      break;
  }
  rng.oninput = function(){setLabelSliderValueAction(prefix, st, rng, prm)};
  rng.onmouseup = function(){setLabelSliderValueAction(prefix, st, rng, prm)};
  num.onchange = function(){setLabelSliderValueAction(prefix, st, num, prm)};
  num.value = val;
  setSliderValue(rng, val);
}

baseURL = function() {
  var sec = state.model.section;        
  var url = null;
  if(Boolean(sec.iip3dsrv) && Boolean(sec.wlzobj)) {
    var url = sec.iip3dsrv + '?' +
	      'wlz=' + sec.wlzobj + '&' +
	      'mod=zeta&' +
	      'fxp=' + sec.fxp[0] + ',' + sec.fxp[1] + ',' + sec.fxp[2] + '&' +
	      'pit=' + sec.pit + '&' +
	      'yaw=' + sec.yaw + '&' +
	      'dst=' + sec.dst;
  }
  return(url);
}

initSectioning = function() {
  debug('initSectioning()');
  var objtbl = document.getElementById('objcontrol');
  var sec_row = objtbl.insertRow(obj_ctl_section);
  if((state.sectioning === undefined) || (state.sectioning === false)) {
    sec_row.style.display = 'none';
  } else {
    // Get section distance range from IIP3D server
    var dst_min = -1000;
    var dst_max = 1000;
    var url = baseURL();
    var mod = state.model;
    var sec = mod.section;
    if(Boolean(url)) {
      var req = new XMLHttpRequest();
      req.open('GET', url + '&OBJ=Wlz-distance-range', false);
      req.send(null);
      if(req.status === 200) {
	var rsp = req.responseText.split(':')[1].split(' ');
	dst_min = Number(rsp[0]);
	dst_max = Number(rsp[1]);
      }
    }
    // Create GUI control elements
    var tr;
    var td;
    td = sec_row.insertCell(0);
    var sec_tbl = document.createElement('table');
    sec_tbl.setAttribute('width', '100%');
    td.appendChild(sec_tbl);
    tr = sec_tbl.insertRow(0);
    td = tr.insertCell(0);
    td.innerHTML = '<u>Section</u>';
    td.colSpan = '2';
    tr = sec_tbl.insertRow(1);
    td = tr.insertCell(0);
    td.innerHTML = 'Visibility';
    td.colSpan = '2';
    td = tr.insertCell(1);
    td.setAttribute('width', '33%');
    var but = document.createElement('img');
    but.align = 'right';
    but.setAttribute('id', 'sectionvisible');
    but.title='Toggle section visability';
    but.setAttribute('onclick', 'toggleVisibleAction(this)');
    setButtonVisible(but, sec.visible);
    td.appendChild(but);
    tr = sec_tbl.insertRow(2);
    td = tr.insertCell(0);
    td.innerHTML = 'Clipping';
    td.colSpan = '2';
    td = tr.insertCell(1);
    td.setAttribute('width', '33%');
    var but = document.createElement('img');
    but.align = 'right';
    but.setAttribute('id', 'sectionclip');
    but.title='Toggle section clipping';
    but.setAttribute('onclick', 'clippingAction(this)');
    setButtonClipping(but, sec.clipping, sec.flip);
    td.appendChild(but);

    tr = sec_tbl.insertRow(3);
    createLabelSliderValue(tr, SliderType.INT,
        'sec_', 'Distance', 'dst', dst_min, dst_max, sec.dst);
    tr = sec_tbl.insertRow(4);
    createLabelSliderValue(tr, SliderType.INT,
        'sec_', 'Pitch', 'pit', 0, 180, sec.pit);
    tr = sec_tbl.insertRow(5);
    createLabelSliderValue(tr, SliderType.INT,
        'sec_', 'Yaw', 'yaw', 0, 360, sec.yaw);
    tr = sec_tbl.insertRow(6);
    createLabelSliderValue(tr, SliderType.INT,
        'sec_', 'VMin', 'vmin', -1024, 4096, sec.map_vmin);
    tr = sec_tbl.insertRow(7);
    createLabelSliderValue(tr, SliderType.INT,
        'sec_', 'VMax', 'vmax', -1024, 4096, sec.map_vmax);
    tr = sec_tbl.insertRow(8);
    createLabelSliderValue(tr, SliderType.LOG,
        'sec_', 'VGamma', 'vgamma', 0.1, 10.0, sec.map_vgamma);
    sec_row.style.display = 'block';
    // First render of section object
    var vtx = ren.getIIP3DBBVertices(url,
	new THREE.Vector3(sec.voxelsz[0], sec.voxelsz[1],
			  sec.voxelsz[2]));
    var tex = setSectionTexture();
    ren.addModel({name:        'section',
		  mode:        MARenderMode.SECTION,
		  transparent: true,
		  opacity:     state.model.opacity,
		  visible:     sec.visible,
		  vertices:    vtx,
		  texture:     tex});
  }
}

initDomainSelect = function() {
  debug('initDomainSelect()');
  var tbl = document.getElementById('objcontrol');
  var domains = state.model.domains;
  var tr = tbl.insertRow(obj_ctl_domains);
  var td = tr.insertCell(0);
  tbl = document.createElement('table');
  td.appendChild(tbl);
  var tr = tbl.insertRow(0);
  var td = tr.insertCell(0);
  td.colSpan = '2';
  td.innerHTML = '<u>Domains</u>';
  tr = tbl.insertRow(1);
  td = tr.insertCell(0);
  td.innerHTML = 'Surface Visibility';
  td.colSpan = '2';
  td = tr.insertCell(1);
  td.setAttribute('width', '33%');
  var but = document.createElement('img');
  but.align = 'right';
  but.setAttribute('id', 'domainsurfacesvisible');
  but.title='Toggle domain surface visability';
  but.setAttribute('onclick', 'toggleVisibleAction(this)');
  setButtonVisible(but, state.domain_surfaces_visible);
  td.appendChild(but);
  tr = tbl.insertRow(2);
  td = tr.insertCell(0);
  td.innerHTML = 'Section Visibility';
  td.colSpan = '2';
  td = tr.insertCell(1);
  td.setAttribute('width', '33%');
  var but = document.createElement('img');
  but.align = 'right';
  but.setAttribute('id', 'domainsectionsvisible');
  but.title='Toggle domain section visability';
  but.setAttribute('onclick', 'toggleVisibleAction(this)');
  setButtonVisible(but, state.domain_sections_visible);
  td.appendChild(but);
  for(var dom_sel_idx = 0; dom_sel_idx < state.domain_sel.length;
      ++dom_sel_idx) {
    var sel_id = 'domain' + dom_sel_idx;
    var sel = document.getElementById(sel_id);
    var domtbl = undefined;
    if(Boolean(sel) === false)
    {
      var tr = tbl.insertRow((2 * dom_sel_idx) + 3);
      tr.setAttribute('id', 'catagory' + dom_sel_idx);
      var td = tr.insertCell(0);
      td.innerHTML = state.domain_sel[dom_sel_idx].name;
      var td = tr.insertCell(1);
      but = document.createElement('img');
      but.align = 'middle';
      but.setAttribute('id', 'domainlistbutton' + dom_sel_idx);
      but.title ='Toggle domain list';
      but.setAttribute('onclick', 'toggleDomainListOpenAction(this)');
      td.appendChild(but);
      td = tr.insertCell(2);
      td.colSpan = '2';
      var dom_sel = state.domain_sel[dom_sel_idx];
      setButtonOpen(but, dom_sel.visible);
      tr = tbl.insertRow((2 * dom_sel_idx) + 4);
      td = tr.insertCell(0);
      td.colSpan = '3';
      domtbl = document.createElement('table');
      domtbl.setAttribute('id', 'domaintable' + dom_sel_idx);
      domtbl.style.display = (dom_sel.visible)? 'table': 'none';
      domtbl.style.padding = '0px';
      td.appendChild(domtbl);
      td.style.borderStyle = 'none none none solid';
    }
    for(var idx = 0; idx < state.domain_sel.length; ++idx) {
      var dom_sel = state.domain_sel[idx];
      if(dom_sel.visible === undefined) {
        dom_sel['visible'] = false;
      }
    }
    for(var idx = 0; idx < domains.length; ++idx) {
      var dom = domains[idx];
      if(dom.visible === undefined) {
        dom['visible'] = false;
      }
    }
    var lstidx = 0;
    for(var idx = 0; idx < domains.length; ++idx) {
      var dom = domains[idx];
      if(dom.cat === undefined) {
	dom.cat = [];
      }
      if(dom.cat.indexOf(dom_sel_idx) >= 0) {
	var tr = domtbl.insertRow(lstidx);
	var td = tr.insertCell(0);
	td.innerHTML = dom.name;

	td = tr.insertCell(1);
	td.style.padding = '0px';

	but = document.createElement('button');
	but.align = 'middle';
	but.setAttribute('id', 'domainbutton' + dom_sel_idx + '-' + idx);
	but.setAttribute('class', 'smbutton');
	but.title='Select domain colour';
	but.setAttribute('onclick', 'setDomainColorAction(this)');
	td.appendChild(but);

	td = tr.insertCell(2);
	td.style.padding = '0px';
	var but = document.createElement('img');
	but.title='Toggle domain visability';
	but.align = 'middle';
	but.setAttribute('id', 'domainvisible' + dom_sel_idx + '-' + idx);
	but.setAttribute('onclick', 'toggleVisibleAction(this)');
	setButtonVisible(but, dom.visible);
	td.appendChild(but);
	td.style.padding = '0px';
	++lstidx;
      }
    }
  }
  for(var dom_idx = 0; dom_idx < domains.length; ++dom_idx) {
    setDomain(dom_idx);
  }
}

/* == Model management functions. == */

setModel = function() {
  debug('setModel()');
  var new_model = state.model.name;
  var mod = state.model;
  for(var dom_sel_idx = 0; dom_sel_idx < state.domain_sel.length;
      ++dom_sel_idx) {
    var dom_sel = state.domain_sel[dom_sel_idx];
    if(dom_sel.sel_idx == undefined) {
      dom_sel['sel_idx'] = 0;
    }
  }
  state.model_init = true;
  checkModelSection();
  var cam = mod.camera_home;
  ren.setCamera(new THREE.Vector3(cam.cen[0], cam.cen[1], cam.cen[2]),
		cam.near, cam.far,
		new THREE.Vector3(cam.pos[0], cam.pos[1], cam.pos[2]));
  ren.setHome(new THREE.Vector3(cam.pos[0], cam.pos[1], cam.pos[2]),
	      new THREE.Vector3(cam.up[0], cam.up[1], cam.up[2]));
  var path = state.model_obj_dir + '/' + mod.surface;
  var color = '0x' + mod.color;
  var vis = state.model_visible;
  ren.addModel({name:        'model_surface',
		mode:        MARenderMode.PHONG,
		path:        path,
		color:       parseInt(color),
		visible:     vis,
		transparent: true,
		clipping:    null,
		opacity:     mod.opacity});
  initSectioning();
  updateModel(mod);
  initDomainSelect();
  goHomeView();
}

checkModelSection = function() {
  if(state.sectioning) {
    var mod = state.model;
    if(mod.section === undefined) {
      mod.section = [];
    }
    var sec = mod.section;
    for(var p in ['dst', 'pit', 'yaw']) {
      if(sec[p] === undefined) {
        sec[p] = 0.0;
      }
    } 
    for(var p in ['flip', 'visible']) {
      if(sec[p] === undefined) {
	sec[p] = false;
      }
    }
    if(sec.fxp === undefined) {
      sec.fxp = [0.0, 0.0, 0.0];
    }
    if(sec.voxelsz === undefined) {
      sec.voxelsz = [1.0, 1.0, 1.0];
    }
    if(sec.iip3dsrv === undefined) {
      sec.iip3dsrv = null;
    }
    if(sec.wlzobj === undefined) {
      sec.wlzobj = null;
    }
  }
}

updateModel = function(mod) {
  debug('updateModel() ' + mod);
  var but = document.getElementById('model_color');
  but.style.background = '#' + mod.color;
  var color = '0x' + mod.color;
  var vis = state.model_visible;
  ren.updateModel({name: 'model_surface',
		   color: parseInt(color),
		   visible: vis,
		   transparent: true,
		   opacity: mod.opacity});
  updateSection();
}

updateSection = function() {
  debug('updateSection()');
  if(state.sectioning) {
    var mod = state.model;
    var sec = mod.section;
    var vis = sec.visible;
    if(vis) {
      var url = baseURL();
      var vtx = ren.getIIP3DBBVertices(url,
	  new THREE.Vector3(sec.voxelsz[0], sec.voxelsz[1],
			    sec.voxelsz[2]));
      var tex = setSectionTexture();
      var pln = ren.makePlaneFromVertices(vtx);
      if(sec.flip) {
        pln.normal = pln.normal.negate();
        pln.constant = -pln.constant;
      }
      ren.updateModel({name:     'section',
		    transparent: true,
		    visible:     sec.visible,
		    opacity:     0.5,
		    vertices:    vtx,
		    texture:     tex});
      if(sec.clipping) {
	ren.updateModel({name: 'model_surface',
			 clipping:    pln,
			 transparent: true});
      } else {
	ren.updateModel({name: 'model_surface',
			 clipping:    null,
			 transparent: true});
      }
    } else {
      ren.updateModel({name: 'section',
		       visible: false,
		       transparent: true});
      ren.updateModel({name: 'model_surface',
                      clipping: null,
		      transparent: true});
    }
  }
}

setSectionTexture = function() {
  var mod = state.model;
  var sec = mod.section;
  var tex = baseURL();
  var domains = mod.domains;
  // Add model
  tex = tex + '&qlt=50&sel=0,' + rgbColor(parseInt(mod.color, 16), 255);
  if(sec.map) {
    tex = tex + '&map=gamma,' + sec.map_vmin + ',' + sec.map_vmax + ',0,255,' +
        sec.map_vgamma;
  }
  // Add domains
  if(state.domain_sections_visible) {
    for(var dom_idx = 0; dom_idx < domains.length; ++dom_idx) {
      var dom = domains[dom_idx];
      if(dom.visible && (dom.iip3d_idx !== undefined)) {
	tex = tex + '&sel=' + dom.iip3d_idx + ',' +
	      rgbColor(parseInt(dom.color, 16), 192);
      }
    }
  }
  tex = tex + '&cvt=png';
  return(tex);
}

setSectionVisible = function(make_visible) {
  if(state.sectioning) {
    var mod = state.model;
    mod.section['visible'] = make_visible;
    updateSection();
  }
}

setModelVisible = function(make_visible) {
  debug('setModelVisible() ' + make_visible);
  state.model_visible = make_visible;
  var mod = state.model;
  updateModel(mod);
}

/* == Domain management functions. == */

updateDomainSurfaceVisibility = function() {
  debug('updateDomainSurfaceVisibility()');
  var domains = state.model.domains;
  for(var dom_idx = 0; dom_idx < domains.length; ++dom_idx) {
    updateDomain(dom_idx);
  }
}

/* \fn setDomainVisible
 * Sets the visibility of the domain with the given domain index.
 * \param dom_idx           The domain to be set.
 * \param v		    True if domain to be set visible.
 */
setDomainVisible = function(dom_idx, v) {
  debug('setDomainVisible() ' + dom_idx + ' ' + v);
  state.model.domains[dom_idx].visible = v;
  setDomain(dom_idx);
}

/* \fn setDomain
 * Sets the domain in the state and then updates the GUI.
 * \param new_dom_idx           The domain to be set.
 */
setDomain = function(new_dom_idx) {
  debug('setDomain() ' + new_dom_idx);
  var mod = state.model;
  var dom = mod.domains[new_dom_idx];
  var new_dom_obj = dom.obj;
  var new_dom_name = dom.name;
  var ren_obj_name = 'domain' + new_dom_idx;
  var vis = dom.visible && state.domain_surfaces_visible;
  ren.removeModel(ren_obj_name);
  if((new_dom_obj !== 'null') && vis) {
    var mode = MARenderMode.POINT;
    var color = '0x' + dom.color;
    var opacity = 0.1;
    var path = state.domain_obj_dir + '/' + new_dom_obj;
    if(Boolean(dom.mode) && (dom.mode === 'surface')) {
      mode = MARenderMode.PHONG;
    }
    if(Boolean(dom.opacity)) {
      opacity = dom.opacity;
    }
    ren.addModel({name: ren_obj_name,
		  path: path,
		  color: parseInt(color),
		  visible: vis,
		  transparent: true,
		  opacity: opacity,
		  mode: mode});
  }
  updateDomain(new_dom_idx);
}

/* \fn updateDomain
 * \param dom_idx               The domain to be updated.
 * Updates the valid domain GUI components and domain model from the state.
 */
updateDomain = function(dom_idx) {
  debug('updateDomain() ' + dom_idx);
  var but = false;
  var col = false;
  var vis = false;
  var mod = state.model;
  var dom = mod.domains[dom_idx];
  // Domain may be in multiple catagories so run through them
  col = dom.color;
  op = dom.opacity;
  vis = dom.visible;
  but = false;
  for(var dom_cat_idx = 0; dom_cat_idx < dom.cat.length; ++dom_cat_idx) {
    var dom_sel_idx = dom.cat[dom_cat_idx];
    var at = document.getElementById('domaintable' + dom_sel_idx);
    if(Boolean(at)) {
      var tr_list = at.rows;
      if(Boolean(tr_list)) {
	for(var tr_idx = 0; tr_idx < tr_list.length; ++tr_idx) {
	  var td_cells = tr_list[tr_idx].cells;
	  if(td_cells[0].innerText === dom.name) {
	    but = td_cells[1].children[0];
	    if(Boolean(but)) {
	      setButtonVisible(but, vis);
	      but.style.background = '#' + col;
	    }
	  }
	}
      }
    }
  }
  if(col) {
    var color = '0x' + col;
    vis = vis && state.domain_surfaces_visible;
    var ren_obj_name = 'domain' + dom_idx;
    ren.updateModel({name: ren_obj_name,
		     color: parseInt(color),
		     visible: vis,
		     transparent: true,
		     opacity: op});
  }
  updateSection();
}

/* == Main application functions. == */

/*!
 * \fn parseURL
 * Parses the query string of the URL for paramters
 * (see https://en.wikipedia.org/wiki/Query_string).
 * On return the global parameter map prm is set with key/value pairs.
 */
parseURL = function() {
  prm = {};
  var href = new String(location.href);
  var seg = href.split('?');
  base_url = seg[0];
  if(seg.length === 2) {
    seg = seg[1].split('&');
    var len = seg.length;
    for(var i = 0; i < len; ++i) {
      var s = seg[i].split('=');
      prm[s[0]] = s[1];
    }
  }
}

/*! \fn updateStateFromParam
 * Parse given parameters and use their values to update the state.
 * See shareViewAction().
 */
updateStateFromParam = function() {
  var err = null;
  if(prm['debug']) {
    /* debug = [tTfF]
     */
    state.debug = prm['debug'].match(/^[tT]/);
  }
  if(!err && prm['model']) {
    /* model   = <mod_spec>
     * mod_spec = <idx>,<color>,<visible>
     * idx      = integer
     * color   = 6 digit hex
     * visible  = [tTfF]
     */
    var md = prm['model'].split(',');
    if(md.length !== 2) {
      err = 'model';
    } else {
      var mc = md[0];
      var mv = md[1];
      mc = mc.toLowerCase().replace(/[^0-9a-f]+/g, '');
      mv = mv.match(/^[tT]/);
      state.model.color = mc;
      state.model.visible = mv;
    }
  }
  if(!err && prm['domains']) {
    /* domains   = <dom_spec>(,<dom_spec>)*
     * dom_spec = <idx>,<color>,<visible>
     * idx      = integer
     * color   = 6 digit hex
     * visible  = [tTfF]
     */
    var domains = state.model.domains;
    var ga = prm['domains'].split(',');
    var ln = ga.length / 3;
    for(var idx = 0; (idx < ln); ++idx) {
      var i3 = idx * 3;
      var ai = ga[i3 + 0];
      var ac = ga[i3 + 1];
      var av = ga[i3 + 2];
      ai = parseInt(ai);
      ac = ac.toLowerCase().replace(/[^0-9a-f]+/g, '');
      av = av.match(/^[tT]/);
      if((isNaN(ai) !== false) || (ac.length !== 6)) {
	err = 'domains';
        break;
      } else if((ai > 0) && (ai < domains.length)) {
        var dom = domains[ai];
	dom.color = ac;
	dom.visible = av;
      }
    }
  }
  if(!err && prm['home']) {
    /* home    = <cen>,<near>,<far>,<cam_pos><cam_up>
     * cen     = float,float,float
     * near    = float
     * far     = float
     * cam_pos = float,float,float
     * cam_up  = float,float,float
     */
    var gh = prm['home'].split(',');
    if(gh.length !== 11) {
      err = 'home';
    } else {
      for(var idx = 0; idx < gh.length; ++idx) {
        gh[idx] = parseFloat(gh[idx]);
	if(isNaN(gh[idx])) {
	  err = 'home';
	  break;
	}
      }
    }
    if(!err) {
      var ch = state.model.camera_home;
      ch.cen[0] = gh[ 0];
      ch.cen[1] = gh[ 1];
      ch.cen[2] = gh[ 2];
      ch.near   = gh[ 3];
      ch.far    = gh[ 4];
      ch.pos[0] = gh[ 5];
      ch.pos[1] = gh[ 6];
      ch.pos[2] = gh[ 7];
      ch.up[0]  = gh[ 8];
      ch.up[1]  = gh[ 9];
      ch.up[2]  = gh[10];
    }
  }
  if(!err) {
    if(prm['sectioning']) {
      state['sectioning'] = (prm['sectioning'] === 'true');
    } else {
      state['sectioning'] = Boolean(state['sectioning']);
    }
  }
  if(!err && prm['section']) {
    /* section = <dst>,<pit>,<yaw>,<fxp>
     * dst     = float
     * pit     = float
     * yaw     = float
     * fxp     = float,float,float
     */
    var gs = prm['section'].split(',');
    if(gs.length !== 6) {
      err = 'section';
    }
    if(!err && state.sectioning) {
      var sec = state.model.section;
      if((sec !== undefined) &&
         (sec.dst !== undefined) && (sec.pit !== undefined) &&
         (sec.yaw !== undefined) && (sec.fxp !== undefined)) {
	sec.dst = gs[0]
	sec.pit = gs[1]
	sec.yaw = gs[2]
	sec.fxp[0] = gs[3];
	sec.fxp[1] = gs[4];
	sec.fxp[2] = gs[5];
      }
    }
  }
  if(err) {
    alert('Failed to parse url for ' + err);
  }
}

/*! \fn main
 * Given a valid state object already read when parsing the URL query string
 * this function completes the application. */
main = function() {
  var ren_container = document.getElementById('three');
  window.document.title = state.title;
  document.body.appendChild(ren_container);
  document.getElementById('info').innerHTML = state.info;
  initHelpText();
  initColorSwatch();
  initModel();
  ren = new MARenderer(window, ren_container);
  ren.init();
  if(Boolean(prm['background'])) {
    var c = parseInt(prm['background']);
    if(!isNaN(c)) {
      ren.renderer.setClearColor(c, 1 );
    }
  }
  ren.setLocalClipping(true);
  ren.win.removeEventListener('keypress', ren._keyPressed);
  setModel();
  ren.setHomeOnLoad = false;
  ren.animate();
}

/* Check for WebGL and if there is none issue a message.
 * Then provided WebGL is supported parse the URL, create a state object
 * from the JSON config file, set parameters in the state from URL and
 * call main(). */
if((Detector.webgl)) {
  parseURL();
} else {
  alert('Your web browser does not appear to support WebGL, ' +
        'which is essential to this application. ' +
        'Please see: ' +
	'https://get.webgl.org or ' + 
	'https://en.wikipedia.org/wiki/WebGL#Support');
}
if(prm['config'] === undefined) {
  alert('No parameters provided,' +
        'as a minimum a configuration file is required.');
} else {
  config_file = prm['config'];
  var req = new XMLHttpRequest();
  req.open('GET', prm['config'], false);
  req.send(null);
  if(req.status === 200) {
    state = JSON.parse(req.responseText);
    if(Boolean(state)) {
      updateStateFromParam();
      main();
    } else {
      alert('Invalid configuration file provided.');
    }
  } else {
    alert('Unable to read configuration file.');
  }
}
