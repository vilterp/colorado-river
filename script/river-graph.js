/// <reference path="reactive/models.ts"/>
/// <reference path="reactive/browser.ts"/>
/// <reference path="reactive/core.ts"/>
/// <reference path="geojson.ts"/>
/// <reference path="typings/d3/d3.d.ts"/>
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
function loadData() {
    var paths = ['natural-earth/ne_10m_admin_1_states_provinces_shp',
        'natural-earth/ne_10m_urban_areas',
        'polygons',
        'edges',
        'nodes'];
    var futures = paths.map(function (path) { return Reactive.Browser.HTTP.get('data/' + path + '.geojson').map(JSON.parse); });
    return Reactive.Future.all(futures).map(function (layers) {
        return {
            admin1: layers[0].features,
            urban_areas: layers[1].features,
            watersheds: layers[2].features,
            edges: layers[3].features,
            nodes: layers[4].features
        };
    });
}
var View = (function () {
    function View() {
    }
    View.prototype.createSVGElement = function (name) {
        return document.createElementNS('http://www.w3.org/2000/svg', name);
    };
    return View;
}());
var MapView = (function (_super) {
    __extends(MapView, _super);
    function MapView(layers) {
        var _this = this;
        _super.call(this);
        this.layers = layers;
        this.selectedController = new Reactive.SignalController(-1); // node id
        this.selected = this.selectedController.signal;
        // selected signals
        this.nodeSelectedSignals = {};
        layers.nodes.forEach(function (node) {
            _this.nodeSelectedSignals[node.properties.id] = _this.selected.map(function (id) { return id == node.properties.id; });
        });
        // hovered
        this.hoveredController = new Reactive.SignalController(null);
        this.hovered = this.hoveredController.signal;
        // adj list & signal system
        this.adj_list_downstream = buildAdjList(layers.nodes, layers.edges, layers.watersheds);
        this.adj_list_upstream = this.adj_list_downstream.reverse();
        this.signalSystem = this.buildSignalSystem();
        // initialize DOM
        this.element = this.createSVGElement('svg');
        var layersGroup = this.createSVGElement('g');
        layersGroup.id = 'layers';
        this.element.appendChild(layersGroup);
        // initialize projection
        // trying to get the projection right
        var center = Reactive.Signal.constant({ x: -19, y: 37.5 });
        //        var mousePos = Reactive.Browser.mouse_pos(this.element);
        //        var xscale = d3.scale.linear().domain([0, 800]).range([-180, 180]);
        //        var yscale = d3.scale.linear().domain([0, 500]).range([-90, 90]);
        //        var center = mousePos.map((pos) => { return { x: xscale(pos.x), y: yscale(pos.y) } });
        //        center.log('center');
        //        center.log('center');
        //        var scale_scale = d3.scale.linear().domain([0, 600]).range([50, 3500]);
        var scale = Reactive.Signal.constant(3200);
        scale.log('scale');
        var proj = Reactive.Signal.derived([scale, center], function (values) {
            var scale = values[0];
            var center = values[1];
            return d3.geo.albers().scale(scale).center([center.x, center.y]);
        });
        this.path = proj.map(function (proj) {
            return d3.geo.path().projection(proj);
        });
        // build edges map
        this.edges_by_id = {};
        layers.edges.forEach(function (edge) {
            _this.edges_by_id[edge.properties.id] = edge;
        });
        // initialize layers...
        var admin1 = {
            name: 'admin1',
            features: layers.admin1,
            view: function (lv, feature) { return new FeatureView(lv, feature); }
        };
        var urban_areas = {
            name: 'urban_areas',
            features: layers.urban_areas,
            view: function (lv, feature) { return new FeatureView(lv, feature); }
        };
        var nodes = {
            name: 'nodes',
            features: layers.nodes,
            view: function (lv, feature) { return new NodeView(lv, feature); }
        };
        var edges = {
            name: 'edges',
            features: layers.edges,
            view: function (lv, feature) { return new EdgeView(lv, feature); }
        };
        var watersheds = {
            name: 'watersheds',
            features: layers.watersheds,
            view: function (lv, feature) { return new WatershedView(lv, feature); }
        };
        this.layerViews = [admin1, urban_areas, watersheds, edges, nodes].map(function (layer) {
            return new LayerView(_this, layer);
        });
        // add layer elements to DOM
        this.layerViews.map(function (lv) {
            layersGroup.appendChild(lv.element);
        });
        this.element.addEventListener('click', function (_) {
            _this.selectedController.update(-1);
        });
    }
    MapView.prototype.buildSignalSystem = function () {
        var _this = this;
        var adj_list_downstream_copy = this.adj_list_downstream.copy();
        // sort
        var order = [];
        var system_nodes = adj_list_downstream_copy.nodes();
        while (system_nodes.length > 0) {
            // find node with no out edges
            var node;
            for (var i = 0; i < system_nodes.length; i++) {
                node = system_nodes[i];
                if (adj_list_downstream_copy.getEdges(node).length == 0) {
                    order.push(node);
                    system_nodes.splice(i, 1);
                    break;
                }
            }
            // given that this is a DAG, node will be set to something
            // remove all edges to node
            this.adj_list_upstream.getEdges(node).forEach(function (upstream_node) {
                adj_list_downstream_copy.removeEdge(upstream_node, node);
            });
        }
        console.log(order);
        // build signals
        var system = new SignalSystem();
        order.forEach(function (element) {
            var type = element[0];
            var id = parseInt(element.substr(1));
            switch (type) {
                case 'n':
                    // or edge nodes
                    var downstream_active = Reactive.Signal.or(_this.adj_list_downstream.getEdges('n' + id).map(function (key) {
                        assert(key[0] == 'e', 'nodes should only depend on edges');
                        var eId = parseInt(key.substr(1));
                        return system.edgesActive[eId];
                    }));
                    var selected = _this.nodeSelectedSignals[id];
                    selected.log('node' + id + ' selected');
                    system.nodesActive[id] = Reactive.Signal.or([downstream_active, selected]);
                    system.nodesActive[id].log('node' + id + ' active');
                    break;
                case 'e':
                    // to_node
                    // TODO: easier to get ahold of edge object & get to_node?
                    system.edgesActive[id] = system.nodesActive[parseInt(_this.adj_list_downstream.getEdges('e' + id)[0].substr(1))];
                    break;
                case 'w':
                    // edge nodes...
                    // TODO: same as above
                    system.watershedsActive[id] = system.edgesActive[parseInt(_this.adj_list_downstream.getEdges('w' + id)[0].substr(1))];
                    break;
            }
        });
        // return signal maps
        return system;
    };
    return MapView;
}(View));
var LayerView = (function (_super) {
    __extends(LayerView, _super);
    function LayerView(mapView, layer) {
        var _this = this;
        _super.call(this);
        this.mapView = mapView;
        this.layer = layer;
        this.element = this.createSVGElement('g');
        this.element.id = 'layer-' + layer.name;
        this.featureViews = layer.features.map(function (feat) { return layer.view(_this, feat); });
        this.featureViews.map(function (fv) {
            _this.element.appendChild(fv.element);
        });
    }
    return LayerView;
}(View));
var AbsFeatureView = (function (_super) {
    __extends(AbsFeatureView, _super);
    function AbsFeatureView(layerView, feature) {
        _super.call(this);
        this.layerView = layerView;
        this.feature = feature;
    }
    return AbsFeatureView;
}(View));
var FeatureView = (function (_super) {
    __extends(FeatureView, _super);
    function FeatureView(layerView, feature) {
        var _this = this;
        _super.call(this, layerView, feature);
        this.element = this.createSVGElement('path');
        var svg_path = this.layerView.mapView.path.map(function (path) { return path(_this.feature); });
        this.element.setAttribute('d', svg_path.value);
        svg_path.updates.listen(function (path) {
            _this.element.setAttribute('d', path);
        });
    }
    return FeatureView;
}(AbsFeatureView));
var SystemElementView = (function (_super) {
    __extends(SystemElementView, _super);
    function SystemElementView(layerView, feature, active) {
        var _this = this;
        _super.call(this, layerView, feature);
        this.active = active;
        this.element.addEventListener('mouseenter', function (evt) {
            layerView.mapView.hoveredController.update(_this.feature);
        });
    }
    SystemElementView.prototype.bindActive = function (className) {
        var classNameSignal = this.active.map(function (active) {
            if (active) {
                return className + ' ' + 'active';
            }
            else {
                return className;
            }
        });
        Reactive.Browser.bind_to_attribute(classNameSignal, this.element, 'class');
    };
    return SystemElementView;
}(FeatureView));
var NodeView = (function (_super) {
    __extends(NodeView, _super);
    function NodeView(layerView, feature) {
        var _this = this;
        _super.call(this, layerView, feature);
        // point radius: max of edge widths
        var maxwidth = this.maxWidthOfConnectedEdges();
        layerView.mapView.path.value.pointRadius(Math.max(maxwidth, NodeView.DEFAULT_POINT_RADIUS));
        // initialize element
        this.element = this.createSVGElement('path');
        this.element.setAttribute('d', layerView.mapView.path.value(feature));
        layerView.mapView.path.value.pointRadius(NodeView.DEFAULT_POINT_RADIUS);
        // signals
        var active = layerView.mapView.signalSystem.nodesActive[feature.properties.id];
        var selected = layerView.mapView.nodeSelectedSignals[feature.properties.id];
        this.element.addEventListener('click', function (evt) {
            var mapview_selected = _this.layerView.mapView.selected;
            var mapview_selected_controller = _this.layerView.mapView.selectedController;
            if (mapview_selected.value == feature.properties.id) {
                // already selected, unselect self
                mapview_selected_controller.update(-1);
            }
            else {
                mapview_selected_controller.update(feature.properties.id);
            }
            evt.stopPropagation();
        });
        var className = Reactive.Signal.derived([active, selected], function (values) {
            var a = values[0];
            var s = values[1];
            var segments = ['node-view'];
            if (a) {
                segments.push('active');
            }
            if (s) {
                segments.push('selected');
            }
            return segments.join(' ');
        });
        Reactive.Browser.bind_to_attribute(className, this.element, 'class');
        // hovered
        this.element.addEventListener('mouseenter', function (evt) {
            layerView.mapView.hoveredController.update(_this.feature);
        });
    }
    NodeView.prototype.maxWidthOfConnectedEdges = function () {
        var _this = this;
        // get list of edges
        var upstream = this.layerView.mapView.adj_list_upstream.getEdges('n' + this.feature.properties.id);
        var downstream = this.layerView.mapView.adj_list_downstream.getEdges('n' + this.feature.properties.id);
        var all = upstream.concat(downstream).map(function (e) { return parseInt(e.substr(1)); });
        var edges = all.map(function (id) { return _this.layerView.mapView.edges_by_id[id]; });
        console.log(edges);
        var widths = edges.map(function (edge) { return EdgeView.EDGE_SCALE(edge.properties.flow_rate + 1) / 1.5; });
        return max(widths);
    };
    NodeView.DEFAULT_POINT_RADIUS = 5;
    return NodeView;
}(AbsFeatureView));
var EdgeView = (function (_super) {
    __extends(EdgeView, _super);
    function EdgeView(layerView, feature) {
        _super.call(this, layerView, feature, layerView.mapView.signalSystem.edgesActive[feature.properties.id]);
        this.element.setAttribute('stroke-width', EdgeView.EDGE_SCALE(feature.properties.flow_rate + 1) + 'px');
        this.bindActive('edge-view');
    }
    EdgeView.EDGE_SCALE = function (flow) { return Math.max(5, d3.scale.log().domain([1, 11]).range([0, 20])(flow)); };
    return EdgeView;
}(SystemElementView));
var WatershedView = (function (_super) {
    __extends(WatershedView, _super);
    function WatershedView(layerView, feature) {
        _super.call(this, layerView, feature, layerView.mapView.signalSystem.watershedsActive[feature.properties.id]);
        this.bindActive('watershed-view');
    }
    return WatershedView;
}(SystemElementView));
// TODO: this class wouldn't be hard to get right if JS came with real data structures (set, map)
var AdjList = (function () {
    function AdjList() {
        this.edges = {};
    }
    AdjList.prototype.initVertex = function (v) {
        if (this.edges[v] == undefined) {
            this.edges[v] = [];
        }
    };
    AdjList.prototype.nodes = function () {
        var nodes = [];
        for (var i in this.edges) {
            nodes.push(i);
        }
        return nodes;
    };
    AdjList.prototype.addEdge = function (from, to) {
        this.initVertex(from);
        this.initVertex(to);
        this.edges[from].push(to);
    };
    AdjList.prototype.removeEdge = function (from, to) {
        // TODO: error checking... js needs real sets... ugh
        var edges = this.edges[from];
        var idx = edges.indexOf(to);
        edges.splice(idx, 1);
    };
    AdjList.prototype.getEdges = function (from) {
        var res = this.edges[from];
        if (res == undefined) {
            return [];
        }
        else {
            return res;
        }
    };
    AdjList.prototype.copy = function () {
        var _this = this;
        var copy = new AdjList();
        this.nodes().forEach(function (from) {
            _this.getEdges(from).forEach(function (to) {
                copy.addEdge(from, to);
            });
        });
        return copy;
    };
    AdjList.prototype.reverse = function () {
        var _this = this;
        var reversed = new AdjList();
        this.nodes().forEach(function (from) {
            _this.getEdges(from).forEach(function (to) {
                reversed.addEdge(to, from);
            });
        });
        return reversed;
    };
    return AdjList;
}());
function assert(condition, message) {
    if (!condition) {
        throw message;
    }
}
function max(numbers) {
    var max = -Infinity;
    for (var i = 0; i < numbers.length; i++) {
        var num = numbers[i];
        if (num > max) {
            max = num;
        }
    }
    return max;
}
function buildAdjList(nodes, edges, watersheds) {
    // build adjacency list
    var adj_list_downstream = new AdjList(); // arrows point in water flow direction (downstream)
    edges.forEach(function (edge) {
        adj_list_downstream.addEdge('e' + edge.properties.id, 'n' + edge.properties.to_node);
        adj_list_downstream.addEdge('n' + edge.properties.from_node, 'e' + edge.properties.id);
    });
    watersheds.forEach(function (watershed) {
        adj_list_downstream.addEdge('w' + watershed.properties.id, 'e' + watershed.properties.to_edge);
    });
    return adj_list_downstream;
}
var SignalSystem = (function () {
    function SignalSystem() {
        this.edgesActive = {};
        this.nodesActive = {};
        this.watershedsActive = {};
    }
    return SignalSystem;
}());
var mapView;
document.addEventListener('DOMContentLoaded', function (_) {
    var container = document.getElementById('mapview-container');
    loadData().then(function (layerData) {
        mapView = new MapView(layerData);
        container.appendChild(mapView.element);
        var hoveredIndicator = document.getElementById('hovered-indicator');
        Reactive.Browser.bind_to_innerText(hoveredIndicator, mapView.hovered.map(function (el) {
            if (el) {
                var name = el.properties.name;
                if (el.properties.flow_rate) {
                    return name + ". Flow rate: " + el.properties.flow_rate + " million acre feet / year";
                }
                else {
                    return name;
                }
            }
            else {
                return "";
            }
        }));
        mapView.hovered.log('hovered');
        return null;
    });
});
