/// <reference path="reactive/models.ts"/>
/// <reference path="reactive/browser.ts"/>
/// <reference path="reactive/core.ts"/>
/// <reference path="geojson.ts"/>
/// <reference path="typings/d3/d3.d.ts"/>

interface LayerSpec {
    path : string;
    name : string; // used for SVG id
    view(layerView : LayerView, feature : GeoJSON.Feature) : FeatureView;
}

interface Layer {
    spec : LayerSpec;
    features : Array<GeoJSON.Feature>;
}

var layers:Array<LayerSpec> = [
    {
        path: 'natural-earth/ne_10m_admin_1_states_provinces_shp',
        name: 'admin1',
        view: (lv, feature) => new FeatureView(lv, feature)
    },
    {
        path: 'natural-earth/ne_10m_urban_areas',
        name: 'urban_areas',
        view: (lv, feature) => new FeatureView(lv, feature)
    },
    {
        path: 'polygons',
        name: 'polygons',
        view: (lv, feature) => new WatershedView(lv, feature)
    },
    {
        path: 'edges',
        name: 'edges',
        view: (lv, feature) => new EdgeView(lv, feature)
    },
    {
        path: 'nodes',
        name: 'nodes',
        view: (lv, feature) => new NodeView(lv, feature)
    }
];

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
    
    layerViews : Array<LayerView>;
    element : SVGSVGElement;

    static PROJECTION : D3.Geo.Projection = d3.geo.albersUsa();
//        .scale(1000)
//        .center([-112.49144,36.90182]);
    static PATH = d3.geo.path().projection(MapView.PROJECTION);
    
    constructor(public layers:Array<Layer>) {
        super();
        this.layerViews = layers.map((layer) => new LayerView(this, layer));
        this.element = <SVGSVGElement>this.createSVGElement('svg');
        var layersGroup = this.createSVGElement('g');
        layersGroup.id = 'layers';
        this.element.appendChild(layersGroup);
        this.layerViews.map((lv) => {
           layersGroup.appendChild(lv.element);
        });
    }

}

class LayerView extends View {

    element : SVGGElement;
    featureViews : Array<FeatureView>;

    constructor(public mapView:MapView, public layer:Layer) {
        super();
        this.element = <SVGGElement>this.createSVGElement('g');
        this.element.id = 'layer-' + layer.spec.name;
        this.featureViews = layer.features.map((feat) => layer.spec.view(this, feat));
        this.featureViews.map((fv) => {
           this.element.appendChild(fv.element);
        });
    }
    
}

class FeatureView extends View {

    element : SVGPathElement;

    constructor(public layerView:LayerView, public feature:GeoJSON.Feature) {
        super();
        this.element = <SVGPathElement>this.createSVGElement('path');
        this.element.setAttribute('d', MapView.PATH(feature));
    }

}

class NodeView extends FeatureView {

    constructor(public layerView:LayerView, public feature:GeoJSON.Feature) {
        super(layerView, feature);

    }

}

class EdgeView extends FeatureView {

}

class WatershedView extends FeatureView {

}

interface SystemEdge {
    id: number;
    from_node: number;
    to_node: number;
    watershed: number;
    name: string;
    type: string;
}

interface SystemNode {
    id: number;
    name: string;
}

interface Watershed {
    HUC6: number
}

class System {

    edgesActive : {[id:number]: Reactive.Signal<boolean>};
    nodesActive : {[id:number]: Reactive.Signal<boolean>};
    polygonsActive : {[id:number]: Reactive.Signal<boolean>};

    constructor(edges : Array<SystemEdge>, nodes : Array<SystemNode>, watersheds : Array<Watershed>) {
//        var graph : {[string: ]}
    }

}

document.addEventListener('DOMContentLoaded', (_) => {
    var container = document.getElementById('viz-container');
    var projection = d3.geo.albers();
	var path = d3.geo.path().projection(projection);
    // load data
    Reactive.Future.all(layers.map((layerspec) =>
        Reactive.Browser.HTTP.get('data/' + layerspec.path + '.geojson')
            .map(JSON.parse)
            .map((features:GeoJSON.FeatureCollection) => {
                return {
                    spec: layerspec,
                    features: features.features
                }
            })
        )
    ).then((layers) => {
        var mapView = new MapView(layers);
        container.appendChild(mapView.element);
        return null
    });
});