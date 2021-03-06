var dl = require('datalib'),
    canvas = require('../render/canvas/index'),
    svg = require('../render/svg-headless/index'),
    View = require('./View'),
    log = require('../util/log');

var HeadlessView = function(width, height, model) {
  View.call(null, width, height, model);
  this._el = "body";
  this._type = "canvas";
  this._renderers = {canvas: canvas, svg: svg};
  this._canvas = null;
  this._headless = true;
}

var prototype = (HeadlessView.prototype = new View());

prototype.renderer = function(type) {
  if(type) this._type = type;
  return View.prototype.renderer.apply(this, arguments);
};

prototype.canvas = function() {
  return this._canvas;
};

prototype.canvasAsync = function(callback) {
  var r = this._renderer, view = this;
  
  function wait() {
    if (r.pendingImages() === 0) {
      view.render(); // re-render with all images
      callback(view._canvas);
    } else {
      setTimeout(wait, 10);
    }
  }

  // if images loading, poll until ready
  (r.pendingImages() > 0) ? wait() : callback(this._canvas);
};

prototype.svg = function() {
  return (this._type === "svg")
    ? this._renderer.svg()
    : null;
};

prototype.initialize = function() {    
  var w = this._width,
      h = this._height,
      pad = this._padding,
      bg = this._bgcolor;

  if (this._viewport) {
    w = this._viewport[0] - (pad ? pad.left + pad.right : 0);
    h = this._viewport[1] - (pad ? pad.top + pad.bottom : 0);
  }

  this._renderer = this._renderer || new this._io.Renderer();
  
  if (this._type === "svg") {
    this.initSVG(w, h, pad, bg);
  } else {
    this.initCanvas(w, h, pad, bg);
  }
  
  return this;
};

prototype.initCanvas = function(w, h, pad, bg) {
  var Canvas = require("canvas"),
      tw = w + (pad ? pad.left + pad.right : 0),
      th = h + (pad ? pad.top + pad.bottom : 0),
      canvas = this._canvas = dl.isNode ? new Canvas(tw, th) : document.createElement('canvas'),
      ctx = canvas.getContext("2d");

  if(!dl.isNode) {  // Manually set width/height on DOM elements
    canvas.setAttribute("width", tw);
    canvas.setAttribute("height", th);
  }
  
  // setup canvas context
  ctx.setTransform(1, 0, 0, 1, pad.left, pad.top);

  // configure renderer
  this._renderer.context(ctx);
  this._renderer.resize(w, h, pad);
  this._renderer.background(bg);
};

prototype.initSVG = function(w, h, pad, bg) {
  var tw = w + (pad ? pad.left + pad.right : 0),
      th = h + (pad ? pad.top + pad.bottom : 0);
      
  // configure renderer
  this._renderer.initialize(this._el, tw, th, pad, bg);
};

module.exports = HeadlessView;
