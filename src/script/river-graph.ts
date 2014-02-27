/// <reference path="reactive/models.ts"/>
/// <reference path="reactive/browser.ts"/>
/// <reference path="reactive/core.ts"/>
/// <reference path="geojson.ts"/>

document.addEventListener('DOMContentLoaded', (_) => {
    document.getElementById('message').innerText = 'sup';
    var input = document.getElementById('thing');
    var keyups = Reactive.Browser.from_event(input, 'keyup');
    keyups.log('keyups');
});

var layers = ['polygons', 'nodes'];
var futures = layers.map((layer) => Reactive.Browser.HTTP.get('data/' + layer + '.geojson'));

Reactive.Future.wait(futures)
    .map((geojsons) => geojsons.map(JSON.parse))
    .then((geojsons) => {console.log(geojsons); return null});
