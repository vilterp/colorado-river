// http://stackoverflow.com/questions/15550859/unresolved-push-method-because-of-strange-type-interfacing
var GeoJSON;
(function (GeoJSON) {
    var GeometryType = (function () {
        function GeometryType() {
        }
        GeometryType.Point = "Point";
        GeometryType.LineString = "LineString";
        GeometryType.Polygon = "Polygon";
        GeometryType.MultiPoint = "MultiPoint";
        GeometryType.MultiLineString = "MultiLineString";
        GeometryType.MultiPolygon = "MultiPolygon";
        GeometryType.MultiGeometry = "MultiGeometry";
        return GeometryType;
    }());
    GeoJSON.GeometryType = GeometryType;
})(GeoJSON || (GeoJSON = {}));
