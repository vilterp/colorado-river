/// <reference path="reactive/models.ts"/>
/// <reference path="reactive/browser.ts"/>
/// <reference path="reactive/core.ts"/>
/// <reference path="geojson.ts"/>
/// <reference path="typings/d3/d3.d.ts"/>

interface Layer<A extends GeoJSON.Feature> {
    name : string;
    features : Array<A>;
    view(layerView : LayerView<A>, feature : A) : FeatureView<A>;
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
    var futures = paths.map((path) => Reactive.Browser.HTTP.get('data/' + path + '.geojson').map(JSON.parse));
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

    static PROJECTION : D3.Geo.Projection = d3.geo.albersUsa();
//       .scale(1000)
//       .center([-112.49144,36.90182]);
    static PATH = d3.geo.path().projection(MapView.PROJECTION);

    constructor(public layers:LayerData) {
        super();
        this.selectedController = new Reactive.SignalController<number>(-1); // node id
        this.selected = this.selectedController.signal;
        // selected signals
        this.nodeSelectedSignals = {};
        layers.nodes.forEach((node) => {
           this.nodeSelectedSignals[node.properties.id] = this.selected.map((id) => id == node.properties.id);
        });
        this.signalSystem = topSortSystem(this.nodeSelectedSignals,
                                          layers.edges, layers.nodes, layers.watersheds);
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

        // initialize DOM
        this.element = <SVGSVGElement>this.createSVGElement('svg');
        var layersGroup = this.createSVGElement('g');
        layersGroup.id = 'layers';
        this.element.appendChild(layersGroup);
        this.layerViews.map((lv) => {
           layersGroup.appendChild(lv.element);
        });
        this.element.addEventListener('click', (_) => {
            this.selectedController.update(-1);
        });
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

class FeatureView<A extends GeoJSON.Feature> extends View {

    element : SVGPathElement;

    constructor(public layerView:LayerView<A>, public feature:A) {
        super();
        this.element = <SVGPathElement>this.createSVGElement('path');
        this.element.setAttribute('d', MapView.PATH(feature));
    }

}

class SystemElementView<A extends SystemElement> extends FeatureView<A> {

    constructor(layerView:LayerView<A>, feature:A, public active:Reactive.Signal<boolean>) {
        super(layerView, feature);
    }

    bindActive(className:string) {
        var classNameSignal = this.active.map((active) => {
            if(active) {
                return className + ' ' + 'active';
            } else {
                return className;
            }
        });
        Reactive.Browser.bind_to_attribute(classNameSignal, this.element, 'class');
    }

}

class NodeView extends SystemElementView<SystemNode> {

    constructor(layerView:LayerView<SystemNode>, feature:SystemNode) {
        super(layerView, feature, layerView.mapView.signalSystem.nodesActive[feature.properties.id]);
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
        this.bindActive('node-view');
    }

}

class EdgeView extends SystemElementView<SystemEdge> {

    constructor(layerView:LayerView<SystemEdge>, feature:SystemEdge) {
        super(layerView, feature, layerView.mapView.signalSystem.edgesActive[feature.properties.id]);
        this.bindActive('edge-view');
    }

}

class WatershedView extends SystemElementView<SystemWatershed> {

    constructor(layerView:LayerView<SystemWatershed>, feature:SystemWatershed) {
        super(layerView, feature, layerView.mapView.signalSystem.watershedsActive[feature.properties.id]);
        this.bindActive('watershed-view');
    }

}

interface SystemElement extends GeoJSON.Feature {}

interface SystemEdge extends SystemElement {
    properties: {
        id: number;
        from_node: number;
        to_node: number;
        name: string;
        type: string;
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
        var nodes = [];
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

function topSortSystem(node_selected_signals: {[id:number]: Reactive.Signal<boolean>},
                       edges: Array<SystemEdge>,
                       nodes: Array<SystemNode>,
                       watersheds: Array<SystemWatershed>):SignalSystem {
    // build adjacency list
    var adj_list_downstream = new AdjList(); // arrows point in water flow direction (downstream)
    edges.forEach((edge) => {
        adj_list_downstream.addEdge('e' + edge.properties.id, 'n' + edge.properties.to_node);
        adj_list_downstream.addEdge('n' + edge.properties.from_node, 'e' + edge.properties.id);
    });
    watersheds.forEach((watershed) => {
        adj_list_downstream.addEdge('w' + watershed.properties.id, 'e' + watershed.properties.to_edge);
    });
    var adj_list_upstream = adj_list_downstream.reverse();
    var adj_list_downstream_copy = adj_list_downstream.copy();

    // top sort
    var order = [];
    var system_nodes = adj_list_downstream.nodes();
    while(system_nodes.length > 0) {
        // find node with no out edges
        var node;
        for(var i = 0; i < system_nodes.length; i++) {
            node = system_nodes[i]; // f'ing javascript
            if(adj_list_downstream.getEdges(node).length == 0) {
                order.push(node);
                system_nodes.splice(i, 1);
                break;
            }
        }
        // given that this is a DAG, node will be set to something
        // remove all edges to node
        adj_list_upstream.getEdges(node).forEach((upstream_node) => {
            adj_list_downstream.removeEdge(upstream_node, node);
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
                var downstream_active = Reactive.Signal.or(adj_list_downstream.getEdges('n' + id).map((key) => {
                    assert(key[0] == 'e', 'nodes should only depend on edges');
                    var eId = parseInt(key.substr(1));
                    return system.edgesActive[eId];
                }));
                var selected = node_selected_signals[id];
                selected.log('node' + id + ' selected');
                system.nodesActive[id] = Reactive.Signal.or([downstream_active, selected]);
                system.nodesActive[id].log('node' + id + ' active');
                break;
            case 'e':
                // to_node
                // TODO: easier to get ahold of edge object & get to_node?
                system.edgesActive[id] = system.nodesActive[parseInt(adj_list_downstream_copy.getEdges('e' + id)[0].substr(1))];
                break;
            case 'w':
                // edge nodes...
                // TODO: same as above
                system.watershedsActive[id] = system.edgesActive[parseInt(adj_list_downstream_copy.getEdges('w' + id)[0].substr(1))];
                break;
        }
    });
    // return signal maps
    return system;
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
    var container = document.getElementById('viz-container');
    loadData().then((layerData) => {
        mapView = new MapView(layerData);
        container.appendChild(mapView.element);
        return null
    });
});