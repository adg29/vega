define(function(require, exports, module) {
  var scalefn = require('./scale'),
      parseAxes = require('../parse/axes'),
      util = require('../util/index'),
      constants = require('../util/constants');

  function lookupScale(name) {
    var group = this, scale = null;
    while(scale == null) {
      scale = group.scales[name];
      group = group.mark ? group.mark.group : (group.parent||{}).group;
      if(!group) break;
    }
    return scale;
  };

  return function group(model, def, mark, builder, renderer) {
    var children = {},
        node = new model.Node(buildGroup),
        marksNode, axesNode;

    node.parent = builder.parent;
    node.scales = {};
    node.scale  = lookupScale.bind(node);
    (def.scales||[]).forEach(function(s) { 
      s = node.scales[s.name] = scalefn(model, s);
      var dt = s._deps.data, sg = s._deps.signals;
      if(dt) dt.forEach(function(d) { model.data(d).addListener(builder); });
      if(sg) sg.forEach(function(s) { model.signal(s).addListener(builder); });
      node.addListener(s);
    });

    node.addListener(marksNode = new model.Node(buildMarks));
    node.addListener(axesNode  = new model.Node(buildAxes));

    node.disconnect = function() {
      util.keys(children).forEach(function(group_id) {
        children[group_id].forEach(function(c) {
          if(c.type == constants.MARK) marksNode.removeListener(c.builder);
          else if(c.type == constants.AXIS) axesNode.removeListener(c.builder);
          c.builder.disconnect();
        })
      });

      children = {};
    };

    function buildGroup(input) {
      util.debug(input, ["building group", def]);

      input.add.forEach(function(group) {
        group.scales = group.scales || {};    
        group.scale  = lookupScale.bind(group);

        group.items = group.items || [];
        children[group._id] = children[group._id] || [];

        group.axes = group.axes || [];
        group.axisItems = group.axisItems || [];
      });

      return input;
    };

    function buildMarks(input) {
      util.debug(input, ["building marks", def.marks]);

      input.add.forEach(function(group) {
        var marks = def.marks,
            inherit, i, m, b;

        for(i = 0; i < marks.length; i++) {
          inherit = "vg_"+group.datum._id;
          group.items[i] = {group: group};
          b = require('./build')(model, renderer, marks[i], group.items[i], builder, inherit);

          // Temporary connection to propagate initial pulse. 
          marksNode.addListener(b);
          children[group._id].push({ 
            builder: b, 
            from: marks[i].from || inherit, 
            type: constants.MARK 
          });
        }
      });

      input.mod.forEach(function(group) {
        // Remove temporary connection for marks that draw from a source
        children[group._id].forEach(function(c) {
          if(c.type == constants.MARK && model.data(c.from) !== undefined) {
            marksNode.removeListener(c.builder);
          }
        });
      });

      input.rem.forEach(function(group) {
        // For deleted groups, disconnect their children
        children[group._id].forEach(function(c) { 
          marksNode.removeListener(c.builder);
          c.builder.disconnect(); 
        });
        delete children[group._id];
      });

      return input;
    };

    function buildAxes(input) {
      util.debug(input, ["building axes", def.axes]);
      var i, c;

      function axs(group) {
        var axes = group.axes,
            axisItems = group.axisItems,
            b = null;

        parseAxes(model, def.axes, axes, group);
        axes.forEach(function(a, i) {
          var scale = def.axes[i].scale;
          axisItems[i] = {group: group, axisDef: a.def()};
          b = require('./build')(model, renderer, axisItems[i].axisDef, axisItems[i], builder);
          b._deps.scales.push(scale);
          axesNode.addListener(b);
          children[group._id].push({ builder: b, type: constants.AXIS, scale: scale });
        });
      };

      input.add.forEach(axs);
      input.mod.forEach(function(group) {
        // Reparse axes to feed them new data from reevaluated scales. 
        // Reparsing creates a new axes def, so we need to remove+disconnect
        // the old axes dataflow branches.
        // TODO: optimize this w/references for defs.
        for(i = children[group._id].length-1; i >= 0; i--) {
          c = children[group._id][i];
          if(c.type != constants.AXIS) continue;
          axesNode.removeListener(c.builder);
          c.builder.disconnect();
          children[group._id].splice(i, 1);
        }

        axs(group);
      });

      var scales = (def.axes||[]).reduce(function(acc, x) {
        return (acc[x.scale] = 1, acc);
      }, {});
      axesNode._deps.scales = util.keys(scales);

      return input;
    };    

    return node;
  }

});