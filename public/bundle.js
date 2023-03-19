(() => {
  // src/script/reactive/core.ts
  var StreamController = class {
    constructor() {
      this.stream = new Stream();
    }
    add(evt) {
      this.stream.trigger_event(evt);
    }
    error(err) {
      this.stream.trigger_error(err);
    }
    close(reason) {
      this.stream.trigger_close(reason);
    }
  };
  var Stream = class {
    constructor() {
      this.observers = [];
      this.closed = false;
    }
    toString() {
      return "#<Stream>";
    }
    add_observer(observer) {
      this.observers.push(observer);
    }
    // TODO: module-private?
    remove_observer(observer) {
      var ind;
      ind = this.observers.indexOf(observer);
      if (ind != -1) {
        this.observers.splice(ind, 1);
      }
    }
    // TODO: these should really be module-private
    trigger_event(event) {
      if (!this.closed) {
        this.observers.map((observer) => observer.on_event(event));
      } else {
        throw "closed";
      }
    }
    trigger_error(error) {
      if (!this.closed) {
        this.observers.map((observer) => observer.on_error(error));
      } else {
        throw "closed";
      }
    }
    trigger_close(reason) {
      this.closed = true;
      return this.observers.map((observer) => observer.on_close(reason));
    }
    listen(event_cb, error_cb, close_cb) {
      var observer = new Observer(this, event_cb, error_cb, close_cb);
      this.add_observer(observer);
      return observer;
    }
    map(func) {
      var controller = new StreamController();
      this.listen(
        (event) => controller.add(func(event)),
        (error) => controller.error(error),
        (reason) => controller.close(reason)
      );
      return controller.stream;
    }
    distinct() {
      var controller = new StreamController();
      var lastEvent = null;
      this.listen(
        (event) => {
          if (event !== lastEvent) {
            lastEvent = event;
            controller.add(event);
          }
        },
        (err) => controller.error(err),
        (reason) => controller.close(reason)
      );
      return controller.stream;
    }
    filter(func) {
      var controller = new StreamController();
      this.listen(
        (event) => {
          if (func(event)) {
            controller.add(event);
          }
        },
        (error) => controller.error(error),
        (reason) => controller.close(reason)
      );
      return controller.stream;
    }
    // TODO
    //        fold(initial : B, func : (A, B) => B) : Signal<B> {
    //            var signal;
    //            signal = new Stream(initial);
    //            this.listen((event) => signal.trigger_event(func(signal.value, event)), (error) => signal.trigger_error(error), (reason) => signal.trigger_close(reason));
    //            return signal;
    //        }
    /* TODO
        distinct() {
            var dist, last_evt;
            dist = new Stream(this.value);
            last_evt = this.value;
            this.listen(((event) => {
                if (event !== last_evt) {
                    last_evt = event;
                    return dist.trigger_event(event);
                }
            }), (error) => dist.trigger_error(error), (reason) => dist.trigger_close(close));
            return dist;
        }
    
        throttle(interval) {
            var last_time, throttled;
            last_time = new Date().getTime();
            throttled = new Stream(this.value);
            this.listen(((evt) => {
                var now;
                now = new Date().getTime();
                if (now >= last_time + interval) {
                    last_time = now;
                    return throttled.trigger_event(evt);
                }
            }), (error) => throttled.trigger_error(error), (reason) => throttled.trigger_close(reason));
            return throttled;
        }
        */
    log(name) {
      var repr = name ? name : this.toString();
      this.listen(
        (event) => console.log(repr + ":event:", event),
        (error) => console.log(repr + ":error:", error),
        (reason) => console.log(repr + ":close:", reason)
      );
    }
  };
  var Observer = class {
    constructor(stream, event_cb, error_cb, close_cb) {
      this.stream = stream;
      this.event_cb = event_cb;
      this.error_cb = error_cb;
      this.close_cb = close_cb;
    }
    toString() {
      return "#<Observer>";
    }
    on_event(event) {
      this.event_cb(event);
    }
    on_error(error) {
      if (this.error_cb) {
        this.error_cb(error);
      } else {
        throw error;
      }
    }
    on_close(reason) {
      if (this.close_cb) {
        this.close_cb(reason);
      }
    }
    unsubscribe() {
      this.stream.remove_observer(this);
    }
  };
  var SignalController = class {
    constructor(initialValue) {
      this.updates = new StreamController();
      this.signal = new Signal(initialValue, this.updates.stream);
    }
    update(newValue) {
      if (this.signal.value !== newValue) {
        this.signal.value = newValue;
        this.updates.add(newValue);
      }
    }
  };
  var Signal = class {
    constructor(value, updates) {
      this.value = value;
      this.updates = updates;
    }
    /* TODO
    static fold<B>(initialValue : B, stream : Stream<A>, combiner : (A, B) => B) : Signal<B> {
        var controller = new SignalController(initialValue);
        stream.listen((evt) {
        var oldValue = controller.signal.value;
        controller.update(combiner(oldValue, evt));
        });
        return controller.signal;
    }
    */
    static constant(value) {
      return new Signal(value, new StreamController().stream);
    }
    static derived(signals, comp) {
      var recompute = () => comp.apply(this, [signals.map((s) => s.value)]);
      var controller = new SignalController(recompute());
      signals.forEach((signal) => {
        signal.updates.listen(
          (_) => controller.update(recompute())
        );
      });
      return controller.signal;
    }
    static or(signals) {
      return Signal.derived(signals, (values) => {
        var val = false;
        for (var i = 0; i < values.length; i++) {
          val = val || values[i];
        }
        return val;
      });
    }
    map(mapper) {
      return Signal.derived([this], (values) => mapper(values[0]));
    }
    log(tag) {
      if (tag == void 0) {
        tag = "<#Signal>";
      }
      console.log(tag + ":initial:", this.value);
      this.updates.log(tag);
    }
  };
  var Completer = class {
    constructor() {
      this.future = new Future();
    }
    complete(value) {
      this.future.trigger(value);
    }
    error(err) {
      this.future.trigger_error(err);
    }
  };
  var Future = class {
    static all(futures) {
      var comp = new Completer();
      var completed = 0;
      var results = [];
      range(futures.length).forEach((i) => {
        results.push(null);
        futures[i].then(
          (val) => {
            results[i] = val;
            completed++;
            if (completed == futures.length) {
              comp.complete(results);
            }
            return null;
          },
          (err) => comp.error(err)
        );
      });
      return comp.future;
    }
    constructor() {
      this.completed = false;
      this.observers = [];
    }
    trigger(value) {
      if (this.completed) {
        throw "already completed";
      } else {
        this.completed = true;
        this.value = value;
        this.observers.map((obs) => obs.on_complete(value));
      }
    }
    trigger_error(err) {
      if (this.completed) {
        throw "already completed";
      } else {
        this.completed = true;
        this.observers.map((obs) => {
          if (obs.on_error) {
            obs.on_error(err);
          } else {
            throw err;
          }
        });
      }
    }
    then(handler, err_handler) {
      var comp = new Completer();
      var on_error;
      if (err_handler) {
        on_error = err_handler;
      } else {
        on_error = (err) => comp.error(err);
      }
      this.observers.push(new FutureObserver(
        (value) => comp.complete(handler(value)),
        on_error
      ));
      return comp.future;
    }
    map(fun) {
      var comp = new Completer();
      this.then((value) => {
        comp.complete(fun(value));
        return null;
      });
      return comp.future;
    }
  };
  var FutureObserver = class {
    constructor(on_complete, on_error) {
      this.on_complete = on_complete;
      this.on_error = on_error;
    }
  };
  function range(num) {
    var result = [];
    for (var i = 0; i < num; i++) {
      result.push(i);
    }
    return result;
  }

  // src/script/reactive/browser.ts
  function bind_to_attribute(signal, element, attr_name) {
    element.setAttribute(attr_name, signal.value);
    signal.updates.listen((value) => {
      element.setAttribute(attr_name, signal.value);
    });
  }
  function bind_to_innerText(element, text) {
    element.innerText = text.value;
    text.updates.listen((value) => element.innerText = value);
  }
  var HTTP;
  ((HTTP2) => {
    function get(url) {
      var comp = new Completer();
      var req = new XMLHttpRequest();
      req.addEventListener("error", (err) => comp.error(err));
      req.addEventListener("abort", (err) => comp.error(err));
      req.addEventListener("timeout", (err) => comp.error(err));
      req.addEventListener("load", () => {
        if (req.status == 200) {
          comp.complete(req.responseText);
        } else {
          comp.error({
            status_code: req.status,
            body: req.responseText
          });
        }
      });
      req.open("get", url);
      req.send();
      return comp.future;
    }
    HTTP2.get = get;
  })(HTTP || (HTTP = {}));

  // src/script/river-graph.ts
  function loadData() {
    var paths = [
      "natural-earth/ne_10m_admin_1_states_provinces_shp",
      "natural-earth/ne_10m_urban_areas",
      "polygons",
      "edges",
      "nodes"
    ];
    var futures = paths.map((path) => HTTP.get("data/" + path + ".geojson").map(JSON.parse));
    return Future.all(futures).map((layers) => {
      return {
        admin1: layers[0].features,
        urban_areas: layers[1].features,
        watersheds: layers[2].features,
        edges: layers[3].features,
        nodes: layers[4].features
      };
    });
  }
  var View = class {
    createSVGElement(name) {
      return document.createElementNS("http://www.w3.org/2000/svg", name);
    }
  };
  var MapView = class extends View {
    constructor(layers) {
      super();
      this.layers = layers;
      this.selectedController = new SignalController(-1);
      this.selected = this.selectedController.signal;
      this.nodeSelectedSignals = {};
      layers.nodes.forEach((node) => {
        this.nodeSelectedSignals[node.properties.id] = this.selected.map((id) => id == node.properties.id);
      });
      this.hoveredController = new SignalController(null);
      this.hovered = this.hoveredController.signal;
      this.adj_list_downstream = buildAdjList(layers.nodes, layers.edges, layers.watersheds);
      this.adj_list_upstream = this.adj_list_downstream.reverse();
      this.signalSystem = this.buildSignalSystem();
      this.element = this.createSVGElement("svg");
      var layersGroup = this.createSVGElement("g");
      layersGroup.id = "layers";
      this.element.appendChild(layersGroup);
      var center = Signal.constant({ x: -19, y: 37.5 });
      var scale = Signal.constant(3200);
      scale.log("scale");
      var proj = Signal.derived([scale, center], (values) => {
        var scale2 = values[0];
        var center2 = values[1];
        return d3.geo.albers().scale(scale2).center([center2.x, center2.y]);
      });
      this.path = proj.map((proj2) => {
        return d3.geo.path().projection(proj2);
      });
      this.edges_by_id = {};
      layers.edges.forEach((edge) => {
        this.edges_by_id[edge.properties.id] = edge;
      });
      var admin1 = {
        name: "admin1",
        features: layers.admin1,
        view: (lv, feature) => new FeatureView(lv, feature)
      };
      var urban_areas = {
        name: "urban_areas",
        features: layers.urban_areas,
        view: (lv, feature) => new FeatureView(lv, feature)
      };
      var nodes = {
        name: "nodes",
        features: layers.nodes,
        view: (lv, feature) => new NodeView(lv, feature)
      };
      var edges = {
        name: "edges",
        features: layers.edges,
        view: (lv, feature) => new EdgeView(lv, feature)
      };
      var watersheds = {
        name: "watersheds",
        features: layers.watersheds,
        view: (lv, feature) => new WatershedView(lv, feature)
      };
      this.layerViews = [admin1, urban_areas, watersheds, edges, nodes].map((layer) => new LayerView(this, layer));
      this.layerViews.map((lv) => {
        layersGroup.appendChild(lv.element);
      });
      this.element.addEventListener("click", (_) => {
        this.selectedController.update(-1);
      });
    }
    buildSignalSystem() {
      var adj_list_downstream_copy = this.adj_list_downstream.copy();
      var order = [];
      var system_nodes = adj_list_downstream_copy.nodes();
      while (system_nodes.length > 0) {
        var node;
        for (var i = 0; i < system_nodes.length; i++) {
          node = system_nodes[i];
          if (adj_list_downstream_copy.getEdges(node).length == 0) {
            order.push(node);
            system_nodes.splice(i, 1);
            break;
          }
        }
        this.adj_list_upstream.getEdges(node).forEach((upstream_node) => {
          adj_list_downstream_copy.removeEdge(upstream_node, node);
        });
      }
      console.log(order);
      var system = new SignalSystem();
      order.forEach((element) => {
        var type = element[0];
        var id = parseInt(element.substr(1));
        switch (type) {
          case "n":
            var downstream_active = Signal.or(this.adj_list_downstream.getEdges("n" + id).map((key) => {
              assert(key[0] == "e", "nodes should only depend on edges");
              var eId = parseInt(key.substr(1));
              return system.edgesActive[eId];
            }));
            var selected = this.nodeSelectedSignals[id];
            selected.log("node" + id + " selected");
            system.nodesActive[id] = Signal.or([downstream_active, selected]);
            system.nodesActive[id].log("node" + id + " active");
            break;
          case "e":
            system.edgesActive[id] = system.nodesActive[parseInt(this.adj_list_downstream.getEdges("e" + id)[0].substr(1))];
            break;
          case "w":
            system.watershedsActive[id] = system.edgesActive[parseInt(this.adj_list_downstream.getEdges("w" + id)[0].substr(1))];
            break;
        }
      });
      return system;
    }
  };
  var LayerView = class extends View {
    constructor(mapView2, layer) {
      super();
      this.mapView = mapView2;
      this.layer = layer;
      this.element = this.createSVGElement("g");
      this.element.id = "layer-" + layer.name;
      this.featureViews = layer.features.map((feat) => layer.view(this, feat));
      this.featureViews.map((fv) => {
        this.element.appendChild(fv.element);
      });
    }
  };
  var AbsFeatureView = class extends View {
    constructor(layerView, feature) {
      super();
      this.layerView = layerView;
      this.feature = feature;
    }
  };
  var FeatureView = class extends AbsFeatureView {
    constructor(layerView, feature) {
      super(layerView, feature);
      this.element = this.createSVGElement("path");
      var svg_path = this.layerView.mapView.path.map((path) => {
        return path(this.feature);
      });
      this.element.setAttribute("d", svg_path.value);
      svg_path.updates.listen((path) => {
        this.element.setAttribute("d", path);
      });
    }
  };
  var SystemElementView = class extends FeatureView {
    constructor(layerView, feature, active) {
      super(layerView, feature);
      this.active = active;
      this.element.addEventListener("mouseenter", (evt) => {
        layerView.mapView.hoveredController.update(this.feature);
      });
    }
    bindActive(className) {
      var classNameSignal = this.active.map((active) => {
        if (active) {
          return className + " active";
        } else {
          return className;
        }
      });
      bind_to_attribute(classNameSignal, this.element, "class");
    }
  };
  var _NodeView = class extends AbsFeatureView {
    constructor(layerView, feature) {
      super(layerView, feature);
      var maxwidth = this.maxWidthOfConnectedEdges();
      layerView.mapView.path.value.pointRadius(Math.max(maxwidth, _NodeView.DEFAULT_POINT_RADIUS));
      this.element = this.createSVGElement("path");
      this.element.setAttribute("d", layerView.mapView.path.value(feature));
      layerView.mapView.path.value.pointRadius(_NodeView.DEFAULT_POINT_RADIUS);
      var active = layerView.mapView.signalSystem.nodesActive[feature.properties.id];
      var selected = layerView.mapView.nodeSelectedSignals[feature.properties.id];
      this.element.addEventListener("click", (evt) => {
        var mapview_selected = this.layerView.mapView.selected;
        var mapview_selected_controller = this.layerView.mapView.selectedController;
        if (mapview_selected.value == feature.properties.id) {
          mapview_selected_controller.update(-1);
        } else {
          mapview_selected_controller.update(feature.properties.id);
        }
        evt.stopPropagation();
      });
      var className = Signal.derived([active, selected], (values) => {
        var a = values[0];
        var s = values[1];
        var segments = ["node-view"];
        if (a) {
          segments.push("active");
        }
        if (s) {
          segments.push("selected");
        }
        return segments.join(" ");
      });
      bind_to_attribute(className, this.element, "class");
      this.element.addEventListener("mouseenter", (evt) => {
        layerView.mapView.hoveredController.update(this.feature);
      });
    }
    maxWidthOfConnectedEdges() {
      var upstream = this.layerView.mapView.adj_list_upstream.getEdges("n" + this.feature.properties.id);
      var downstream = this.layerView.mapView.adj_list_downstream.getEdges("n" + this.feature.properties.id);
      var all = upstream.concat(downstream).map((e) => parseInt(e.substr(1)));
      var edges = all.map((id) => this.layerView.mapView.edges_by_id[id]);
      console.log(edges);
      var widths = edges.map((edge) => EdgeView.EDGE_SCALE(edge.properties.flow_rate + 1) / 1.5);
      return max(widths);
    }
  };
  var NodeView = _NodeView;
  NodeView.DEFAULT_POINT_RADIUS = 5;
  var _EdgeView = class extends SystemElementView {
    constructor(layerView, feature) {
      super(layerView, feature, layerView.mapView.signalSystem.edgesActive[feature.properties.id]);
      this.element.setAttribute("stroke-width", _EdgeView.EDGE_SCALE(feature.properties.flow_rate + 1) + "px");
      this.bindActive("edge-view");
    }
  };
  var EdgeView = _EdgeView;
  EdgeView.EDGE_SCALE = (flow) => Math.max(5, d3.scale.log().domain([1, 11]).range([0, 20])(flow));
  var WatershedView = class extends SystemElementView {
    constructor(layerView, feature) {
      super(layerView, feature, layerView.mapView.signalSystem.watershedsActive[feature.properties.id]);
      this.bindActive("watershed-view");
    }
  };
  var AdjList = class {
    constructor() {
      this.edges = {};
    }
    initVertex(v) {
      if (this.edges[v] == void 0) {
        this.edges[v] = [];
      }
    }
    nodes() {
      var nodes = [];
      for (var i in this.edges) {
        nodes.push(i);
      }
      return nodes;
    }
    addEdge(from, to) {
      this.initVertex(from);
      this.initVertex(to);
      this.edges[from].push(to);
    }
    removeEdge(from, to) {
      var edges = this.edges[from];
      var idx = edges.indexOf(to);
      edges.splice(idx, 1);
    }
    getEdges(from) {
      var res = this.edges[from];
      if (res == void 0) {
        return [];
      } else {
        return res;
      }
    }
    copy() {
      var copy = new AdjList();
      this.nodes().forEach((from) => {
        this.getEdges(from).forEach((to) => {
          copy.addEdge(from, to);
        });
      });
      return copy;
    }
    reverse() {
      var reversed = new AdjList();
      this.nodes().forEach((from) => {
        this.getEdges(from).forEach((to) => {
          reversed.addEdge(to, from);
        });
      });
      return reversed;
    }
  };
  function assert(condition, message) {
    if (!condition) {
      throw message;
    }
  }
  function max(numbers) {
    var max2 = -Infinity;
    for (var i = 0; i < numbers.length; i++) {
      var num = numbers[i];
      if (num > max2) {
        max2 = num;
      }
    }
    return max2;
  }
  function buildAdjList(nodes, edges, watersheds) {
    var adj_list_downstream = new AdjList();
    edges.forEach((edge) => {
      adj_list_downstream.addEdge("e" + edge.properties.id, "n" + edge.properties.to_node);
      adj_list_downstream.addEdge("n" + edge.properties.from_node, "e" + edge.properties.id);
    });
    watersheds.forEach((watershed) => {
      adj_list_downstream.addEdge("w" + watershed.properties.id, "e" + watershed.properties.to_edge);
    });
    return adj_list_downstream;
  }
  var SignalSystem = class {
    constructor() {
      this.edgesActive = {};
      this.nodesActive = {};
      this.watershedsActive = {};
    }
  };
  var mapView;
  document.addEventListener("DOMContentLoaded", (_) => {
    var container = document.getElementById("mapview-container");
    loadData().then((layerData) => {
      mapView = new MapView(layerData);
      container.appendChild(mapView.element);
      var hoveredIndicator = document.getElementById("hovered-indicator");
      bind_to_innerText(hoveredIndicator, mapView.hovered.map((el) => {
        if (el) {
          var name = el.properties.name;
          if (el.properties.flow_rate) {
            return name + ". Flow rate: " + el.properties.flow_rate + " million acre feet / year";
          } else {
            return name;
          }
        } else {
          return "";
        }
      }));
      mapView.hovered.log("hovered");
      return null;
    });
  });
})();
