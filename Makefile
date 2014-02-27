all: builddir compile convert copy-lib copy-html

copy-html: src/index.html
	cp src/index.html build/index.html

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

convert: $(shell $(DATA))
	rm -rf build/data
	mkdir -p build/data
	ogr2ogr -f GeoJSON build/data/polygons.geojson src/data/polygons.shp
	ogr2ogr -f GeoJSON build/data/nodes.geojson src/data/nodes.shp

clean:
	rm -rf build
	mkdir build
