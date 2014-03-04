/// <reference path="reactive/models.ts"/>
/// <reference path="reactive/browser.ts"/>
/// <reference path="reactive/core.ts"/>
/// <reference path="geojson.ts"/>
/// <reference path="typings/d3/d3.d.ts"/>

class Layer<T extends GeoJSON.Feature> {
    constructor(public name:string, public features:Array<T>) {}
}


function loadLayers(paths:Array<string>) : Reactive.Future<Array<Layer<GeoJSON.Feature>>> {
    var futures = paths.map((path) => {
        return Reactive.Browser.HTTP.get('data/' + path + '.geojson')
            .map((text) => new Layer(
                path.split('/').reverse()[0],
                (<GeoJSON.FeatureCollection>JSON.parse(text)).features));
    });
    return Reactive.Future.all(futures);
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

    static PROJECTION : D3.Geo.Projection = d3.geo.albersUsa();
//        .scale(1000)
//        .center([-112.49144,36.90182]);
    static PATH = d3.geo.path().projection(MapView.PROJECTION);
    
    constructor(public layers:Array<Layer<GeoJSON.Feature>>) {
        super();
        this.layerViews = layers.map((layer) => new LayerView(this, layer));
        this.element = <SVGSVGElement>this.createSVGElement('svg');
//        this.element.setAttribute('width', '1000');
//        this.element.setAttribute('height', '800');
        var layersGroup = this.createSVGElement('g');
        layersGroup.id = 'layers';
        this.element.appendChild(layersGroup);
        this.layerViews.map((lv) => {
           layersGroup.appendChild(lv.element);
        });
    }

}

class LayerView<T extends GeoJSON.Feature> extends View {

    element : SVGGElement;
    featureViews : Array<FeatureView<T>>;

    constructor(public mapView:MapView, public layer:Layer<T>) {
        super();
        this.element = <SVGGElement>this.createSVGElement('g');
        this.element.id = 'layer-' + layer.name;
        this.featureViews = layer.features.map((feat) => new FeatureView<T>(this, feat));
        this.featureViews.map((fv) => {
           this.element.appendChild(fv.element);
        });
    }
    
}

class FeatureView<T extends GeoJSON.Feature> extends View {

    element : SVGPathElement;

    constructor(public layerView:LayerView<T>, public feature:T) {
        super();
        this.element = <SVGPathElement>this.createSVGElement('path');
        this.element.setAttribute('d', MapView.PATH(feature));
    }

}

document.addEventListener('DOMContentLoaded', (_) => {
    var container = document.getElementById('viz-container');
    var projection = d3.geo.albers();
	var path = d3.geo.path().projection(projection);
    // load data
    loadLayers(
        ['natural-earth/ne_10m_admin_1_states_provinces_shp',
         'natural-earth/ne_10m_urban_areas',
         'polygons',
         'edges',
         'nodes']).then((layers) => {
        var mapView = new MapView(layers);
        container.appendChild(mapView.element);
        return null
    });
});