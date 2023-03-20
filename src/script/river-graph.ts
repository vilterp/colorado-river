import * as GeoJSON from "./geojson";
import * as Reactive from "./reactive/core";
import * as Browser from "./reactive/browser";
import * as d3 from "d3";

console.log(d3);

interface Layer<A extends GeoJSON.Feature> {
    name : string;
    features : Array<A>;
    view(layerView : LayerView<A>, feature : A) : AbsFeatureView<A>;
}

interface LayerData {
    admin1 : Array<GeoJSON.Feature>;
    urban_areas : Array<GeoJSON.Feature>;
    watersheds : Array<SystemWatershed>;
    edges : Array<SystemEdge>;
    nodes : Array<SystemNode>;
}

function loadData() : Reactive.Future<LayerData> {
    var paths = ['natural-earth/ne_10m_admin_1_states_provinces_shp',
                 'natural-earth/ne_10m_urban_areas',
                 'polygons',
                 'edges',
                 'nodes'];
    var futures = paths.map((path) => Browser.HTTP.get('data/' + path + '.geojson').map(JSON.parse));
    return Reactive.Future.all(futures).map((layers:Array<GeoJSON.FeatureCollection>) => {
        return {
            admin1: layers[0].features,
            urban_areas: layers[1].features,
            watersheds: <Array<SystemWatershed>> layers[2].features,
            edges: <Array<SystemEdge>> layers[3].features,
            nodes: <Array<SystemNode>> layers[4].features
        }
    });
}

interface AbsView {
    element : Element;
}

class View implements AbsView {
    element : Element;
    createSVGElement(name:string) : SVGElement {
        return <SVGElement>document.createElementNS('http://www.w3.org/2000/svg', name);
    }
}

class MapView extends View {
    
    layerViews : Array<LayerView<GeoJSON.Feature>>;
    element : SVGSVGElement;

    nodeSelectedSignals : {[id:number]: Reactive.Signal<boolean>};
    signalSystem : SignalSystem;
    selectedController : Reactive.SignalController<number>;
    selected : Reactive.Signal<number>;
    hoveredController : Reactive.SignalController<SystemElement>;
    hovered : Reactive.Signal<SystemElement>;

    adj_list_downstream : AdjList;
    adj_list_upstream : AdjList;

    path : Reactive.Signal<d3.GeoPath>;

    edges_by_id : {[edge_id : number] : SystemEdge};

