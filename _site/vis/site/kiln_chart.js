if (!window.hasOwnProperty("Kiln")) window.Kiln = {};
Kiln.chart = (function() {
	var VERSION = "0.3-dev";

	var next_unique_id = 1;

	function v(x, d, i) {
		return typeof x === "function" ? x(d, i) : x;
	}

	function Chart(selector) {
		this._margin = { top: 15, right: 15, bottom: 30, left: 30 };
		this.container = d3.select(selector);
		if (this.container.empty()) throw "Selector did not match: " + selector;
		this.updated = {};

		this.unique_id = next_unique_id++;

		// The default behaviour is to use the width and height of the container
		// element. But (on Chrome at least) it is inefficient to get these dimensions,
		// so optionally we allow the user to specify them here.
		this._width = null;
		this._height = null;

		this._data = [];
		this._dataMap = null;
		this._mode = "line";
		this._xDomain = null;
		this._xLabel = null;
		this._yDomain = null;
		this._yLabel = null;
		this._x = default_x_accessor;
		this._y = default_y_accessor;
		this._name = default_name_accessor;
		this._value = default_value_accessor;
		this._r = 5;
		this._barPadding = 5;
		this._barNamePadding = 5;
		this._barValues = false;
		this._barValuesPrecision = 1;
		this._barValuesUnit = null;
		this._xScale = d3.scale.linear;
		this._xScaleNice = false;
		this._yScale = d3.scale.linear;
		this._yScaleNice = false;
		this._xTickFormat = d3.format("d");
		this._yTickFormat = d3.format("d");
		this._xTicks = null;
		this._yTicks = make_default_y_ticks_accessor(this);
		this._fill = "#333";
		this._fillOpacity = null;
		this._stroke = null;
		this._strokeOpacity = null;
		this._strokeWidth = null;
		this._opacity = null;
		this._showInfo = true;
		this._infoWidth = 100;
		this._infoHtml = null;
		this._percentRevealed = 100;
		this._lineMap = null;
		this._lineStroke = "black";
		this._lineStrokeWidth = null;
		this._lineStrokeOpacity = null;
		this._xHighlighter = null;
	}

	function default_x_accessor(d, i) {
		if (this._mode == "bar") return this._value(d, i);
		if ("x" in d) return d.x;
		else if (0 in d) return d[0];
		else throw "Default x accessor failed for " + JSON.stringify(d);
	}

	function default_y_accessor(d, i) {
		if (this._mode == "bar") return i;
		if ("y" in d) return d.y;
		else if (1 in d) return d[1];
		else throw "Default y accessor failed for " + JSON.stringify(d);
	}

	function default_name_accessor(d, i) {
		return "";
	}

	function default_value_accessor(d, i) {
		return d;
	}

	function make_default_y_ticks_accessor(chart) {
		return function() {
			if (chart._mode == "bar") return 0;
			else return null;
		};
	}

	// Create accessor methods for all the _parameters defined by the constructor
	function accessor(proto, k) {
		if (k.length > 0 && k.charAt(0) == "_") {
			proto[k.substr(1)] = function(v) {
				if (typeof v == "undefined") return this[k];
				if (arguments.length > 1) {
					this[k + "_array"] = [];
					for (var i = 0; i < arguments.length; i++) {
						this[k + "_array"][i] = arguments[i];
					}
				} else {
					delete this[k + "_array"];
				}
				this[k] = v;
				this.updated[k.substr(1)] = true;
				return this;
			};
		}
	}
	for (var k in new Chart("*")) {
		accessor(Chart.prototype, k);
	}

	// Special accessor function for margin
	Chart.prototype.margin = function Chart_margin(options) {
		if (!options) return this._margin;
		for (k in options) {
			if (k in this._margin) this._margin[k] = options[k];
			else throw "Kiln.chart.margin: unrecognised option " + k;
		}
		return this;
	};

	Chart.prototype._finiteExtent = function Chart__finiteExtent(data, accessor, scale) {
		var min = Infinity, max = -Infinity;
		for (var i = 0; i < data.length; i++) {
			var d = parseFloat(accessor.call(this, data[i], i));
			if (isFinite(scale(d))) {
				if (d < min) min = d;
				if (d > max) max = d;
			}
		}
		return [min, max];
	}

	Chart.prototype.getXDomain = function Chart_getXDomain() {
		if (this._xDomain) return v(this._xDomain);
		var extent = this._finiteExtent(this.getFlatData(), this._x, this._xScale());
		if (this._mode == "bar") extent[0] = 0;
		return extent;
	};

	Chart.prototype.getYDomain = function Chart_getYDomain() {
		if (this._yDomain) return v(this._yDomain);
		var extent = this._finiteExtent(this.getFlatData(), this._y, this._yScale());
		if (this._mode == "bar") extent[1]++;
		return extent;
	};

	Chart.prototype.getData = function Chart_getData() {
		var data = this._data;
		if (this._dataMap) data = data.map(this._dataMap);
		return data;
	};

	Chart.prototype.getFlatData = function Chart_getFlatData() {
		var data = this.getData();
		if (this._mode == "line") return d3.merge(data);
		return data;
	};

	Chart.prototype.getLineData = function Chart_getLineData() {
		if (!this._lineMap) return [];
		var data = this._data;
		if (this._lineMap) data = data.map(this._lineMap);
		return data;
	};

	Chart.prototype.scales = function Chart_scales() {
		var r = {};

		var rect;
		if (!this._width || !this._height) rect = this.container.node().getBoundingClientRect();
		r.svg_w = this._width || rect.width;
		r.svg_h = this._height || rect.height;

		r.plot_w = r.svg_w - this._margin.left - this._margin.right;
		r.plot_h = r.svg_h - this._margin.top - this._margin.bottom;

		r.x = this._xScale().range([0, r.plot_w]).domain(this.getXDomain());
		if (this._xScaleNice) r.x.nice();
		r.xAxis = d3.svg.axis().scale(r.x).tickFormat(this._xTickFormat);
		if (this._xTicks_array) {
			r.xAxis.ticks(this._xTicks_array[0], this._xTicks_array[1]);
		} else {
			r.xAxis.ticks(this._xTicks);
		}

		r.y = this._yScale().range([r.plot_h, 0]).domain(this.getYDomain());
		if (this._yScaleNice) r.y.nice();
		r.yAxis = d3.svg.axis().scale(r.y).orient("left").tickFormat(this._yTickFormat);
		if (this._yTicks_array) {
			r.yAxis.ticks(this._yTicks_array[0], this._yTicks_array[1]);
		} else {
			r.yAxis.ticks(v(this._yTicks));
		}

		var chart = this;
		r.x_ = function(d, i) {
			var v = r.x(chart._x(d, i));
			return isFinite(v) ? v : 0;
		};
		r.y_ = function(d, i) {
			var v = r.y(chart._y(d, i));
			return isFinite(v) ? v : r.svg_h;
		};

		var voronoi = d3.geom.voronoi()
			.x(r.x_)
			.y(r.y_)
			.clipExtent([[0, 0], [r.plot_w, r.plot_h]]);

		r.voronoi = function(data) {
			// Filter out duplicate points
			var deduped = [];
			var seen = {};
			// Backwards because we want later points to have precedence
			for (var i = data.length-1; i >= 0; i--) {
				var d = data[i];
				var p = [r.x_(d), r.y_(d)].join(";");
				if (!(p in seen)) {
					deduped.push(d);
					seen[p] = true;
				}
			}
			return voronoi(deduped);
		};

		return r;
	};

	Chart.prototype.__showInfo = function Chart___showInfo(d, i) {
		if (!v(this._showInfo, d, i)) {
			this.__hideInfo();
			return;
		}

		var chart = this;
		var scales = this.scales();
		var info_layer = this.container.select(".info-layer");

		var triangle_height = 8,
		    triangle_halfwidth = 8,
		    infobox_margin = 8;

		var iw = function(d, i) {
			return v(chart._infoWidth, d, i);
		},
		    bottom  = function(d, i) { return scales.y_(d, i) + chart._margin.top - triangle_height; };

		var bg = info_layer.select("svg").selectAll("g").data([d]);
		var bg_enter = bg.enter().append("g").attr("filter", "url(#dropshadow-" + this.unique_id + ")").attr("fill", "white").attr("class", "popup-background");
		bg_enter.append("rect").attr("rx", 5);
		bg_enter.append("polygon");

		var fg = info_layer.selectAll("div").data([d]);
		fg.enter().append("div").style("position", "absolute").attr("class", "popup-text")
			.style("padding", "3px").style("text-align", "center");
		fg.style("top", null)
			.style("bottom", function(d, i) { return (scales.svg_h - bottom(d, i)) + "px"; })
			.style("min-width", function(d, i) { return iw(d, i) + "px"; })
			.style("max-width", function(d, i) { return (iw(d, i) + 50) + "px"; })
			.style("height", "auto")
			.html(this._infoHtml);

		var r = fg.node().getBoundingClientRect(),
			w = r.width, h = r.height,
			left = function(d, i) {
				return scales.x_(d, i) + chart._margin.left - w / 2;
			},
			top = function(d, i) { return bottom(d) - h; };

		do {
			var nr = fg.node().getBoundingClientRect();
			w = nr.width;
			h = nr.height;
			fg.style("left", function(d, i) { return Math.min(left(d, i), scales.svg_w - infobox_margin - w) + "px"; });
		} while (nr.width != w);

		if (top(d) < 0) {
			top = function(d, i) { return chart._margin.top + scales.y_(d, i) + triangle_height; };
			bottom = function(d, i) { return top(d, i) + h; };
			fg.style("bottom", null).style("top", function(d, i) { return top(d, i) + "px"; });

			bg.select("polygon").attr("points", [
				[w/2 - triangle_halfwidth, 1],
				[w/2 + triangle_halfwidth, 1],
				[w/2, -triangle_height]
			].map(function(p) { return p[0] + "," + p[1]; }).join(" "));
		}
		else {
			bg.select("polygon").attr("points", [
				[w/2 - triangle_halfwidth, h - 1],
				[w/2 + triangle_halfwidth, h - 1],
				[w/2, h + triangle_height]
			].map(function(p) { return p[0] + "," + p[1]; }).join(" "));
		}

		bg.select("rect").attr("x", function(d, i) {
			return -Math.max(0, left(d, i) + w - (scales.svg_w - infobox_margin));
		});

		bg.attr("transform", function(d, i) {
			return "translate(" + left(d, i) + "," + top(d, i) + ")";
		});
		bg.select("rect").attr("width", w).attr("height", h);
	};

	Chart.prototype.__hideInfo = function Chart___hideInfo() {
		this.container.select(".info-layer > div").remove();
		this.container.select(".info-layer > svg > g").remove();
	};

	Chart.prototype.voronoiMouseover = function Chart_voronoiMouseover() {
		var chart = this;
		return function(d, i) {
			switch(chart._mode) {
				case "scatter":
					chart.container.selectAll(".selectable.scatter-point").classed("selected", function(e, j) {
						return i == j;
					});
					chart.__showInfo(d.point, i);
					break;
				case "line":
					chart.__showInfo(d.point, i);
					break;
				default:
					throw "Mode not implemented: " + chart._mode;
			}
		};
	};

	function _voronoiPath(d, i) {
		if (d.length == 0) return "M0,0";
		return "M" + d.join(",") + "Z";
	}

	Chart.prototype.__selectablePoint = function Chart___selectablePoint() {
		var chart = this;
		return function(d, i) {
			return (chart._infoHtml && v(chart._infoHtml, d, i) != null);
		};
	};

	Chart.prototype.draw = function Chart_draw() {
		var chart = this;
		var scales = this.scales();

		this.container.selectAll(".layer").remove();

		var chart_layer = this.container.append("svg").attr("class", "layer chart-layer")
			.style("position", "absolute")
			.attr("width", scales.svg_w).attr("height", scales.svg_h);
		var plot = chart_layer.append("g").attr("class", "plot")
			.attr("transform", "translate(" + this._margin.left + "," + this._margin.top + ")");
		var info_layer = this.container.append("div").attr("class", "layer info-layer")
			.style("position", "absolute")
			.style("width", scales.svg_w + "px")
			.style("height", scales.svg_h + "px")
			.style("left", 0).style("top", 0);
		var info_layer_svg = info_layer.append("svg")
			.style("position", "absolute")
			.attr("width", scales.svg_w).attr("height", scales.svg_h);
		var info_layer_svg_filter = info_layer_svg.append("filter").attr("classed", "dropshadow").attr("id", "dropshadow-" + this.unique_id).attr("height", "130%");
		info_layer_svg_filter.append("feGaussianBlur").attr("in", "SourceAlpha").attr("stdDeviation", 5);
		info_layer_svg_filter.append("feOffset").attr("dx", 0).attr("dy", 2).attr("result", "offsetblur");
		info_layer_svg_filter.append("feComponentTransfer").append("feFuncA").attr("type", "linear").attr("slope", 0.2);
		var fe_merge = info_layer_svg_filter.append("feMerge");
		fe_merge.append("feMergeNode");
		fe_merge.append("feMergeNode").attr("in", "SourceGraphic");

		var interaction_layer = this.container.append("svg").attr("class", "layer interaction-layer")
			.style("position", "absolute")
			.attr("width", scales.svg_w).attr("height", scales.svg_h)
			.on("mouseout", function() { chart.__hideInfo(); });
		var interaction_group = interaction_layer.append("g").attr("class", "interaction")
			.attr("transform", "translate(" + this._margin.left + "," + this._margin.top + ")");

		switch(this._mode) {
			case "scatter":
				this.__drawScatter(plot, scales);
				break;
			case "line":
				this.__drawLine(plot, scales);
				break;
			case "bar":
				this.__drawBar(plot, scales);
				break;
			default:
				throw "Mode not implemented: " + this._mode;
		}

		// Draw the axes
		plot.append("g").attr("class", "x axis")
			.attr("transform", "translate(0, " + scales.plot_h + ")").call(scales.xAxis);
		plot.append("g").attr("class", "y axis").call(scales.yAxis);

		// Set default attribute styles on axis
		d3.selectAll(".axis")
			.attr("font-size", 8 + scales.svg_w/50)
			.selectAll(".domain")
				.attr("fill", "none")
				.attr("stroke", "black");

		// Label the axes
		if (this._xLabel) {
			plot.append("text").attr("class", "x axis-label")
				.attr("transform", "translate(" + scales.plot_w/2 + "," + (scales.svg_h - this._margin.bottom/2 + 10) + ")")
				.attr("text-anchor", "middle")
				.text(this._xLabel);
		}

		if (this._yLabel) {
			plot.append("text").attr("class", "y axis-label")
				.attr("transform", "rotate(-90) translate(" + -scales.plot_h/2 + "," + -(this._margin.left/2 + 5) + ")")
				.attr("text-anchor", "middle")
				.text(this._yLabel);
		}

		// Add any highlighter lines
		if (chart._xHighlighter) {
			var highlighter_x = scales.x(chart._xHighlighter);
			plot.selectAll("g.x-highlighter").data([chart._xHighlighter])
				.enter().append("g").attr("class", "x-highlighter")
				.attr("transform", "translate(" + highlighter_x + ", 0)")
				.append("line").attr("class", "x-highlighter-line")
					.attr("y1", 0)
					.attr("y2", scales.plot_h)
					.attr("stroke", "black")
					.attr("opacity", 0.25)
					.attr("stroke-width", 1.5);
		}

		// Add voronoi polygons for nearest-point mouse handling
		var selectable_points = this.getFlatData().filter(this.__selectablePoint());
		var vp = scales.voronoi(selectable_points);
		interaction_group.selectAll(".voronoi").data(vp)
			.enter().append("path").attr("class", "voronoi")
			.attr("d", _voronoiPath)
			.attr("fill", "none").attr("pointer-events", "all")
			.on("mouseover", this.voronoiMouseover());

		return this;
	};

	Chart.prototype.__pointTransform = function Chart___pointTransform(scales) {
		return function(d, i) {
			return "translate(" + scales.x_(d, i) + "," + scales.y_(d, i) + ")";
		};
	};

	Chart.prototype.__pointValid = function Chart___pointValid(scales) {
		var that = this;
		return function(d, i) {
			var x = scales.x(that._x(d, i)),
			    y = scales.y(that._y(d, i));
			return isFinite(x) && isFinite(y);
		};
	};

	Chart.prototype.__pointOpacity = function Chart___pointOpacity(scales) {
		var pv = this.__pointValid(scales),
		    chart = this;
		return function(d, i) {
			if (!pv(d, i)) return 0;
			var o = v(chart._opacity, d);
			return o == null ? 1 : o;
		};
	};

	Chart.prototype.__drawScatter = function Chart___drawScatter(plot, scales) {
		// Lines
		var l = plot.selectAll(".scatter-line").data(this.getLineData());
		l.enter().append("path")
			.attr("class", function(d, i) { return "scatter-line n-" + i; })
			.attr("fill", "none");
		l.attr("d", this.__getLineGenerator(scales))
			.attr("stroke", this._lineStroke)
			.attr("stroke-width", this._lineStrokeWidth)
			.attr("stroke-opacity", this._lineStrokeOpacity);

		var s = plot.selectAll(".scatter-point").data(this.getData());
		var s_enter = s.enter().append("g")
			.attr("class", function(d, i) { return "scatter-point n-" + i; })
		s_enter.append("circle").attr("r", this._r);

		// Points
		s.classed("selectable", this.__selectablePoint());
		s.attr("transform", this.__pointTransform(scales));
		s.attr("fill", this._fill);
		s.attr("fill-opacity", this._fillOpacity);
		s.attr("stroke", this._stroke);
		s.attr("stroke-opacity", this._strokeOpacity);
		s.attr("opacity", this.__pointOpacity(scales));
	};

	Chart.prototype.__updateScatter = function Chart___updateScatter(scales, t) {
		var plot = this.container.select(".plot");
		// Lines
		var l = plot.selectAll(".scatter-line").data(this.getLineData());
		l.enter().append("path").attr("class", "scatter-line").attr("fill", "none").attr("stroke", "white");
		t.each(function() { // The exit transition should inherit duration etc. from t
			l.exit().attr("opacity", 1).transition().attr("opacity", 0).remove();
		});
		t.selectAll(".scatter-line")
			.attr("d", this.__getLineGenerator(scales))
			.attr("stroke", this._lineStroke)
			.attr("stroke-width", this._lineStrokeWidth)
			.attr("stroke-opacity", this._lineStrokeOpacity);

		// Points
		var s = plot.selectAll(".scatter-point").data(this.getData());
		var s_enter = s.enter().append("g").attr("class", "scatter-point");
		s_enter.append("circle");
		t.each(function() { // The exit transition should inherit duration etc. from t
			s.exit().attr("opacity", 1).transition().attr("opacity", 0).remove();
		});

		s.classed("selectable", this.__selectablePoint());

		t.selectAll(".scatter-point")
			.attr("transform", this.__pointTransform(scales))
			.attr("fill", this._fill)
			.attr("fill-opacity", this._fillOpacity)
			.attr("stroke", this._stroke)
			.attr("stroke-opacity", this._strokeOpacity)
			.attr("opacity", this.__pointOpacity(scales))
			.select("circle").attr("r", this._r);
	};

	Chart.prototype.__getLineGenerator = function Chart___getLineGenerator(scales) {
		var that = this;
		return d3.svg.line()
			.x(scales.x_)
			.y(scales.y_);
	};

	Chart.prototype.__drawLine = function Chart___drawLine(plot, scales) {
		var chart = this;
		var s = plot.selectAll(".line-line").data(this.getData());
		var s_enter = s.enter().append("g").attr("class", "line-line");
		s_enter.append("clipPath").attr("id", function(d, i) {
			return "plot-clip-" + chart.unique_id + "-" + i;
		}).append("rect")
			.attr("width", function(d, i) {
				return v(chart._percentRevealed, d, i) * scales.plot_w/100;
			})
			.attr("height", scales.plot_h);
		s_enter.append("path").attr("clip-path", function(d, i) {
			return "url(#plot-clip-" + chart.unique_id + "-" + i + ")";
		});

		s.select("path")
			.attr("d", this.__getLineGenerator(scales))
			.attr("stroke", this._stroke || "#000")
			.attr("opacity", this._opacity)
			.attr("stroke-opacity", this._strokeOpacity)
			.attr("stroke-width", this._strokeWidth)
			.attr("fill", "none");
	};

	Chart.prototype.__updateLine = function Chart___updateLine(scales, t) {
		var chart = this;
		var plot = this.container.select(".plot");
		var s = plot.selectAll(".line-line").data(this.getData());
		var s_enter = s.enter().append("g").attr("class", "line-line");
		s_enter.append("path").attr("clip-path", "url(#plot-clip-" + this.unique_id + ")");
		t.each(function() {
			s.exit().attr("opacity", 1).transition().attr("opacity", 0).remove();
		});

		t.selectAll(".line-line").select("path")
			.attr("d", this.__getLineGenerator(scales))
			.attr("stroke", this._stroke || "#000")
			.attr("opacity", this._opacity)
			.attr("stroke-opacity", this._strokeOpacity)
			.attr("stroke-width", this._strokeWidth)
			.attr("fill", "none");
		t.selectAll(".line-line clipPath rect")
			.attr("width", function(d, i) {
				return v(chart._percentRevealed, d, i) * scales.plot_w/100;
			});
	};

	// Bar charts
	Chart.prototype.__drawBar = function Chart___drawBar(plot, scales) {
		var data = this.getData();
		var s = plot.selectAll(".bar-bar").data(data);
		var s_enter = s.enter().append("g").attr("class", "bar-bar");
		var chart = this;
		var bar_height_inc_padding = scales.plot_h / data.length;
		s_enter.append("rect");
		s_enter.append("text").attr("class", "bar-name axis");
		if (chart._barValues) s_enter.append("text").attr("class", "bar-value");
		s.select("rect")
			.attr("width", scales.x_)
			.attr("height", function(d, i) { return bar_height_inc_padding - 2*v(chart._barPadding, d, i); })
			.attr("y", function(d, i) { return scales.y_(d, i+1) + v(chart._barPadding, d, i); })
			.attr("stroke", this._stroke || "#000")
			.attr("opacity", this._opacity)
			.attr("stroke-opacity", this._strokeOpacity)
			.attr("stroke-width", this._strokeWidth)
			.attr("fill", this._fill)
			.attr("fill-opacity", this._fillOpacity);
		s.select(".bar-name")
			.attr("x", function(d, i) { return -v(chart._barNamePadding, d, i); })
			.attr("y", function(d, i) { return scales.y_(d, i) - bar_height_inc_padding / 2; })
			.attr("dy", 3)
			.attr("text-anchor", "end")
			.text(chart._name);
		if (chart._barValues) {
			s.select(".bar-value")
				.attr("x", function(d) { return scales.x_(d) + 1; })
				.attr("y", function(d, i) { return scales.y_(d, i) - bar_height_inc_padding / 2; })
				.attr("font-size", function(d, i) { return bar_height_inc_padding - 2*v(chart._barPadding, d, i); })
				.attr("dy", 3)
				.text(function(d) { return d3.round(d, chart._barValuesPrecision) + (chart._barValuesUnit || ""); });
		}
	};

	Chart.prototype.__updateBar = function Chart___updateBar(scales, t) {
		var plot = this.container.select(".plot");
		var data = this.getData();
		var s = plot.selectAll(".bar-bar").data(data);
		var s_enter = s.enter().append("g").attr("class", "bar-bar");
		var chart = this;
		var bar_height_inc_padding = scales.plot_h / data.length;
		s_enter.append("rect")
			.attr("height", 0).attr("width", 0)
			.attr("fill", this._fill);
		s_enter.append("text").attr("class", "bar-name axis");
		if (chart._barValues) s_enter.append("text").attr("class", "bar-value");
		t.each(function() {
			s.exit().transition().remove();
		});
		t.selectAll(".bar-bar").select("rect")
			.attr("width", scales.x_)
			.attr("height", function(d, i) { return bar_height_inc_padding - 2*v(chart._barPadding, d, i); })
			.attr("y", function(d, i) { return scales.y_(d, i+1) + v(chart._barPadding, d, i); })
			.attr("stroke", this._stroke || "#000")
			.attr("opacity", this._opacity)
			.attr("stroke-opacity", this._strokeOpacity)
			.attr("stroke-width", this._strokeWidth)
			.attr("fill", this._fill)
			.attr("fill-opacity", this._fillOpacity);
		t.selectAll(".bar-bar").select(".bar-name")
			.attr("x", function(d, i) { return -v(chart._barNamePadding, d, i); })
			.attr("y", function(d, i) { return scales.y_(d, i) - bar_height_inc_padding / 2; })
			.attr("dy", 3)
			.attr("text-anchor", "end")
			.text(chart._name);
		if (chart._barValues) {
			t.selectAll(".bar-bar").select(".bar-value")
				.attr("x", function(d) { return scales.x_(d) + 1; })
				.attr("font-size", function(d, i) { return bar_height_inc_padding - 2*v(chart._barPadding, d, i); })
				.attr("y", function(d, i) { return scales.y_(d, i) - bar_height_inc_padding / 2; })
				.attr("dy", 3)
				.text(function(d) { return d3.round(d, chart._barValuesPrecision) + (chart._barValuesUnit || ""); });
		}
	};

	// Transitions
	function ChartTransition(chart) {
		var t = this.transition = chart.container.transition("Kiln.chart").duration(750);
		var scales = chart.scales();
		var plot = chart.container.select(".plot");

		t.each("start", function() {
			// Update the axes
			var scales = chart.scales();

			// If the chart is no longer visible, just bail out
			if (scales.svg_w == 0 || scales.svg_h == 0) return;

			t.select(".x.axis").call(scales.xAxis);
			t.select(".y.axis").call(scales.yAxis);

			// Label the axes
			if (chart._xLabel) plot.select(".x.axis-label").text(chart._xLabel);
			else plot.select(".x.axis-label").remove();
			if (chart._yLabel) plot.select(".y.axis-label").text(chart._yLabel);
			else plot.select(".y.axis-label").remove();

			var x_highlighters = [];
			if (chart._xHighlighter) x_highlighters.push(scales.x(chart._xHighlighter));

			var xh = plot.selectAll("g.x-highlighter").data(x_highlighters);
			xh.enter().append("g")
				.attr("class", "x-highlighter")
				.append("line").attr("class", "x-highlighter-line")
				.attr("y1", 0)
				.attr("y2", scales.plot_h)
				.attr("stroke", "black")
				.attr("opacity", 0.25)
				.attr("stroke-width", 1.5);
			xh.exit().remove();
			t.selectAll("g.x-highlighter")
				.attr("transform", function(d) {
					return "translate(" + d + ", 0)";
				});

			switch(chart._mode) {
				case "scatter":
					chart.__updateScatter(scales, t);
					break;
				case "line":
					chart.__updateLine(scales, t);
					break;
				case "bar":
					chart.__updateBar(scales, t);
					break;
				default:
					throw "Mode not implemented: " + chart._mode;
			}

			chart.__hideInfo();
		});

		var interaction = chart.container.select(".interaction");
		var selectable_points = chart.getFlatData().filter(chart.__selectablePoint());
		var voronoi_regions = interaction.selectAll(".voronoi").data(scales.voronoi(selectable_points));
		voronoi_regions.enter().append("path").attr("class", "voronoi")
			.attr("fill", "none").attr("pointer-events", "all")
			.on("mouseover", chart.voronoiMouseover());
		voronoi_regions.exit().remove();
		voronoi_regions.attr("d", _voronoiPath);
	}
	ChartTransition.prototype.duration = function ChartTransition_duration() {
		return this.transition.duration.apply(this.transition, arguments);
	};
	ChartTransition.prototype.delay = function ChartTransition_duration() {
		return this.transition.delay.apply(this.transition, arguments);
	};
	ChartTransition.prototype.ease = function ChartTransition_duration() {
		return this.transition.delay.apply(this.transition, arguments);
	};

	// Animate the chart to a new state, without changing the container dimensions.
	Chart.prototype.update = function Chart_update() {
		return new ChartTransition(this);
	};

	function Kiln_chart(selector) {
		return new Chart(selector);
	}
	Kiln_chart.version = VERSION;

	return Kiln_chart;
})();
