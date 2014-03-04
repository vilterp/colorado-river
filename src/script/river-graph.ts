/// <reference path="reactive/models.ts"/>
/// <reference path="reactive/browser.ts"/>
/// <reference path="reactive/core.ts"/>
/// <reference path="geojson.ts"/>
/// <reference path="typings/d3/d3.d.ts"/>

class Layer {
    constructor(public className:string, public featureCollection:GeoJSON.FeatureCollection) {}
}


function loadLayers(paths:Array<string>) : Reactive.Future<Array<Layer>> {
    var futures = paths.map((path) => {
        return Reactive.Browser.HTTP.get('data/' + path + '.geojson')
            .map((text) => new Layer(path.split('/').reverse()[0], JSON.parse(text)));
    });
    return Reactive.Future.all(futures);
}

class MapView {
    constructor(public parent:HTMLElement, public layers:Array<Layer>) {}
}

document.addEventListener('DOMContentLoaded', (_) => {
    var container = document.getElementById('viz-container');
    var svg = d3.select('#viz-container').append('svg');
    var projection = d3.geo.albers();
//        .scale(1000)
//        .center([-112.49144,36.90182]);
	var path = d3.geo.path().projection(projection);
    // load data
    loadLayers(
        ['natural-earth/ne_10m_admin_1_states_provinces_shp',
         'natural-earth/ne_10m_urban_areas',
         'polygons',
         'edges',
         'nodes']).then((layers) => {
        for(var i in layers) {
            var layer = layers[i];
            svg.append('g').attr('class', layer.className)
                .selectAll('path')
                    .data(layer.featureCollection.features)
                .enter().append('path')
                    .attr('d', path);
        }
        return null
    });
});