    constructor(public layers:LayerData) {
        super();
        this.selectedController = new Reactive.SignalController<number>(-1); // node id
        this.selected = this.selectedController.signal;
        // selected signals
        this.nodeSelectedSignals = {};
        layers.nodes.forEach((node) => {
           this.nodeSelectedSignals[node.properties.id] = this.selected.map((id) => id == node.properties.id);
        });
        // hovered
        this.hoveredController = new Reactive.SignalController<SystemElement>(null);
        this.hovered = this.hoveredController.signal;
        // adj list & signal system
        this.adj_list_downstream = buildAdjList(layers.nodes, layers.edges, layers.watersheds);
        this.adj_list_upstream = this.adj_list_downstream.reverse();
        this.signalSystem = this.buildSignalSystem();
        // initialize DOM
        this.element = <SVGSVGElement>this.createSVGElement('svg');
        var layersGroup = this.createSVGElement('g');
        layersGroup.id = 'layers';
        this.element.appendChild(layersGroup);
        // initialize projection
        // trying to get the projection right
        var center = Reactive.Signal.constant({x: -19, y: 37.5});
//        var mousePos = Browser.mouse_pos(this.element);
//        var xscale = d3.scale.linear().domain([0, 800]).range([-180, 180]);
//        var yscale = d3.scale.linear().domain([0, 500]).range([-90, 90]);
//        var center = mousePos.map((pos) => { return { x: xscale(pos.x), y: yscale(pos.y) } });
//        center.log('center');
//        center.log('center');
//        var scale_scale = d3.scale.linear().domain([0, 600]).range([50, 3500]);
        var scale = Reactive.Signal.constant(3200);
        scale.log('scale');
        var proj = Reactive.Signal.derived([scale, center], (values) => {
            var scale = values[0];
            var center = values[1];
            return d3.geoAlbers().scale(scale).center([center.x, center.y]);
        });
        this.path = proj.map((proj) => {
            return d3.geoPath().projection(proj);
        });
        // build edges map
        this.edges_by_id = {};
        layers.edges.forEach((edge) => {
            this.edges_by_id[edge.properties.id] = edge;
        });
        // initialize layers...
        var admin1:Layer<GeoJSON.Feature> = {
            name: 'admin1',
            features: layers.admin1,
            view: (lv, feature) => new FeatureView(lv, feature)
        };
        var urban_areas:Layer<GeoJSON.Feature> = {
            name: 'urban_areas',
            features: layers.urban_areas,
            view: (lv, feature) => new FeatureView(lv, feature)
        };
        var nodes:Layer<SystemNode> = {
            name: 'nodes',
            features: layers.nodes,
            view: (lv, feature) => new NodeView(lv, feature)
        };
        var edges:Layer<SystemEdge> = {
            name: 'edges',
            features: layers.edges,
            view: (lv, feature) => new EdgeView(lv, feature)
        };
        var watersheds:Layer<SystemWatershed> = {
            name: 'watersheds',
            features: layers.watersheds,
            view: (lv, feature) => new WatershedView(lv, feature)
        };
        this.layerViews = [admin1, urban_areas, watersheds, edges, nodes].map((layer) =>
            new LayerView(this, layer));
        // add layer elements to DOM
        this.layerViews.map((lv) => {
           layersGroup.appendChild(lv.element);
        });
        this.element.addEventListener('click', (_) => {
            this.selectedController.update(-1);
        });
    }

    buildSignalSystem() {
        var adj_list_downstream_copy = this.adj_list_downstream.copy();
        // sort
        var order: string[] = [];
        var system_nodes = adj_list_downstream_copy.nodes();
        while(system_nodes.length > 0) {
            // find node with no out edges
            var node: string;
            for(var i = 0; i < system_nodes.length; i++) {
                node = system_nodes[i];
                if(adj_list_downstream_copy.getEdges(node).length == 0) {
                    order.push(node);
                    system_nodes.splice(i, 1);
                    break;
                }
            }
            // given that this is a DAG, node will be set to something
            // remove all edges to node
            this.adj_list_upstream.getEdges(node).forEach((upstream_node) => {
                adj_list_downstream_copy.removeEdge(upstream_node, node);
            });
        }
        console.log(order);
        // build signals
        var system = new SignalSystem();
        order.forEach((element) => {
            var type = element[0];
            var id = parseInt(element.substr(1));
            switch(type) {
                case 'n':
                    // or edge nodes
                    var downstream_active = Reactive.Signal.or(this.adj_list_downstream.getEdges('n' + id).map((key) => {
                        assert(key[0] == 'e', 'nodes should only depend on edges');
                        var eId = parseInt(key.substr(1));
                        return system.edgesActive[eId];
                    }));
                    var selected = this.nodeSelectedSignals[id];
                    selected.log('node' + id + ' selected');
                    system.nodesActive[id] = Reactive.Signal.or([downstream_active, selected]);
                    system.nodesActive[id].log('node' + id + ' active');
                    break;
                case 'e':
                    // to_node
                    // TODO: easier to get ahold of edge object & get to_node?
                    system.edgesActive[id] = system.nodesActive[parseInt(this.adj_list_downstream.getEdges('e' + id)[0].substr(1))];
                    break;
                case 'w':
                    // edge nodes...
                    // TODO: same as above
                    system.watershedsActive[id] = system.edgesActive[parseInt(this.adj_list_downstream.getEdges('w' + id)[0].substr(1))];
                    break;
            }
        });
        // return signal maps
        return system;
    }

}

class LayerView<A extends GeoJSON.Feature> extends View {

    element : SVGGElement;
    featureViews : Array<FeatureView<A>>;

