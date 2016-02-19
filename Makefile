all: site/main.css site/data.csv

lib:
	../tools/bin/embed.py site/index.html

watch:
	sass --watch scss/main.scss:site/main.css --style compressed

.PHONY: all lib watch

site/main.css: scss/main.scss
	sass $<:$@ --style compressed

site/data.csv: bin/process-data.py data/household_quantity.csv
	$^ > "$@"
