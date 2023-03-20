#!/bin/bash
node_modules/.bin/shp2json src/data/edges.shp > public/data/edges.geojson
node_modules/.bin/shp2json src/data/nodes.shp > public/data/nodes.geojson
node_modules/.bin/shp2json src/data/polygons.shp > public/data/polygons.geojson
node_modules/.bin/shp2json src/data/natural-earth/ne_10m_admin_1_states_provinces_shp.shp > public/data/natural-earth/ne_10m_admin_1_states_provinces_shp.geojson
node_modules/.bin/shp2json src/data/natural-earth/ne_10m_urban_areas.shp > public/data/natural-earth/ne_10m_urban_areas.geojson