    constructor(public mapView:MapView, public layer:Layer<A>) {
        super();
        this.element = <SVGGElement>this.createSVGElement('g');
        this.element.id = 'layer-' + layer.name;
        this.featureViews = layer.features.map((feat) => layer.view(this, feat));
        this.featureViews.map((fv) => {
           this.element.appendChild(fv.element);
        });
    }
    
}

class AbsFeatureView<A extends GeoJSON.Feature> extends View {

    element : SVGElement;

    constructor(public layerView:LayerView<A>, public feature:A) {
        super();
    }

}

class FeatureView<A extends GeoJSON.Feature> extends AbsFeatureView<A> {

    constructor(layerView:LayerView<A>, feature:A) {
        super(layerView, feature);
        this.element = <SVGPathElement>this.createSVGElement('path');
        var svg_path = this.layerView.mapView.path.map((path) => { return path(this.feature) });
        this.element.setAttribute('d', svg_path.value);
        svg_path.updates.listen((path) => {
           this.element.setAttribute('d', path);
        });
    }

}

class SystemElementView<A extends SystemElement> extends FeatureView<A> {

    constructor(layerView:LayerView<A>, feature:A, public active:Reactive.Signal<boolean>) {
        super(layerView, feature);
        this.element.addEventListener('mouseenter', (evt) => {
            layerView.mapView.hoveredController.update(this.feature);
        });
    }

    bindActive(className:string) {
        var classNameSignal = this.active.map((active) => {
            if(active) {
                return className + ' ' + 'active';
            } else {
                return className;
            }
        });
        Browser.bind_to_attribute(classNameSignal, this.element, 'class');
    }

}

class NodeView extends AbsFeatureView<SystemNode> {

    static DEFAULT_POINT_RADIUS = 5;

    constructor(layerView:LayerView<SystemNode>, feature:SystemNode) {
        super(layerView, feature);
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
        this.element.addEventListener('click', (evt) => {
            var mapview_selected = this.layerView.mapView.selected;
            var mapview_selected_controller = this.layerView.mapView.selectedController;
            if(mapview_selected.value == feature.properties.id) {
                // already selected, unselect self
                mapview_selected_controller.update(-1);
            } else {
                mapview_selected_controller.update(feature.properties.id);
            }
            evt.stopPropagation();
        });
        var className = Reactive.Signal.derived([active, selected], (values) => {
            var a = values[0];
            var s = values[1];
            var segments = ['node-view'];
            if(a) {
                segments.push('active');
            }
            if(s) {
                segments.push('selected');
            }
            return segments.join(' ');
        });
        Browser.bind_to_attribute(className, this.element, 'class');
        // hovered
        this.element.addEventListener('mouseenter', (evt) => {
            layerView.mapView.hoveredController.update(this.feature);
        });
    }

    maxWidthOfConnectedEdges() : number {
        // get list of edges
        var upstream = this.layerView.mapView.adj_list_upstream.getEdges('n' + this.feature.properties.id);
        var downstream = this.layerView.mapView.adj_list_downstream.getEdges('n' + this.feature.properties.id);
        var all = upstream.concat(downstream).map((e) => parseInt(e.substr(1)));
        var edges = all.map((id) => this.layerView.mapView.edges_by_id[id]);
        console.log(edges);
        var widths = edges.map((edge) => EdgeView.EDGE_SCALE(edge.properties.flow_rate + 1) / 1.5);
        return max(widths);
    }

}

class EdgeView extends SystemElementView<SystemEdge> {

    static EDGE_SCALE = (flow) => Math.max(5, d3.scaleLog().domain([1, 11]).range([0, 20])(flow));

    constructor(layerView:LayerView<SystemEdge>, feature:SystemEdge) {
        super(layerView, feature, layerView.mapView.signalSystem.edgesActive[feature.properties.id]);
        this.element.setAttribute('stroke-width', EdgeView.EDGE_SCALE(feature.properties.flow_rate + 1) + 'px');
        this.bindActive('edge-view');
    }

}

class WatershedView extends SystemElementView<SystemWatershed> {

    constructor(layerView:LayerView<SystemWatershed>, feature:SystemWatershed) {
        super(layerView, feature, layerView.mapView.signalSystem.watershedsActive[feature.properties.id]);
        this.bindActive('watershed-view');
    }

}

