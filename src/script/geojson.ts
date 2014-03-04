// http://stackoverflow.com/questions/15550859/unresolved-push-method-because-of-strange-type-interfacing

module GeoJSON {

    export interface Position {
        (): number[];
    }

    export interface CoordinateArray {
        () : Position[];
    }

    export interface PolygonRings {
        (): Position[][];
    }

    export class GeometryType {
        public static Point: string = "Point";
        public static LineString: string = "LineString";
        public static Polygon: string = "Polygon";
        public static MultiPoint: string = "MultiPoint";
        public static MultiLineString: string = "MultiLineString";
        public static MultiPolygon: string = "MultiPolygon";
        public static MultiGeometry: string = "MultiGeometry";
    }

    export interface FeatureCollection {
        features: Array<Feature>
    }

    export interface Feature {
        geometry: Geometry
    }

    export interface Geometry {
        type?: string;
    }

    export interface Point extends Geometry {
        coordinates: Position;
    }

    export interface LineString extends Geometry {
        coordinates: CoordinateArray;
    }

    export interface Polygon extends Geometry {
        coordinates: PolygonRings;
    }

    export interface MultiPolygon extends Geometry {
        coordinates: PolygonRings[];
    }

    export interface MultiPoint extends Geometry {
        coordinates: CoordinateArray;
    }

    export interface MultiLineString extends Geometry {
        coordinates: PolygonRings;
    }

    export interface GeometryCollection extends Geometry {
        geometries: Geometry[];
    }
}