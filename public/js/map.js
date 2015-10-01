(function($, d3, PetitionMap) {
  PetitionMap.current_petition = PetitionMap.current_petition || undefined;
  PetitionMap.mp_data = PetitionMap.mp_data || undefined;

  var width, height;

  var projection, svg, path, g;
  var boundaries, units;

  // Zoom variables
  var zoom = d3.behavior.zoom().scaleExtent([1, 8]).on("zoom", zoomed);
  var translate_saved = [0, 0];
  var scale_saved = 1;

  var active = d3.select(null);

  // Party colour class names
  var parties = [
      "Conservative",
      "Green",
      "Independent",
      "Labour",
      "LabourCooperative",
      "LiberalDemocrat",
      "PlaidCymru",
      "ScottishNationalParty",
      "Speaker",
      "UKIP"
  ];

  compute_size();
  init(width, height);

  // Compute size for map
  function compute_size() {
      width = parseInt(d3.select("#map").style("width"));
      height = $('main').innerHeight();
  }

  // Initialise map
  function init(width, height) {
      projection = d3.geo.albers()
          .rotate([0, 0]);

      path = d3.geo.path()
          .projection(projection);

      svg = d3.select("#map").append("svg")
          .attr("width", width)
          .attr("height", height)
          .append("g")
              .call(zoom)
          .on("click", stopped, true);

      g = svg.append("g");
  }

  // Draw map on SVG element
  function draw(boundaries) {

      projection
          .scale(1)
          .translate([0,0]);

      // Compute the correct bounds and scaling from the topoJSON
      var b = path.bounds(topojson.feature(boundaries, boundaries.objects[units]));
      var s = .95 / Math.max((b[1][0] - b[0][0]) / width, (b[1][1] - b[0][1]) / height);
      var t;

      var area = $("input[name='area']:checked").val();
      if (area === "lon") {
          t = [((width - s * (b[1][0] + b[0][0])) / 2.25), (height - s * (b[1][1] + b[0][1])) / 2];
      } else if (area === "gb") {
          t = [((width - s * (b[1][0] + b[0][0])) / 1.95), (height - s * (b[1][1] + b[0][1])) / 2];
      } else {
          t = [((width - s * (b[1][0] + b[0][0])) / 1.85), (height - s * (b[1][1] + b[0][1])) / 2];
      }

      projection
          .scale(s)
          .translate(t);

      // Add an area for each feature in the topoJSON (constituency)
      g.selectAll(".area")
          .data(topojson.feature(boundaries, boundaries.objects[units]).features)
          .enter().append("path")
          .attr("class", "area")
          .attr("id", function(d) {return d.id})
          .attr("d", path)
          .attr('vector-effect', 'non-scaling-stroke')
          .on("mouseenter", function(d){ return selectConstituency(d) })
          .on("mouseleave", function(d){ return deselectConstituency(d) });

      // Add a boundary between areas
      g.append("path")
          .datum(topojson.mesh(boundaries, boundaries.objects[units], function(a, b){ return a !== b }))
          .attr('d', path)
          .attr('class', 'boundary')
          .attr('vector-effect', 'non-scaling-stroke');
  }


  ////////////////////////////////////////////////////////////////////////


  // Redraw the map - remove map completely and start from scratch
  function redraw() {
      compute_size();

      d3.select("svg").remove();

      init(width, height);
      draw(boundaries);
      recolour_map();
      svg.attr("transform", "translate(" + translate_saved + ")scale(" + scale_saved + ")");
  }

  // Loads data from the given file and redraws and recolours the map
  function loadMapData(filename, new_units) {
    units = new_units;

    return $.getJSON(filename)
      .done(function(data) {
        boundaries = data;
        redraw();
        recolour_map();
        interpolate_zoom_and_pan(translate_saved, scale_saved);
      })
      .fail(function(error) {
        console.error(error);
      });
  }

  // Recolour the map for a given petition
  function recolour_map() {
      highest_count = get_highest_count();
      slices = calculate_slices(highest_count);
      colour_classes(slices);
  }


  ////////////////////////////////////////////////////////////////////////


  // Get the highest constituency signature count
  function get_highest_count() {
      var highest_count = 0;
      var top_constituency;

      constituencies = PetitionMap.current_petition.data.attributes.signatures_by_constituency;
      $.each(constituencies, function (index, item) {
          if (item.signature_count >= highest_count) {
              highest_count = item.signature_count;
              top_constituency = item.name;
          }
      });

      return highest_count;
  }

  // Calculate the ranges for signature colouring based on highest count
  function calculate_slices(highest_count) {
      var goalBinSize = Math.floor(highest_count / 8)
      var roundBy = Math.pow(10, Math.floor(goalBinSize.toString().length / 2))
      var binSize = Math.round(goalBinSize/ roundBy) * roundBy;

      slices = {};
      for (i = 0; i <= 8; i++) {
          slices[i] = i * Math.round(goalBinSize / roundBy) * roundBy;
      }

      for (i = 0; i <= 8; i++) {
          $('#t' + (i+1)).html("");
          if (i === 0) {
              $('#t' + (i+1)).html("1 - " +  slices[i + 1]);
          } else if (i === 7) {
              $('#t' + (i + 1)).html(slices[i] + " +");
          } else {
              $('#t' + (i + 1)).html(slices[i] + " - " +  slices[i + 1]);
          }
      }

      return slices;
  }

  // Colour the areas on the map based on their place in the ranges
  function colour_classes(slices) {
      d3.selectAll(".coloured").attr("class", "area");

      constituencies = PetitionMap.current_petition.data.attributes.signatures_by_constituency;
      $.each(constituencies, function (index, item) {
          var id = "#" + item.ons_code;
          var index = place_in_array(slices, item.signature_count);
          var colour_class = "c" + index + " coloured";
          d3.select(id)
              .attr("class", colour_class);
      });
  }


  // Find the place of constituency in the slices array
  function place_in_array(slices, count) {
      var slice = slices[1];
      for (i = 0; i < 8; i++) {
          if (count >= slices[i] && count < (slices[i] + slice)) {
              return i+1;
          }
          if (count >= slice * 8) {
              return 8;
          }
      }
  }


  ////////////////////////////////////////////////////////////////////////


  // Show constituency info and party colours on select
  // (hover on desktop or click on mobile)
  function selectConstituency(constituency) {
    var mpForConstituency = PetitionMap.mp_data[constituency.id],
      party_class = strip_whitespace(mpForConstituency.party);
      deselect_party_colours();
      d3.select("#" + constituency.id).classed(party_class, true);
      d3.select("#" + constituency.id).classed("selected_boundary", true);

      $('#constituency_info').fadeIn("fast");
      $('#constituency_info').html("");
      var name, mp, count, party,
        data_found;
      $.each(PetitionMap.current_petition.data.attributes.signatures_by_constituency, function(i, v) {
          if (v.ons_code === constituency.id) {
              name = v.name;
              mp = v.mp;
              party = mpForConstituency.party;
              count = v.signature_count;
              data_found = true;
              return;
          }
      });
      if (!data_found) {
          name = mpForConstituency.constituency;
          mp = mpForConstituency.mp;
          party = mpForConstituency.party;
          count = "0";
      }

      $('#constituency_info').append('<h2>' + name + "</h2>");
      $('#constituency_info').append('<p class="mp">' + mp + '</p>');
      $('#constituency_info').append('<p class="party">' + party + '</p>');
      $('#constituency_info').append('<p class="signatures_count"><span class="data">' + numberWithCommas(count) + '</span> signatures</p>');
  }

  // Remove classes from other constituencies on deselect
  function deselectConstituency(constituency) {
      var party_class = strip_whitespace(PetitionMap.mp_data[constituency.id].party);
      d3.select("#" + constituency.id).classed(party_class, false);
      d3.select("#" + constituency.id).classed("selected_boundary", false);

      $('#constituency_info').show();
  }

  // Removes all other party colour classes from constituencies
  function deselect_party_colours() {
      $.each(parties, function (index, item) {
          d3.selectAll(".area").classed(item, false);
          d3.selectAll(".coloured").classed(item, false);
      });
      d3.selectAll(".selected_boundary").classed("selected_boundary", false);
  }

  ////////////////////////////////////////////////////////////////////////


  // Strips whitespace from a string
  function strip_whitespace(string) {
      return string.replace(/[^a-zA-Z]/g, '');
  }

  // Adds commas to a number (e.g. 1000 to 1,000)
  function numberWithCommas(x) {
      return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }


  ////////////////////////////////////////////////////////////////////////


  // Zoom and pan transition
  function interpolate_zoom_and_pan(translate, scale) {
      translate_saved = translate;
      scale_saved = scale;
      var self = this;
      return d3.transition().duration(350).tween("zoom", function () {
          var iTranslate = d3.interpolate(zoom.translate(), translate),
              iScale = d3.interpolate(zoom.scale(), scale);
          return function (t) {
              zoom
                  .scale(iScale(t))
                  .translate(iTranslate(t));
              zoomed();
          };
      });
  }

  // Zoom in and out based on plus or minus button
  function zoom_button() {
      var clicked = d3.event.target,
          direction = 1,
          factor = 0.2,
          target_zoom = 1,
          center = [width / 2, height / 2],
          extent = zoom.scaleExtent(),
          translate = zoom.translate(),
          translate0 = [],
          l = [],
          view = {x: translate[0], y: translate[1], k: zoom.scale()};

      d3.event.preventDefault();
      direction = (this.id === 'zoom_in') ? 1 : -1;
      target_zoom = zoom.scale() * (1 + factor * direction);

      if (target_zoom < extent[0] || target_zoom > extent[1]) { return false; }

      translate0 = [(center[0] - view.x) / view.k, (center[1] - view.y) / view.k];
      view.k = target_zoom;
      l = [translate0[0] * view.k + view.x, translate0[1] * view.k + view.y];

      view.x += center[0] - l[0];
      view.y += center[1] - l[1];

      interpolate_zoom_and_pan([view.x, view.y], view.k);
  }

  function zoomed() {
    svg.attr("transform", "translate(" + zoom.translate() + ")scale(" + zoom.scale() + ")");
  }

  function stopped() {
    if (d3.event.defaultPrevented) d3.event.stopPropagation();
  }

  // Reset scale and translation
  function resetMapState() {
      active.classed("active", false);
      active = d3.select(null);

      svg.transition()
          .call(zoom.translate([0, 0]).scale(1).event);

      translate_saved = [0, 0];
      scale_saved = 1;
  }

  // Pan around based on N, E, S, W buttons
  function pan_button() {
      var clicked = d3.event.target,
          offsetX = 0,
          offsetY = 0,
          center = [width / 2, height / 2],
          translate = zoom.translate(),
          translate0 = [],
          l = [],
          view = {x: translate[0], y: translate[1], k: zoom.scale()};

      d3.event.preventDefault();
      if (this.id == 'pan_west') {
        offsetX -= 50;
      } else if (this.id === 'pan_north') {
        offsetY -= 50;
      } else if (this.id === 'pan_south') {
        offsetY += 50;
      } else if (this.id === 'pan_east') {
        offsetX += 50;
      }

      translate0 = [(center[0] - view.x) / view.k, (center[1] - view.y) / view.k];
      l = [translate0[0] * view.k + view.x + offsetX, translate0[1] * view.k + view.y + offsetY];

      view.x += center[0] - l[0];
      view.y += center[1] - l[1];

      interpolate_zoom_and_pan([view.x, view.y], view.k);
  }

  ////////////////////////////////////////////////////////////////////////

  // Button to reset zoom
  $("#reset").on('click', resetMapState);

  // Buttons to zoom in and out
  d3.selectAll('.zoom').on('click', zoom_button);

  // Buttons to pan around
  d3.selectAll('.pan').on('click', pan_button);

  // when the window is resized, redraw the map
  window.addEventListener('resize', redraw);

  PetitionMap.selectConstituency = selectConstituency;
  PetitionMap.loadMapData = loadMapData;
  PetitionMap.resetMapState = resetMapState;
  PetitionMap.numberWithCommas = numberWithCommas;

})(window.jQuery, window.d3, window.PetitionMap = window.PetitionMap || {});
