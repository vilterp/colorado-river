all: builddir compile convert copy-lib copy-html

serve: all
	http-server build

copy-html: src/index.html
	cp src/index.html build/index.html
	cp src/style.css build/style.css

builddir:
	mkdir -p build/script
	mkdir -p build/data/natural-earth
	mkdir -p build/lib

SRC := find src/script -name "*.ts"

compile-watch: $(shell $(SRC))
	tsc --outDir build/script src/script/river-graph.ts --watch

compile: $(shell $(SRC))
	tsc --outDir build/script src/script/river-graph.ts

copy-lib: lib
	cp -R lib build

BOUNDING_BOX := src/data/boundingbox.shp

# TODO: topojson
convert: builddir build/data/polygons.geojson build/data/nodes.geojson build/data/edges.geojson build/data/natural-earth/ne_10m_admin_1_states_provinces_shp.geojson build/data/natural-earth/ne_10m_urban_areas.geojson

build/%.geojson: src/%.shp
	rm -f $@
	ogr2ogr -f GeoJSON -clipsrc $(BOUNDING_BOX) $@ $<

clean:
	rm -rf build
	mkdir build
