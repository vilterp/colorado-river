all: builddir compile convert copy-lib copy-html

serve: all
	http-server build

copy-html: src/index.html
	cp src/index.html build/index.html
	cp src/style.css build/style.css

builddir:
	mkdir -p build/script
	mkdir -p build/data
	mkdir -p build/lib

SRC := find src/script -name "*.ts"

compile-watch: $(shell $(SRC))
	tsc --outDir build/script src/script/river-graph.ts --watch

compile: $(shell $(SRC))
	tsc --outDir build/script src/script/river-graph.ts

copy-lib: lib
	cp -R lib build

# TODO: dry this up
DATA := find src/data -name "*.shp"

BOUNDING_BOX := src/data/boundingbox.shp

convert: $(shell $(DATA))
	rm -rf build/data
	mkdir -p build/data
	mkdir build/data/natural-earth
	ogr2ogr -f GeoJSON build/data/polygons.geojson src/data/polygons.shp
	ogr2ogr -f GeoJSON build/data/nodes.geojson src/data/nodes.shp
	ogr2ogr -f GeoJSON build/data/edges.geojson src/data/edges.shp
	# natural earth data
	ogr2ogr -f GeoJSON -clipsrc $(BOUNDING_BOX) build/data/natural-earth/admin_1.geojson src/data/natural-earth/ne_10m_admin_1_states_provinces_shp.shp
	ogr2ogr -f GeoJSON -clipsrc $(BOUNDING_BOX) build/data/natural-earth/urban_areas.geojson src/data/natural-earth/ne_10m_urban_areas.shp

clean:
	rm -rf build
	mkdir build