interface SystemElement extends GeoJSON.Feature {
    properties: {
        name: string;
    }
}

interface SystemEdge extends SystemElement {
    properties: {
        id: number;
        from_node: number;
        to_node: number;
        name: string;
        type: string;
        flow_rate: number;
    };
}

interface SystemNode extends SystemElement {
    properties: {
        id: number;
        name: string;
    }
}

interface SystemWatershed extends SystemElement {
    properties: {
        id: number;
        to_edge: number;
        name: string;
    }
}

// TODO: this class wouldn't be hard to get right if JS came with real data structures (set, map)
class AdjList {

    edges : {[from:string]: Array<string>};

    constructor() {
        this.edges = {};
    }

    private initVertex(v:string) {
        if(this.edges[v] == undefined) {
            this.edges[v] = [];
        }
    }

    nodes():Array<string> {
        var nodes: string[] = [];
        for(var i in this.edges) {
            nodes.push(i);
        }
        return nodes;
    }

    addEdge(from:string, to:string) {
        this.initVertex(from);
        this.initVertex(to);
        this.edges[from].push(to);
    }

    removeEdge(from:string, to:string) {
        // TODO: error checking... js needs real sets... ugh
        var edges = this.edges[from];
        var idx = edges.indexOf(to);
        edges.splice(idx, 1);
    }

    getEdges(from:string) {
        var res = this.edges[from];
        if(res == undefined) {
            return [];
        } else {
            return res;
        }
    }

    copy() : AdjList {
        var copy = new AdjList();
        this.nodes().forEach((from) => {
            this.getEdges(from).forEach((to) => {
                copy.addEdge(from, to);
            })
        });
        return copy;
    }

    reverse() : AdjList {
        var reversed = new AdjList();
        this.nodes().forEach((from) => {
            this.getEdges(from).forEach((to) => {
                reversed.addEdge(to, from);
            })
        });
        return reversed;
    }

}

function assert(condition, message) {
    if(!condition) {
        throw message;
    }
}

function max(numbers) {
    var max = -Infinity;
    for(var i=0; i < numbers.length; i++) {
        var num = numbers[i];
        if(num > max) {
            max = num;
        }
    }
    return max;
}

function buildAdjList(nodes:Array<SystemNode>, edges:Array<SystemEdge>, watersheds:Array<SystemWatershed>) {
    // build adjacency list
    var adj_list_downstream = new AdjList(); // arrows point in water flow direction (downstream)
    edges.forEach((edge) => {
        adj_list_downstream.addEdge('e' + edge.properties.id, 'n' + edge.properties.to_node);
        adj_list_downstream.addEdge('n' + edge.properties.from_node, 'e' + edge.properties.id);
    });
    watersheds.forEach((watershed) => {
        adj_list_downstream.addEdge('w' + watershed.properties.id, 'e' + watershed.properties.to_edge);
    });
    return adj_list_downstream;
}

class SignalSystem {

    edgesActive : {[id:number]: Reactive.Signal<boolean>};
    nodesActive : {[id:number]: Reactive.Signal<boolean>};
    watershedsActive : {[id:number]: Reactive.Signal<boolean>};

    constructor() {
        this.edgesActive = {};
        this.nodesActive = {};
        this.watershedsActive = {};
    }

}

var mapView;

document.addEventListener('DOMContentLoaded', (_) => {
    var container = document.getElementById('mapview-container');
    loadData().then((layerData) => {
        mapView = new MapView(layerData);
        container.appendChild(mapView.element);
        var hoveredIndicator = document.getElementById('hovered-indicator');
        Browser.bind_to_innerText(hoveredIndicator, mapView.hovered.map((el) => {
            if(el) {
                var name = el.properties.name;
                if(el.properties.flow_rate) {
                    return name + ". Flow rate: " + el.properties.flow_rate + " million acre feet / year";
                } else {
                    return name;
                }
            } else {
                return "";
            }
        }));
        mapView.hovered.log('hovered');
        return null;
    });
});
